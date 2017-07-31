"use strict";

const express = require("express");

const {
    ForkProcess
} = require("./../index.js");

const fork = new ForkProcess();
let incomingRequests = 0;

const pc = data => {

    const app = express();

    app.get("/test", (req, res) => {
        incomingRequests++;
        res.status(200).json({
            message: data.config.hi
        });
    });

    app.get("/kill", (req, res) => {
        res.status(200).end();
        process.exit(4);
    });

    app.listen(data.config.port, () => {
        fork.log("ready");
    });
};

const mc = cb => {
    cb(null, {
        incomingRequests
    });
};

fork.register("test-cb", (data, callback) => {
    setTimeout(() => {
        fork.log(data);
        callback(null, "yeah")
    }, 80);
});

fork.register("test-error", (data, callback) => {
    setTimeout(() => {
        fork.log(data);
        callback(new Error("an error"))
    }, 50);
});

fork.connect(pc, mc);