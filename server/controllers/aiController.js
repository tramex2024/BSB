const aiEngine = require('../src/ai/aiEngine');
const AIBotOrder = require('../models/AIBotOrder');

exports.getAIStatus = async (req, res) => {
    res.json({
        isRunning: aiEngine.isRunning,
        isVirtual: aiEngine.isVirtual,
        threshold: aiEngine.confidenceThreshold
    });
};

exports.toggleAI = async (req, res) => {
    aiEngine.isRunning = !aiEngine.isRunning;
    res.json({ success: true, isRunning: aiEngine.isRunning });
};

exports.getVirtualHistory = async (req, res) => {
    const history = await AIBotOrder.find().sort({ timestamp: -1 }).limit(20);
    res.json(history);
};