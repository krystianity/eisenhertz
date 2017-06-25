"use strict";

const Logger = require("log4bro");

module.exports = () => {
    return new Logger({
        level: "INFO"
    });
};