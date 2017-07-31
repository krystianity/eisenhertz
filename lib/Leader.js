"use strict";

const Promise = require("bluebird");
const Redis = require("ioredis");
const Redlock = require("redlock");
const Merkury = require("merkury");
const uuid = require("uuid");

const ProcessHandler = require("./ProcessHandler.js");

const EVENTS = {
    LEADER_ELECTED: "leader-elected",
    NODE_JOINED: "node-joined",
    JOB_KILLED: "job-killed",
    REQ_METRICS: "req-metrics",
    RUN_TASK: "run-task",
    RETURN_TASK: "return-task"
};

const MAX_STACK_SIZE = 1e5;

class Leader {

    constructor(config, logger, workerQueue) {

        this.config = config;
        this.logger = logger;
        this.workerQueue = workerQueue;
        this.isLeader = false;
        this.taskNameFetchCallback = null;
        this.taskDetailsFetchCallback = null;
        this.nodeId = uuid.v4();

        this.redlock = new Redlock([
            new Redis(config.redis)
        ], config.redlock);

        this.merkury = new Merkury(config.properties.name, config.redis, true);

        this.masterJobId = config.properties.name + "-master-job";
        this.masterLockResource = config.properties.name + ":" + config.properties.masterLock;
        this.masterLockTtl = config.properties.masterLockTtl;
        this.masterLockReAttempt = config.properties.masterLockReAttempt;

        this.metricsBucket = {};
        this.stack = {};

        this.processHandler = new ProcessHandler(config, logger, workerQueue, this);
        this.init();
    }

    static isFunction(func) {
        return func && typeof func === "function";
    }

    setCallbacks(taskNameFetchCallback, taskDetailsFetchCallback) {

        if (!Leader.isFunction(taskNameFetchCallback) || !Leader.isFunction(taskDetailsFetchCallback)) {
            throw new Error("callbacks must be functions.");
        }

        this.taskNameFetchCallback = taskNameFetchCallback;
        this.taskDetailsFetchCallback = taskDetailsFetchCallback;
    }

    getTaskNames() {

        if (!this.taskNameFetchCallback) {
            return Promise.reject(new Error("taskNameFetchCallback not set, did you '.setCallbacks()'?"));
        }

        return new Promise((resolve, reject) => {
            this.taskNameFetchCallback((error, names) => {

                if (error) {
                    return reject(error);
                }

                resolve(names);
            });
        });
    }

    getTaskDetails(id) {

        if (!this.taskDetailsFetchCallback) {
            return Promise.reject(new Error("taskDetailsFetchCallback not set, did you '.setCallbacks()'?"));
        }

        return new Promise((resolve, reject) => {
            this.taskDetailsFetchCallback(id, (error, details) => {

                if (error) {
                    return reject(error);
                }

                resolve(details);
            });
        });
    }

    init() {

        this.redlock.on("clientError", error => {
            this.logger.error(error);
        });

        this.merkury.on(EVENTS.LEADER_ELECTED, nodeId => {
            if (nodeId !== this.nodeId) {
                this.logger.info(`another node was elected as leader ${nodeId}.`);

                //redundant exactly-one leader ensurance
                if (this.isLeader) {
                    this.isLeader = false;
                    this.logger.error(`another node was elected as leader, but this node ${this.nodeId} is
                        still in state leader => will terminate.`);
                    process.exit(1);
                }
            } else {
                this.logger.info(`this node ${this.nodeId} has been elected as leader.`);
            }
        });

        this.merkury.on(EVENTS.NODE_JOINED, nodeId => {
            if (nodeId !== this.nodeId) {
                this.logger.info(`a new node ${nodeId} joined the cluster.`);
            }
        });

        this.merkury.on(EVENTS.JOB_KILLED, name => {
            this.killJob(name);
        });

        this.merkury.on(EVENTS.REQ_METRICS, (nodeId, metrics) => {

            if (this.isLeader) {

                if (nodeId !== this.nodeId) {
                    this.metricsBucket[nodeId] = metrics;
                    return;
                }

                this.workerQueue.gatherProcessMetrics().then(metrics => {
                    this.metricsBucket[this.nodeId] = metrics;
                }).catch(error => this.logger.error(error));
                return;
            }

            if (metrics) {
                return; //do nothing with infos
            }

            this.workerQueue.gatherProcessMetrics().then(metrics => {
                this.merkury.emit(EVENTS.REQ_METRICS, this.nodeId, metrics);
            }).catch(error => this.logger.error(error));
        });

        this.merkury.on(EVENTS.RUN_TASK, (identifier, jobName, name, args, timeout) => {

            //check if this job's child process runs on this parent
            if(!this.workerQueue.processes[jobName]){
                return;
            }

            this.workerQueue.processes[jobName].runTask(name, args, timeout).then(result => {
                this.merkury.emit(EVENTS.RETURN_TASK, identifier, null, result);
            }).catch(error => {
                this.merkury.emit(EVENTS.RETURN_TASK, identifier, error, null);
            });
        });

        this.merkury.on(EVENTS.RETURN_TASK, (identifier, error, result) => {

            //check if this task has been started from this parent process
            if(!this.stack[identifier]){
                return;
            }

            this.stack[identifier](error, result);
            delete this.stack[identifier];
        });

        this.merkury.emit(EVENTS.NODE_JOINED, this.nodeId);
    }

    sendKill(jobName) {
        this.merkury.emit(EVENTS.JOB_KILLED, jobName);
    }

    killJob(name) {
        this.logger.info(`leader kill request for job ${name}.`);
        this.workerQueue.killProcessOfJob(name);
        this.workerQueue.removeProcessOfJob(name);
    }

    async runTaskSearchForNode(jobName, name, args, timeout = 1000){

        //this process is parent of the child process running the job
        if(this.workerQueue.processes[jobName]){
            return this.workerQueue.processes[jobName].runTask(name, args, timeout);
        }

        //check if this job actually exists on the queue
        const job = await this.workerQueue.queue.getJob(jobName);
        if(!job){
            throw new Error(`job ${jobName} does not exist.`);
        }

        //dispatch job to other parent instances

        if(Object.keys(this.stack).length > MAX_STACK_SIZE){
            this.logger.info(`leader stack size exceeded maximum ${MAX_STACK_SIZE} had to drop standing tasks.`);
            this.stack = {};
        }

        const taskIdentifier = uuid.v4();

        const p =  new Promise((resolve, reject) => {

            let received = false;
            const _t = setTimeout(() => {
                if (!received) {
                    received = true;
                    delete this.stack[taskIdentifier];
                    reject(new Error(`took to long to run task ${taskIdentifier} for leader ${this.nodeId}.`));
                }
            }, timeout);

            this.stack[taskIdentifier] = (error, result) => {

                if (!received) {
                    received = true;
                    clearTimeout(_t);
                    this.logger.debug(`received task result for leader ${this.nodeId} and task ${taskIdentifier}.`);

                    if (error) {
                        return reject(error);
                    }

                    resolve(result);
                }
            };
        });

        //emit event on bus for other parent processes to check if they hold an instance of the job's child process
        this.merkury.emit(EVENTS.RUN_TASK, taskIdentifier, jobName, name, args, timeout);
        return p;
    }

    async removeJobAndKillProcesses(name) {

        const removed = await this.workerQueue.queue.getJob(name).then(job => {

            if (!job) {
                return false;
            }

            //return job.remove().then(() => { // <- doesnt work
            return job.moveToFailed(new Error("was killed and removed")).then(() => {
                return true;
            });
        });

        this.sendKill(name);
        this.logger.info(`removed(${removed}) job ${name}.`);
        return removed;
    }

    async gatherProcessMetricsGlobally(ipcResponseAwait = 250) {

        if (!this.isLeader) {
            throw new Error("must be called from the leader.");
        }

        this.metricsBucket = {}; //reset
        this.merkury.emit(EVENTS.REQ_METRICS, this.nodeId, null);
        await (new Promise(resolve => setTimeout(resolve, ipcResponseAwait)));
        return this.metricsBucket;
    }

    async elect() {

        try {
            const lock = await this.redlock.lock(this.masterLockResource, this.masterLockTtl);

            if (lock) {
                this.logger.debug("got leader lock on this node.");
                this.merkury.emit(EVENTS.LEADER_ELECTED, this.nodeId);
                await (new Promise(resolve => setTimeout(resolve, 100)));
                this.isLeader = true;
                this.evaluate(lock).catch(error => this.logger.error(error));
                return true;
            } else {
                throw new Error("empty lock.");
            }

        } catch (error) {
            this.logger.debug("did not get leader lock on this node, re-attempting soon.");
            this.isLeader = false;
            this.reAttempt().catch(error => this.logger.error(error));
            return false;
        }
    }

    async evaluate(lock) {

        if (!this.isLeader) {
            this.logger.warn("ending evaluation intervals, as this node is not leader anymore.");
            return;
        }

        await this.processHandler.handleTasks().catch(error => this.logger.error(error));

        await lock.extend(this.masterLockTtl);
        await (new Promise(resolve => setTimeout(resolve, this.masterLockTtl / 2)));
        return await this.evaluate(lock);
    }

    async reAttempt() {
        await (new Promise(resolve => setTimeout(resolve, this.masterLockReAttempt)));
        this.elect();
    }

    async stop() {

        if (this.merkury) {
            await this.merkury.disconnect();
        }

        if (this.processHandler) {
            this.processHandler.shutdown();
        }
    }
}

module.exports = Leader;