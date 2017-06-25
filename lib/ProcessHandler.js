"use strict";

class ProcessHandler {

    constructor(config, logger, workerQueue, leader) {
        this.config = config;
        this.logger = logger;
        this.workerQueue = workerQueue;
        this.leader = leader;
        this.goodStatusLogged = false;
    }

    async handleTasks() {
        const queue = this.workerQueue.queue;

        let status = await queue.getJobCounts();
        const names = await this.leader.getTaskNames();
        this.logger.debug(`current queue status: ${JSON.stringify(status)}.`);

        if (names.length <= 0) {
            this.logger.info(`queue status ignored -> no job names.`);
            this.goodStatusLogged = false;
            return false;
        }

        let onQueue = status.active + status.waiting + status.delayed;
        if (names.length === onQueue) {
            if (!this.goodStatusLogged) {
                this.goodStatusLogged = true;
                this.logger.info(`queue status is good -> ${onQueue} jobs.`);
            }
            return false;
        }

        if (names.length < onQueue) {
            this.goodStatusLogged = false;
            this.logger.warn(`queue status is instable -> ${names.length}/${onQueue}, hard-resetting.`);
            /*
            await this.resetQueueStatus();
            status = await queue.getJobCounts();
            this.logger.debug(`new queue status: ${JSON.stringify(status)}.`);
            onQueue = status.active + status.waiting + status.delayed; 
            */
            return false;
        }

        if (names.length > onQueue) {
            this.goodStatusLogged = false;
            this.logger.info(`queue status out-of-sync -> ${names.length}/${onQueue}, re-establishing.`);
            await this.synchronize(names);
        }

        return true;
    }

    async resetQueueStatus() {
        await queue.empty();
        await Promise.all([
            queue.clean(1000, "wait"),
            queue.clean(1000, "active"),
            queue.clean(1000, "failed"),
            queue.clean(1000, "completed"),
            queue.clean(1000, "delayed")
        ]);
        this.logger.info(`queue status resetted.`);
    }

    async synchronize(jobNames) {
        const queue = this.workerQueue.queue;
        await queue.clean(500, "failed");
        const jobs = await Promise.all(jobNames.map(name => queue.getJob(name).then(job => ({ name, job }))));
        const missingJobNames = jobs.filter(job => job.job === null).map(job => job.name);
        const mjDetails = await Promise.all(missingJobNames.map(name => this.leader.getTaskDetails(name).then(details => ({ name, details }))));
        return await Promise.all(mjDetails.map(mjd => queue.add(mjd.details, Object.assign({}, this.config.jobOptions, { jobId: mjd.name }))));
    }

    shutdown() {
        //empty
    }
}

module.exports = ProcessHandler;