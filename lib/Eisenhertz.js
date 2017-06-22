"use strict";

const Leader = require("./Leader.js");
const WorkerQueue = require("./WorkerQueue.js");

class Eisenhertz {

    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.leader = null;
        this.workerQueue = null;
    }

    async start() {
        const startTime = Date.now();
        this.workerQueue = new WorkerQueue(this.config, this.logger);
        await this.workerQueue.start();
        this.leader = new Leader(this.config, this.logger, this.workerQueue);
        const isLeader = await this.leader.elect();
        this.logger.info(`Eisenhertz started in ${Date.now() - startTime}ms - leader: ${isLeader}.`);
        return isLeader;
    }

    async stop() {

        if (this.leader) {
            await this.leader.stop();
        }

        if (this.workerQueue) {
            await this.workerQueue.stop();
        }
    }
}

module.exports = Eisenhertz;