"use strict";

const Promise = require("bluebird");
const Redis = require("ioredis");
const Redlock = require("redlock");
const Merkury = require("merkury");
const uuid = require("uuid");

const ProcessHandler = require("./ProcessHandler.js");

const EVENTS = {
    LEADER_ELECTED: "leader-elected",
    NODE_JOINED: "node-joined"
};

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

        this.merkury.emit(EVENTS.NODE_JOINED, this.nodeId);
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

        if (this.redlock) {
            this.redlock.close();
        }

        if (this.processHandler) {
            this.processHandler.shutdown();
        }
    }
}

module.exports = Leader;