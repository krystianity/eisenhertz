"use strict";

const Eisenhertz = require("./lib/Eisenhertz.js");
const defaultConfig = require("./config/default.js");
const defaultLogger = require("./config/defaultLogger.js");

const eisenhertz = new Eisenhertz(defaultConfig, defaultLogger);
eisenhertz.start();