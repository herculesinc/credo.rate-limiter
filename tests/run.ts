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
        password: ''
    }
};

const limiter = new RateLimiter(config);

const options = {
    window  : 30,
    limit   : 50
};

// TESTS
// ================================================================================================
async function runTests() {
    const id = 'id1';

    for (let i = 0; i < 30; i++) {
        setTimeout(function() {
            runBatch(i, id);
        }, i * 1000);
    }
}

async function runBatch(batch: number, id: string) {
    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(runTest(id));
    }

    const results = await Promise.all(promises);
    console.log(`batch ${batch}: ` + JSON.stringify(results));
}

async function runTest(id: string): Promise<number> {
    try {
        await limiter.try(id, options);
        return 1;
    } 
    catch (error) {
        return 0;
    }
}

// RUN TEST
// ================================================================================================
runTests();