// models/Autobot.js
const mongoose = require('mongoose');

const autobotConfigSchema = new mongoose.Schema({
    lstate: { type: String, default: 'STOPPED' },
    sstate: { type: String, default: 'STOPPED' },
    longConfig: {
        purchase: Number,
        increment: Number,
        trigger: Number
    },
    shortConfig: {
        purchase: Number,
        increment: Number,
        trigger: Number
    }
});

module.exports = mongoose.model('Autobot', autobotConfigSchema);