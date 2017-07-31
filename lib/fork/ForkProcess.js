"use strict";

class ForkProcess {

    constructor() {

        this._init();
        this.forkId = process.argv[2];
        this.callbacks = {};

        if (!this.forkId) {
            throw new Error("missing forkId argument.");
        }

        process.on("message", this._handleMessage.bind(this));
    }

    connect(processCallback, metricsCallback) {
        if (typeof processCallback !== "function" ||
            typeof metricsCallback !== "function") {
            throw new Error("processCallback and metricsCallback must be functions.");
        }

        this.processCallback = processCallback;
        this.metricsCallback = metricsCallback;
        this.send("id", this.forkId);
        setTimeout(() => {}, 3000); //run for at least 3 sec
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

            case "task":
                this._handleTask(message.content);
                break;

            case "kill":
                process.exit(3);
                break;

            default:
                break;
        }
    }

    _handleTask(data){

        if(typeof data !== "object" ||
            typeof data.task !== "string" ||
            typeof data.identifier !== "string" ||
            typeof data.args === "undefined"){
            return this.error(`received corrupt task data.`);
        }

        if(!this.callbacks[data.task]){
            return this.error(`${data.task} is not a registered callback.`);
        }

        this.callbacks[data.task](data.args, (error, result) => {

            if(error){
                return this._resolveTask(data.identifier, error);
            }

            this._resolveTask(data.identifier, null, result);
        });
    }

    _resolveTask(identifier, error, result = {}){

        if(error){
            return this.send("task", {
                identifier,
                error
            });
        }

        this.send("task", {
            identifier,
            result
        });
    }

    log(message, level = "info") {
        message = typeof message !== "string" ? JSON.stringify(message) : message;
        this.send("log", {
            message,
            level
        });
    }

    error(error){
        error = typeof error !== "string" ? JSON.stringify(error) : error;
        this.send("error", error);
    }

    send(type, content) {
        process.send({ type, content });
    }

    register(name, func){

        if(typeof func !== "function"){
            throw new Error("a registered callback must be a function.");
        }

        this.callbacks[name] = func;
    }

    remove(name){
        delete this.callbacks[name];
    }
}

module.exports = ForkProcess;
