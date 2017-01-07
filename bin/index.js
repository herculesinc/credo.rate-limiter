"use strict";
// IMPORTS
// ================================================================================================
const events = require("events");
const redis = require("redis");
const nova = require("nova-base");
// MODULE VARIABLES
// ================================================================================================
const since = nova.util.since;
const ERROR_EVENT = 'error';
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
        this.client = redis.createClient(config.redis);
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
            const timestamp = Date.now();
            const key = `credo::rate-limiter::${id}`;
            this.client.eval(script, 1, key, timestamp, options.window, options.limit, (error, result) => {
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
// LUA SCRIPT
// ================================================================================================
const script = `
	local timestamp = tonumber(ARGV[1])
	local window = tonumber(ARGV[2])
	local limit = tonumber(ARGV[3])
	local retryAfter = 0

	if redis.call("EXISTS", KEYS[1]) == 1 then
		redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", timestamp - window * 1000)
		if redis.call("ZCARD", KEYS[1]) >= limit then
			redis.call("ZREMRANGEBYRANK", KEYS[1], 0, 0)
			local first_timestamp = tonumber(redis.call("ZRANGE", KEYS[1], 0, 0)[1])
			retryAfter = window - math.ceil((timestamp - first_timestamp) / 1000)
		end
	end

	redis.call("ZADD", KEYS[1], timestamp, timestamp)
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