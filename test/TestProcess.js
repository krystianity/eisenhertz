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
            message: "hi"
        });
    });

    app.listen(data.config.port);
};

const mc = cb => {
    cb({
        incomingRequests
    });
};

fork.connect(pc, mc);