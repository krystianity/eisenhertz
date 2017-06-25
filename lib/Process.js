"use strict";

const Promise = require("bluebird");
const { fork } = require("child_process");
const EventEmitter = require("events");
const path = require("path");
const fs = require("fs");
const uuid = require("uuid");

const FORK_OPTIONS = {
    detached: true,
    stdio: "ignore"
};

class Process extends EventEmitter {

    constructor(logger, jobName = "") {
        super();
        this.logger = logger;
        this.jobName = jobName;
        this.child = null;
        this.data = null;
        this.isConnected = false;
        this.forkId = uuid.v4();
    }

    async spawn(sourceFile, data = {}) {
        this.data = data;

        if (!path.isAbsolute(sourceFile)) {
            sourceFile = path.join(path.dirname(process.argv[1]), sourceFile);
        }

        const exists = await (new Promise(resolve => fs.exists(sourceFile, resolve)));
        if (!exists) {
            this.logger.error(`module ${sourceFile} does not exist, cannot start process for job as fork: ${this.forkId}.`);
            process.nextTick(() => {
                super.emit("close", true); //ends running queue-job
            });
            return;
        }

        this.logger.info(`spawning process ${this.forkId} with module: ${sourceFile}.`);
        this.child = fork(sourceFile, [this.forkId], FORK_OPTIONS);

        this.child.on("error", error => {
            this.logger.error(`${this.forkId} child error ${error}.`);
        });

        this.child.on("disconnect", () => {
            this.logger.warn(`${this.forkId} child disconnected.`);
        });

        this.child.on("exit", () => {
            this.logger.warn(`${this.forkId} child exited.`);
        });

        this.child.on("close", () => {
            this.logger.warn(`${this.forkId} child closed.`);
            this.emit("close", true);
        });

        this.child.on("message", message => {
            this.emit("message", message);
            this._handleMessage(message);
        });

        this.child.unref();
    }

    _handleMessage(message) {

        if (typeof message !== "object") {
            return;
        }

        if (typeof message.type === "undefined" ||
            typeof message.content === "undefined") {
            return;
        }

        switch (message.type) {

            case "id":
                if (this.forkId === message.content) {
                    this.logger.info(`forked process ${message.content} is connected.`);
                    this.isConnected = true;
                    this.send("data", this.data);
                } else {
                    this.logger.error(`forked process ${this.forkId} send bad forkId: ${message.content}.`);
                }
                break;

            case "data":
                super.emit("data", message.content);
                this.logger.info(`fork process returned data.`);
                break;

            case "log":
                this.logger.info(`f-ipc-log:${this.forkId}: ${message.content}.`);
                break;

            case "metrics":
                super.emit("metrics", message.content);
                break;

            case "error":
                this.logger.error(`error in fork process: ${this.forkId}, ${message.content}.`);
                break;

            default:
                this.logger.warn(`received unknown message type: ${message.type} from f-ipc: ${this.forkId}.`);
                break;
        }
    }

    send(type, content) {

        if (this.child) {
            this.child.send({ type, content });
        }
    }

    pullMetrics(description = {}, timeout = 2000) {
        let received = false;
        return new Promise((resolve, reject) => {

            const _t = setTimeout(() => {
                if (!received) {
                    received = true;
                    reject(new Error(`took to long to retrieve metrics for fork ${this.forkId}.`));
                }
            }, timeout);

            this.send("metrics", description);
            super.once("metrics", metrics => {
                if (!received) {
                    received = true;
                    clearTimeout(_t);
                    this.logger.debug(`received metrics for fork ${this.forkId}.`);
                    resolve(metrics);
                }
            });
        });
    }

    kill() {

        if (this.child) {
            this.logger.warn(`killing fork process ${this.forkId}.`);
            this.child.kill("SIGINT");
        }
    }
}

module.exports = Process;