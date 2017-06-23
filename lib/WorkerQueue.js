"use strict";

const Queue = require("bull");
const Process = require("./Process.js");

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

    process(job, done) {

        this.logger.info(`received job ${job.id}.`);

        if (this.processes[job.id]) {
            this.logger.error(`${job.id} is already running as process on this node.`);
            this.processes[job.id].send({ lol: "duplicate" });
            return;
        }

        this.logger.info(`starting process for job ${job.id}.`);
        const proc = new Process(this.logger);
        this.processes[job.id] = proc;
        proc.spawn("./fork/ForkProcess.js", job.data);
        proc.on("message", msg => console.log(msg));
    }
}

module.exports = WorkerQueue;