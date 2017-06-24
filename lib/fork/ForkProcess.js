"use strict";

class Fork {

    constructor(processCallback, metricsCallback) {

        this._init();

        if (typeof processCallback !== "function" ||
            typeof metricsCallback !== "function") {
            throw new Error("processCallback and metricsCallback must be functions.");
        }

        this.processCallback = processCallback;
        this.metricsCallback = metricsCallback;
        this.forkId = process.argv[2];

        if (!this.forkId) {
            throw new Error("missing forkId argument.");
        }

        process.on("message", this._handleMessage.bind(this));
        this.send("id", this.forkId);
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

    _init() {

        this._errorToJson();

        process.on("uncaughtException", error => {
            this.send("error", error);
            setTimeout(process.exit, 100, 1);
        });

        process.on("unhandledRejection", reason => {
            this.send("error", reason);
            setTimeout(process.exit, 100, 2);
        });
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

            case "metrics":
                this.metricsCallback((error, metrics) => {

                    if (error) {
                        return this.send("error", error);
                    }

                    this.send("metrics", metrics);
                });
                break;

            case "data":
                this.processCallback(message.content, (error, result) => {

                    if (error) {
                        return this.send("error", error);
                    }

                    this.send("data", result);
                });
                break;

            default:
                break;
        }
    }

    log(message) {
        this.send("log", message);
    }

    send(type, content) {
        process.send({ type, content });
    }
}

let fork = null;
const pc = data => {
    setInterval(() => {
        fork.log("lol");
    }, 1000);
};

const mc = cb => {
    cb({});
};

fork = new Fork(pc, mc);