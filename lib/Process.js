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
        this.forkId = uuid.v4();
        this.child = null;
    }

    spawn(sourceFile, data) {

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
        });

        this.child.on("message", message => {
            super.emit("message", message);
        });

        this.child.unref();
        this.send(data);
    }

    send(message) {
        if (this.child) {
            this.child.send(message);
        }
    }

    kill() {
        if (this.child) {
            this.child.kill("SIGINT");
        }
    }
}

module.exports = Process;