"use strict";

const assert = require("assert");
const request = require("request");

const {
    Eisenhertz,
    defaultConfig,
    defaultLogger
} = require("./../../index.js");

describe("Service INT", function() {

    const testModule = "./../../test/TestProcess.js";
    const testConfig = Object.assign({}, defaultConfig, {
        fork: {
            module: testModule
        }
    });
    const eisenhertz = new Eisenhertz(testConfig, defaultLogger());

    it("should be able to start service", function() {

        const fetchNames = callback => {
            callback(null, [
                "one",
                "two",
            ]);
        };

        const fetchDetails = (id, callback) => {

            let config = {};

            switch (id) {

                case "one":
                    config.port = 1337;
                    break;

                case "two":
                    config.port = 1338;
                    break;
            }

            callback(null, {
                config
            });
        };

        return eisenhertz.start(fetchNames, fetchDetails);
    });

    it("should await start-up", function(done) {
        this.timeout(5010);
        setTimeout(done, 5000);
    });

    it("should have been elected as leader", function() {
        assert.equal(eisenhertz.leader.isLeader, true);
    });

    it("should be able to call running process 1", function(done) {
        request({
            url: "http://localhost:1337/test"
        }, (error, response, body) => {
            assert.ifError(error);
            assert.equal(response.statusCode, 200);
            console.log(body);
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
            done();
        });
    });

    it("should be able to close down processes", function(done) {
        eisenhertz.stop();
        setTimeout(done, 100);
    });
});