# Eisenhertz

[![Build Status](https://travis-ci.org/krystianity/eisenhertz.svg?branch=master)](https://travis-ci.org/krystianity/eisenhertz)

nodejs module-as-a-process cluster management

# What does it do?

* Eisenhertz excels at one thing only: 
`keeping a set of dynamic module execution up & running across endless Servers, VMs, Containers`
* You pass in a module to execute and an unlimited amount of config-data (jobs) for each execution
and eisenhertz will ensure that the correct amount of modules is constantly running across the
all instances of itself, where each module runs in its own process
* It also gives you controll to manually add or remove such jobs in real-time
* Additionally you can talk to the processes via ipc and retrieve metrics from all processes
running
* Eisenhertz does not work as a stand-alone "server-setup", its main idea is to build a basis
for a project that requires scaling across a lot of machines in stand-alone processes

# Requirements
* Eisenhertz does heavily rely on async/await therefore you will need at least `node >=v 7.0`
* The message cortex and job queue relies on `Redis >= 2.8.18`

# Install via

```
npm i eisenhertz
```

# Server Setup

```es6
const {
    Eisenhertz,
    defaultConfig,
    defaultLogger
} = require("eisenhertz");

const fetchJobNames = callback => {
    callback(null, [
        "one",
        "two"
    ]);
};

const fetchJobDetails = (id, callback) => {

    let config = {};

    switch (id) {

        case "one":
            config.port = 1337;
            config.hi = "hi from one";
            break;

        case "two":
            config.port = 1338;
            config.hi = "hi from two";
            break;
    }

    callback(null, {
        config
    });
};

const eisenhertz = new Eisenhertz(config, defaultLogger());
eisenhertz
    .start(fetchJobNames, fetchJobDetails)
    .then(() => {});
```

# Fork-Module Setup

```es6
const { ForkProcess } = require("eisenhertz");
const express = require("express");

const fork = new ForkProcess();
let incomingRequests = 0;

const processCallback = data => {

    const app = express();

    app.get("/hi", (req, res) => {
        incomingRequests++;
        res.status(200).json({
            message: data.config.hi
        });
    });

    app.listen(data.config.port, () => {
        fork.log("ready");
    });
};

const metricsCallback = cb => {
    cb(null, {
        incomingRequests
    });
};

fork.connect(processCallback, metricsCallback);
```

## Example Setup Description

* The example setup above will give you the possiblity to scale
a demo webserver across unlimited instances, by simply deploying the
server module to servers, vms or containers.
* As soon as it starts, it will spawn 2 processes on any of the
parent systems that will run one of the two webservers.

# Configuration

```es6
{
    prefix: "eh",
    redis: {
        host: "localhost",
        port: 6379,
        db: 7
    },
    redlock: {
        driftFactor: 0.01,
        retryCount: 2,
        retryDelay: 200,
        retryJitter: 200
    },
    settings: {
        lockDuration: 4500,
        stalledInterval: 4500,
        maxStalledCount: 1,
        guardInterval: 2500,
        retryProcessDelay: 2500
    },
    properties: {
        name: "eh:empty",
        maxJobsPerWorker: 2,
        masterLock: "eh:master:lock",
        masterLockTtl: 2000,
        masterLockReAttempt: 4000,
        maxInstancesOfJobPerNode: 1
    },
    jobOptions: {
        priority: 1, 
        delay: 1000, 
        attempts: 1, //dont touch
        repeat: undefined, //dont touch
        backoff: undefined, //dont touch
        lifo: undefined, //dont touch
        timeout: undefined, //dont touch
        jobId: undefined, // will be set by TaskHandler
        removeOnComplete: true, //dont touch
        removeOnFail: true //dont touch
    },
    fork: {
        module: "./fork/ForkProcess.js"
    }
}
```

## Controlling jobs on nodes

```es6
config.properties.maxInstancesOfJobPerNode
/*
    lets you limit the amount of instances of a job
    that run on a single node, you can define a job instance
    by using ":" as delimiter e.g. jobOne:1, jobOne:2 and jobOne:3
    if the limit is reached, the node will return the job with
    an error back to the queue after a small timeout
*/

config.properties.maxJobsPerWorker
/*
    lets you limit the amount of jobs per worker
    it is usually a good idea to limit this to the amount
    of cores (* 2 on intel systems) of the node's host
*/
```