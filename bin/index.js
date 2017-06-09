"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const events = require("events");
const redis = require("redis");
const uuid = require("uuid");
const nova = require("nova-base");
// MODULE VARIABLES
// ================================================================================================
const since = nova.util.since;
const ERROR_EVENT = 'error';
const MAX_RETRY_TIME = 60000; // 1 minute
const MAX_RETRY_INTERVAL = 3000; // 3 seconds
const RETRY_INTERVAL_STEP = 200; // 200 milliseconds
// CLASS DEFINITION
// ================================================================================================
class RateLimiter extends events.EventEmitter {
    constructor(config, logger) {
        super();
        if (!config)
            throw TypeError('Cannot create Rate Limiter: config is undefined');
        if (!config.redis)
            throw TypeError('Cannot create Rate Limiter: redis settings are undefined');
        // initialize instance variables
        this.name = config.name || 'rate-limiter';
        this.client = redis.createClient(prepareRedisOptions(config.redis, this.name, logger));
        this.logger = logger;
        // error in redis connection should not bring down the service
        this.client.on('error', (error) => {
            this.emit(ERROR_EVENT, new RateLimiterError(error, 'Rate Limiter error'));
        });
    }
    try(id, options) {
        if (!id)
            throw new TypeError('Cannot check rate limit: id is undefined');
        if (!options)
            throw new TypeError('Cannot check rate limit: options are undefined');
        const start = process.hrtime();
        this.logger && this.logger.debug(`Checking rate limit for ${id}`, this.name);
        return new Promise((resolve, reject) => {
            const requestId = uuid.v1();
            const timestamp = Date.now();
            const key = `credo::rate-limiter::${id}`;
            this.client.eval(script, 1, key, requestId, timestamp, options.window, options.limit, (error, result) => {
                this.logger && this.logger.trace(this.name, 'try', since(start), !error);
                if (error) {
                    error = new RateLimiterError(error, 'Failed to check rate limit');
                    return reject(error);
                }
                if (result !== 0) {
                    return reject(new TooManyRequestsError(id, result));
                }
                resolve();
            });
        });
    }
}
exports.RateLimiter = RateLimiter;
// HELPER FUNCTIONS
// ================================================================================================
function prepareRedisOptions(options, limiterName, logger) {
    let redisOptions = options;
    // make sure retry strategy is defined
    if (!redisOptions.retry_strategy) {
        redisOptions = Object.assign({}, redisOptions, { retry_strategy: function (options) {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    return new Error('The server refused the connection');
                }
                else if (options.total_retry_time > MAX_RETRY_TIME) {
                    return new Error('Retry time exhausted');
                }
                logger && logger.warn('Redis connection lost. Trying to recconect', limiterName);
                return Math.min(options.attempt * RETRY_INTERVAL_STEP, MAX_RETRY_INTERVAL);
            } });
    }
    return redisOptions;
}
// LUA SCRIPT
// ================================================================================================
const script = `
    local requestId = ARGV[1]
	local timestamp = tonumber(ARGV[2])
	local window = tonumber(ARGV[3])
	local limit = tonumber(ARGV[4])
	local retryAfter = 0

	if redis.call("EXISTS", KEYS[1]) == 1 then
		redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, timestamp - window * 1000)
		if redis.call("ZCARD", KEYS[1]) >= limit then
			redis.call("ZREMRANGEBYRANK", KEYS[1], 0, 0)
			local firstTimestamp = tonumber(redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")[2])
			retryAfter = window - math.ceil((timestamp - firstTimestamp) / 1000)
		end
	end

	redis.call("ZADD", KEYS[1], timestamp, requestId)
	redis.call("EXPIRE", KEYS[1], window)
	return retryAfter
`;
// ERRORS
// ================================================================================================
class TooManyRequestsError extends nova.Exception {
    constructor(id, retryAfter) {
        super(`Rate limit exceeded for {${id}}`, 429 /* TooManyRequests */);
        this.id = id;
        this.retryAfter = retryAfter;
        this.headers = { 'Retry-After': retryAfter.toString() };
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            retryAfter: this.retryAfter
        };
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
class RateLimiterError extends nova.Exception {
    constructor(cause, message) {
        super({ cause, message });
    }
}
exports.RateLimiterError = RateLimiterError;
//# sourceMappingURL=index.js.map