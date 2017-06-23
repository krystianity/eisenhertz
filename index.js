"use strict";

const Eisenhertz = require("./lib/Eisenhertz.js");
const defaultConfig = require("./config/default.js");
const defaultLogger = require("./config/defaultLogger.js");

const eisenhertz = new Eisenhertz(defaultConfig, defaultLogger);

const fetchNames = callback => {
    callback(null, [
        "one",
        "two",
        "three"
    ]);
};

const fetchDetails = (id, callback) => {
    callback(null, {
        worker: `data-${id}`
    });
};

eisenhertz.start(fetchNames, fetchDetails).catch(error => console.log(error));