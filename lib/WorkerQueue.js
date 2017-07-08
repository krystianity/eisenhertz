"use strict";

const Queue = require("bull");
const Process = require("./Process.js");

const INSTANCE_DELIMITER = ":";

class WorkerQueue {

    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.queue = null;

        this.processes = {};
        this._init();
    }

    _init() {
        process.on("exit", () => {
            this.stop();
            setTimeout(process.exit, 100, 0);
        });

        process.on("SIGINT", () => {
            this.stop();
            setTimeout(process.exit, 100, 0);
        });
    }

    async start() {

        this.queue = new Queue(this.config.properties.name + "-worker", "", this.config);

        this.queue.on("error", error => {
            this.logger.error(`worker queue error: ${JSON.stringify(error)}.`);
        });

        this.queue.on("failed", (job, error) => {
            this.logger.warn(`worker queue failed: ${job.id}, error: ${error}.`);
        });

        this.queue.on("stalled", (job) => {
            this.logger.warn(`worker queue stalled: ${job.id}.`);
        });

        //shouldnt be called actually..
        this.queue.on("completed", (job, result) => {
            this.logger.warn(`worker queue job-done: ${job.id}.`);
        });

        this.queue.process(this.config.properties.maxJobsPerWorker, (job, done) => {
            this.process(job, done)
        });

        return await this.queue.isReady().then(_ => {
            this.logger.info(`worker queue processor is ready.`);
            return true;
        });
    }

    async stop() {

        Object.keys(this.processes).forEach(k => {
            this.processes[k].kill();
            delete this.processes[k];
        });

        if (this.queue) {
            await this.queue.close();
        }
    }

    removeProcessOfJob(id) {
        if (this.processes[id]) {
            delete this.processes[id];
        }
    }

    killProcessOfJob(id) {
        if (this.processes[id]) {
            this.processes[id].kill();
        }
    }

    async gatherProcessMetrics(description, timeout) {

        if (Object.keys(this.processes).length <= 0) {
            return [];
        }

        const promises = Object
            .keys(this.processes)
            .map(key => this.processes[key])
            .map(process => process.pullMetrics(description, timeout)
                .then(metrics => ({ job: process.jobName, metrics })));

        return await Promise.all(promises);
    }

    identifyRunningInstances(jobId){

        if(jobId.indexOf(INSTANCE_DELIMITER) === -1){
            return 0;
        }

        const jobIdSplit = jobId.split(INSTANCE_DELIMITER);
        if(jobIdSplit.length < 2){
            return 0;
        }
        const mainJobId = jobIdSplit[0];

        let instancesAlreadyRunning = 0;
        Object.keys(this.processes).forEach(key => {
            try {
                if(key.indexOf(INSTANCE_DELIMITER) !== -1){
                    const split = key.split(INSTANCE_DELIMITER);
                    if(split.length >= 2){
                        if(mainJobId === split[0]){
                            this.logger.info(`instance ${split[1]} of job ${split[0]} is already running on this node.`);
                            instancesAlreadyRunning++;
                        }
                    }
                }
            } catch(error){
                //empty
            }
        });

        if(instancesAlreadyRunning === 0){
            this.logger.info(`no instances of job ${mainJobId} are running on this node, spawning ${jobIdSplit[1]}.`);
        }

        return instancesAlreadyRunning;
    }

    process(job, done) {

        this.logger.info(`received job ${job.id}.`);

        if (this.processes[job.id]) {
            this.logger.error(`${job.id} is already running as process on this node, killing current process.`);
            this.killProcessOfJob(job.id);
            this.removeProcessOfJob(job.id);
        }

        const runningInstances = this.identifyRunningInstances(job.id);
        if(runningInstances !== 0 && runningInstances >= this.config.properties.maxInstancesOfJobPerNode){
            this.logger.warn(`${runningInstances} exceeds maximum number ${this.config.properties.maxInstancesOfJobPerNode} of running instances for job ${job.id} on this node.`);
            return setTimeout(() => {
                done(new Error("re-scheduling needed, as max job instance count on node was reached."));
            }, 2500);
        }

        if (!this.config.fork || !this.config.fork.module) {
            this.logger.error(`no fork.module is configured in config.`);
            return; //no done, because re-sheduling wouldnt be of any help here
        }

        this.logger.info(`starting process for job ${job.id}.`);

        const proc = new Process(this.logger, job.id);
        this.processes[job.id] = proc;

        proc.on("close", () => {
            if (this.processes[job.id]) { //ensure job was not removed manually
                this.removeProcessOfJob(job.id);
                this.logger.warn(`process of ${job.id} closed down, returning job callback with error.`);
                done(new Error("module shut down."));
            }
        });

        proc.spawn(this.config.fork.module, job.data); //async
    }
}

module.exports = WorkerQueue;