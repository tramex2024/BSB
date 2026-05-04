/**
 * BSB/server/controllers/analyticsController.js
 * CONTROLADOR DE ANALÍTICAS - VERSIÓN AUDITADA Y CORREGIDA
 */

const mongoose = require('mongoose');
const TradeCycle = require('../models/TradeCycle');

// Función auxiliar para normalizar nombres de estrategia (Evita el fallo Ai vs AI)
const normalize = (s) => {
    if (!s || s === 'all') return 'all';
    if (s.toLowerCase() === 'ai') return 'AI';
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

/**
 * 1. OBTENER KPIs de Ciclos
 */
exports.getCycleKpis = async (req, res) => {
    const userId = req.user.id;
    const strategyFilter = normalize(req.query.strategy || 'all');

    try {
        const matchStage = { userId: new mongoose.Types.ObjectId(userId) };
        if (strategyFilter !== 'all') matchStage.strategy = strategyFilter;

        const kpis = await TradeCycle.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalCycles: { $sum: 1 }, 
                    averageProfitPercentage: { $avg: '$profitPercentage' }, 
                    totalNetProfit: { $sum: '$netProfit' },
                    winningCycles: {
                        $sum: { $cond: [{ $gt: ["$netProfit", 0] }, 1, 0] }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalCycles: 1,
                    averageProfitPercentage: { $round: ["$averageProfitPercentage", 2] },
                    totalNetProfit: { $round: ["$totalNetProfit", 2] },
                    winRate: { 
                        $cond: [
                            { $eq: ["$totalCycles", 0] }, 
                            0, 
                            { $multiply: [ { $divide: ["$winningCycles", "$totalCycles"] }, 100 ] }
                        ]
                    }
                }
            }
        ]);
        
        res.json({ success: true, data: kpis[0] || { totalCycles: 0, averageProfitPercentage: 0, totalNetProfit: 0, winRate: 0 } }); 
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 2. OBTENER SERIE DE DATOS PARA GRÁFICA
 */
exports.getEquityCurveData = async (req, res) => {
    const userId = req.user.id;
    const strategyFilter = normalize(req.query.strategy || 'all');

    try {
        const query = { userId: new mongoose.Types.ObjectId(userId) };
        if (strategyFilter !== 'all') query.strategy = strategyFilter;

        const cycles = await TradeCycle.find(query).sort({ endTime: 1 }).lean();
        
        let cumulativeProfit = 0;
        const curveData = cycles.map(cycle => {
            cumulativeProfit += (cycle.netProfit || 0);
            return {
                timestamp: cycle.endTime,
                strategy: cycle.strategy,
                profit: parseFloat((cycle.netProfit || 0).toFixed(4)),
                cumulative: parseFloat(cumulativeProfit.toFixed(4))
            };
        });

        res.json({ success: true, data: curveData });
    } catch (error) {
        res.status(500).json({ success: false, data: [] });
    }
};

/**
 * 3. OBTENER LISTADO DE CICLOS
 */
exports.getTradeCycles = async (req, res) => {
    const userId = req.user.id;
    const { strategy, limit = 20, page = 1 } = req.query;
    const strategyFilter = normalize(strategy || 'all');

    try {
        const filter = { userId: new mongoose.Types.ObjectId(userId) };
        if (strategyFilter !== 'all') filter.strategy = strategyFilter;

        const [cycles, total] = await Promise.all([
            TradeCycle.find(filter)
                .sort({ startTime: -1 })
                .limit(parseInt(limit))
                .skip((parseInt(page) - 1) * parseInt(limit))
                .lean(),
            TradeCycle.countDocuments(filter)
        ]);

        res.json({ 
            success: true, 
            data: cycles,
            pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};