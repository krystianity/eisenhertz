"use strict";

const Queue = require("bull");
const Redis = require("ioredis");

class WorkerQueue {

    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.queue = null;
    }

    async start() {

        this.queue = new Queue(this.config.properties.name + "-worker", "", this.config);

        this.queue.on("error", error => {
            this.logger.error("worker error: " + error);
        });

        this.queue.on("failed", (job, error) => { //error is not an error but just a string on global events
            this.logger.warn(`worker failed: ${job.id}, error: ${error}.`);
        });

        this.queue.on("completed", (job, result) => {
            this.logger.info(`worker done: ${job.id}.`);
        });

        this.queue.process(this.config.properties.maxJobsPerWorker, (job, done) => {
            this.logger.info(job.data);
            setTimeout(done, 100); //TODO spawn
        });

        return await this.queue.isReady().then(_ => {
            this.logger.info("queue is ready");
            return true;
        });
    }

    async stop() {

        if (this.queue) {
            this.queue.close();
        }
    }
}

module.exports = WorkerQueue;