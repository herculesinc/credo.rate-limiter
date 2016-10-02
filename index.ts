// IMPORTS
// ================================================================================================
import * as events from 'events';
import * as redis from 'redis';
import * as nova from 'nova-base';

// MODULE VARIABLES
// ================================================================================================
const since = nova.util.since;
const ERROR_EVENT = 'error';

// INTERFACES
// ================================================================================================
export interface RedisConnectionConfig {
	host            : string;
	port            : number;
	password        : string;
	prefix?         : string;
	retry_strategy? : (options: any) => number | Error;
}

export interface ConnectionRetryOptions {
	error           : Error;
	attempt         : number;
	total_retry_time: number;
	times_connected : number;
}

export interface RateLimiterConfig {
	name?       : string;
	redis       : RedisConnectionConfig;
}

// CLASS DEFINITION
// ================================================================================================
export class RateLimiter extends events.EventEmitter implements nova.RateLimiter {

	name	: string;
	client	: redis.RedisClient;
	logger?	: nova.Logger;
	
	constructor(config: RateLimiterConfig, logger?: nova.Logger) {
		super();

		if (!config) throw TypeError('Cannot create Rate Limiter: config is undefined');
		if (!config.redis) throw TypeError('Cannot create Rate Limiter: redis settings are undefined');

		// initialize instance variables
		this.name = config.name || 'rate-limiter';
		this.client = redis.createClient(config.redis);
		this.logger = logger;
        
        // error in redis connection should not bring down the service
        this.client.on('error', (error) => {
            this.emit(ERROR_EVENT, new RateLimiterError(error, 'Rate Limiter error'));
        });
	}
	
	try(id: string, options: nova.RateOptions): Promise<any> {
		if (!id) throw new TypeError('Cannot check rate limit: id is undefined');
		if (!options) throw new TypeError('Cannot check rate limit: options are undefined');

		const start = process.hrtime();
		this.logger && this.logger.debug(`Checking rate limit for ${id}`);
		
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

// LUA SCRIPT
// ================================================================================================
const script = `
	local timestamp = tonumber(ARGV[1])
	local window = tonumber(ARGV[2])
	local limit = tonumber(ARGV[3])
	
	if redis.call("EXISTS", KEYS[1]) == 1 then
		redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", timestamp - window * 1000)
		if redis.call("ZCOUNT", KEYS[1], "-inf", "+inf") >= limit then
			local first_timestamp = tonumber(redis.call("ZRANGE", KEYS[1], 0, 0)[1])
			return window - math.ceil((timestamp - first_timestamp) / 1000)
		end
	end
	
	redis.call("ZADD", KEYS[1], timestamp, timestamp)
	redis.call("EXPIRE", KEYS[1], window)
	return 0
`;

// ERRORS
// ================================================================================================
export class TooManyRequestsError extends nova.Exception {
	id			: string;
	retryAfter	: number;
	
    constructor(id: string, retryAfter: number) {
        super(`Rate limit exceeded for {${id}}`, nova.HttpStatusCode.TooManyRequests);

		this.id = id;
		this.retryAfter = retryAfter;
		this.headers = { 'Retry-After': retryAfter.toString() };
    }

    toJSON(): any {
        return {
            name    	: this.name,
            message 	: this.message,
			retryAfter	: this.retryAfter
        };
    }
}

export class RateLimiterError extends nova.Exception {
    constructor(cause: Error, message: string) {
        super({ cause, message });
    }
}