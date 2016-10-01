// IMPORTS
// ================================================================================================
import { RateLimiter } from './../index';
import { MockLogger } from './mocks/Logger';

// SETUP
// ================================================================================================
const config = {
    name        : 'testlimiter',
    redis: {
        host    : '',
        port    : 6379,
        password: '',
        prefix  : 'testlimiter'
    }
};

const limiter = new RateLimiter(config, new MockLogger());

const options = {
    window  : 2,
    limit   : 3
};

// TESTS
// ================================================================================================
async function runTests() {
    const id = 'id1';

    try {
        await limiter.try(id, options);
        await limiter.try(id, options);
        await limiter.try(id, options);
        await limiter.try(id, options);
    }
    catch (e) {
        console.log(e.stack);
        console.log(JSON.stringify(e));
    }

    setTimeout(async function() {
        await limiter.try(id, options);
    }, 2000);
}

// RUN TEST
// ================================================================================================
runTests();