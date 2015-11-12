'use strict';
// IMPORTS
// ================================================================================================
import * as redis from 'redis';

// INTERFACES
// ================================================================================================
export interface LimiterConfig {
	idspace: string;
	redis: {
		host: string;
		port: string;
		auth_pass: string;
	}
}

export interface RateOptions {
	window: number;
	limit: number;
}

export interface Logger {
	log(message: string);
}

// MODULE VARIABLES
// ================================================================================================
export var logger = { log(message: string) {} };

// CLASS DEFINITION
// ================================================================================================
export class RateLimiter {
	idspace: string;
	client: redis.RedisClient;
	
	constructor(config: LimiterConfig) {
		this.idspace = config.idspace;
		this.client = redis.createClient(config.redis);
	}
	
	getTimeLeft(id: string, options: RateOptions): Promise<number> {
		var start = process.hrtime();
		logger.log(`Checking rate limit for ${id}`);
		
		return new Promise((resolve, reject) => {
			var timestamp = Date.now();
			var key = `credo::rate-limiter::${this.idspace}::${id}`;
			this.client.eval(script, 1, key, timestamp, options.window, options.limit, function(err, reply) {
				if (err) {
					return reject(err);
				}
				
				logger.log(`Checked rate limit for ${id} in ${since(start)} ms`);
				resolve(reply);
			});
		});
	}
}

// HELPER FUNCTIONS
// ================================================================================================
function since(start: number[]) {
    var diff = process.hrtime(start);
    return (diff[0] * 1000 + diff[1] / 1000000);
}

// LUA SCRIPT
// ================================================================================================
var script = `
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