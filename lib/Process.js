"use strict";

const { fork } = require("child_process");
const EventEmitter = require("events");
const path = require("path");
const uuid = require("uuid");

const FORK_OPTIONS = {
    detached: true,
    stdio: "ignore"
};

class Process extends EventEmitter {

    constructor(logger) {
        super();
        this.logger = logger;
        this.child = null;
        this.data = null;
        this.isConnected = false;
        this.forkId = uuid.v4();
    }

    spawn(sourceFile, data = {}) {
        this.data = data;

        if (!path.isAbsolute(sourceFile)) {
            sourceFile = path.join(__dirname, sourceFile);
        }

        this.logger.info(`spawning process ${this.forkId}.`);
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
            super.emit("close", true);
        });

        this.child.on("message", message => {
            super.emit("message", message);
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

    kill() {

        if (this.child) {
            this.logger.warn(`killing fork process ${this.forkId}.`);
            this.child.kill("SIGINT");
        }
    }
}

module.exports = Process;