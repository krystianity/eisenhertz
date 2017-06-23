"use strict";

class Fork {

    constructor() {

        this.forkId = process.argv[2];

        process.on("message", message => {
            console.log(message);
            process.send({ message });
        });

        process.send({
            hi: "dad",
            im: this.forkId
        });
    }

    run() {
        setInterval(() => {
            console.log(`ì am a fork`);
        }, 1000);
    }
}

const fork = new Fork();
fork.run();