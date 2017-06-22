"use strict";

const Redis = require("ioredis");
const Redlock = require("redlock");

class Leader {

    constructor(config, logger, workerQueue) {

        this.config = config;
        this.logger = logger;
        this.workerQueue = workerQueue;
        this.isLeader = false;

        this.redlock = new Redlock([
            new Redis(config.redis)
        ], config.redlock);

        this.redlock.on("clientError", error => {
            this.logger.error(error);
        });

        this.masterJobId = config.properties.name + "-master-job";
        this.masterLockResource = config.properties.name + ":" + config.properties.masterLock;
        this.masterLockTtl = config.properties.masterLockTtl;
        this.masterLockReAttempt = config.properties.masterLockReAttempt;
    }

    async elect() {
        try {
            const lock = await this.redlock.lock(this.masterLockResource, this.masterLockTtl);

            if (lock) {
                this.logger.info("got lock, instand extending.");
                this.evaluate(lock).catch(error => this.logger.error(error));
                this.isLeader = true;
                return true;
            } else {
                throw new Error("empty lock.");
            }

        } catch (error) {
            this.logger.info("did not get lock, re-attempting soon.");
            this.isLeader = false;
            this.reattempt().catch(error => this.logger.error(error));
            return false;
        }
    }

    async evaluate(lock) {
        const counts = await this.workerQueue.queue.getJobCounts();
        this.logger.info(`current queue status: ${JSON.stringify(counts)}.`);
        this.workerQueue.queue.add({ worker: "123" }, this.config.jobOptions); //TODO
        //await lock.extend(this.masterLockTtl);
        await (new Promise(resolve => setTimeout(resolve, this.masterLockTtl / 2)));
        return await this.evaluate(lock);
    }

    async reattempt() {
        await (new Promise(resolve => setTimeout(resolve, this.masterLockReAttempt)));
        this.elect();
    }

    async stop() {

    }
}

module.exports = Leader;