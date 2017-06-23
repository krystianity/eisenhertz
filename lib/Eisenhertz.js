"use strict";

const Leader = require("./Leader.js");
const WorkerQueue = require("./WorkerQueue.js");

class Eisenhertz {

    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.leader = null;
        this.workerQueue = null;
        this._errorToJson();
    }

    _errorToJson() {
        if (!("toJSON" in Error.prototype))
            Object.defineProperty(Error.prototype, "toJSON", {
                value: function() {
                    var alt = {};

                    Object.getOwnPropertyNames(this).forEach(function(key) {
                        alt[key] = this[key];
                    }, this);

                    return alt;
                },
                configurable: true,
                writable: true
            });
    }

    async start(taskNameFetchCallback, taskDetailsFetchCallback) {

        const startTime = Date.now();

        this.workerQueue = new WorkerQueue(this.config, this.logger);
        await this.workerQueue.start();

        this.leader = new Leader(this.config, this.logger, this.workerQueue);
        this.leader.setCallbacks(taskNameFetchCallback, taskDetailsFetchCallback);
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