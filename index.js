"use strict";

const Eisenhertz = require("./lib/Eisenhertz.js");
const ForkProcess = require("./lib/fork/ForkProcess.js");
const defaultConfig = require("./config/default.js");
const defaultLogger = require("./config/defaultLogger.js");

module.exports = {
    Eisenhertz,
    ForkProcess,
    defaultConfig,
    defaultLogger
};