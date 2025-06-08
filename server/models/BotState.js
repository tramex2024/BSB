const mongoose = require('mongoose');

// Define the schema for your bot's state
const BotStateSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true // Ensures each user has only one state entry
    },
    state: {
        type: String,
        required: true
    },
    // You can add more fields here as needed for your bot's state
    // For example:
    // conversationHistory: {
    //     type: Array,
    //     default: []
    // },
    // lastInteraction: {
    //     type: Date,
    //     default: Date.now
    // }
}, {
    timestamps: true // Adds createdAt and updatedAt fields automatically
});

// Create the Mongoose model from the schema
const BotState = mongoose.model('BotState', BotStateSchema);

module.exports = BotState;