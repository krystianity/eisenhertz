"use strict";

const assert = require("assert");
const request = require("request");
const Redis = require("ioredis");

const {
    Eisenhertz,
    defaultConfig,
    defaultLogger
} = require("./../../index.js");

describe("Service INT", function() {

    before(function() {
        const redis = new Redis(defaultConfig.redis);
        return redis.flushall().then(() => {
            redis.disconnect();
        });
    });

    after(function() {
        const redis = new Redis(defaultConfig.redis);
        return redis.flushall().then(() => {
            redis.disconnect();
        });
    });

    const testModule = "./../../test/TestProcess.js";
    const testConfig = Object.assign({}, defaultConfig, {
        fork: {
            module: testModule
        }
    });
    testConfig.properties.maxInstancesOfJobPerNode = 2; //allow for both instances to run on the same node

    const eisenhertz = new Eisenhertz(testConfig, defaultLogger());
    const jobs = [
        "one:1",
        "one:2",
    ];

    it("should be able to start service", function() {

        const fetchNames = callback => {
            callback(null, jobs);
        };

        const fetchDetails = (id, callback) => {

            let config = {};

            switch (id) {

                case "one:1":
                    config.port = 1337;
                    config.hi = "hi from one";
                    break;

                case "one:2":
                    config.port = 1338;
                    config.hi = "hi from two";
                    break;
            }

            callback(null, {
                config
            });
        };

        return eisenhertz.start(fetchNames, fetchDetails);
    });

    it("should await start-up", function(done) {
        setTimeout(done, 1000);
    });

    it("should have been elected as leader", function(done) {
        assert.equal(eisenhertz.leader.isLeader, true);
        done();
    });

    it("should await process start-up", function(done) {
        this.timeout(4000);
        setTimeout(done, 3500);
    });

    it("should be able to call running process 1", function(done) {
        request({
            url: "http://localhost:1337/test"
        }, (error, response, body) => {
            assert.ifError(error);
            assert.equal(response.statusCode, 200);
            console.log(body);
            body = JSON.parse(body);
            assert.equal(body.message, "hi from one");
            done();
        });
    });

    it("should be able to call running process 2", function(done) {
        request({
            url: "http://localhost:1338/test"
        }, (error, response, body) => {
            assert.ifError(error);
            assert.equal(response.statusCode, 200);
            console.log(body);
            body = JSON.parse(body);
            assert.equal(body.message, "hi from two");
            done();
        });
    });

    it("should be able to retrieve metrics for running processes", function() {
        return eisenhertz.workerQueue.gatherProcessMetrics().then(metrics => {
            //console.log(metrics);
            assert.ok(metrics[0]);
            assert.ok(metrics[1]);
        });
    });

    it("should also be able to retrieve process metrics globally", function() {
        return eisenhertz.leader.gatherProcessMetricsGlobally().then(metrics => {
            console.log(JSON.stringify(metrics));
            assert.ok(metrics);
        });
    });

    it("should wait a second", function(done) {
        setTimeout(done, 1000);
    });

    it("should be able to kill a process from within itself", function(done) {
        request({
            url: "http://localhost:1338/kill" //should restart afterwards
        }, (error, response, body) => {
            assert.ifError(error);
            assert.equal(response.statusCode, 200);
            done();
        });
    });

    it("should be able to kill job globally", function() {
        jobs.splice(0, 1); //remove job "one" from fetch list
        return eisenhertz.leader.removeJobAndKillProcesses("one:1"); //should not restart afterwards
    });

    it("should await killing and restart", function(done) {
        this.timeout(4000);
        setTimeout(done, 3500);
    });

    it("should not be able to call running process 1", function(done) {
        request({
            url: "http://localhost:1337/test"
        }, (error, response, body) => {
            console.log(error, body);
            assert.ok(error);
            done();
        });
    });

    it("should be able to call running process 2", function(done) {
        request({
            url: "http://localhost:1338/test"
        }, (error, response, body) => {
            assert.ifError(error);
            assert.equal(response.statusCode, 200);
            console.log(body);
            body = JSON.parse(body);
            assert.equal(body.message, "hi from two");
            done();
        });
    });

    it("should also be able to retrieve process metrics globally", function() {
        return eisenhertz.leader.gatherProcessMetricsGlobally().then(metrics => {
            console.log(JSON.stringify(metrics));
            assert.ok(metrics);
        });
    });

    it("should be able to close down processes", function(done) {
        eisenhertz.stop();
        setTimeout(done, 100);
    });
});