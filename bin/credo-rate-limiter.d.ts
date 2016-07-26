declare module "@credo/rate-limiter" {
    
    // IMPORTS AND RE-EXPORTS
    // --------------------------------------------------------------------------------------------
    import * as events from 'events';
    import * as nova from 'nova-base';

    export { RateOptions } from 'nova-base';

    // REDIS CONNECTION
    // --------------------------------------------------------------------------------------------
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

	// RATE LIMITER
    // --------------------------------------------------------------------------------------------
    export interface RateLimiterConfig {
		name?       : string;
        idspace     : string;
        redis       : RedisConnectionConfig;
	}
	
	export class RateLimiter extends events.EventEmitter implements nova.RateLimiter {

        constructor(config: RateLimiterConfig, logger?: nova.Logger);

        try(id: string, options: nova.RateOptions): Promise<any>;

        on(event: 'error', callback: (error: RateLimiterError) => void);
    }

    // ERRORS
    // --------------------------------------------------------------------------------------------
    export class TooManyRequestsError extends nova.Exception {
        id          : string;
        retryAfter  : number;

        constructor(id: string, retryAfter: number);
    }

    export class RateLimiterError extends nova.Exception {
        constructor(cause: Error, message: string);
    }
}