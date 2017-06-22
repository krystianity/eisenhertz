"use strict";
module.exports = {
    prefix: "eh",
    redis: {
        host: "localhost",
        port: 6379,
        db: 7
    },
    redlock: {
        driftFactor: 0.01,
        retryCount: 2,
        retryDelay: 200,
        retryJitter: 200
    },
    settings: {
        lockDuration: 4500,
        stalledInterval: 4500,
        maxStalledCount: 1,
        guardInterval: 2500,
        retryProcessDelay: 2500
    },
    properties: {
        name: "eh:empty",
        maxJobsPerWorker: 1,
        masterLock: "eh:master:lock",
        masterLockTtl: 2000,
        masterLockReAttempt: 4000
    },
    jobOptions: {
        priority: 1,
        delay: 1000,
        attempts: 1,
        repeat: undefined,
        backoff: 1000,
        lifo: false,
        timeout: undefined,
        jobId: undefined,
        removeOnComplete: false,
        removeOnFail: false
    }
};