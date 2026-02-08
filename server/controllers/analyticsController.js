/**
 * BSB/server/controllers/analyticsController.js
 * CONTROLADOR DE ANALÍTICAS, RENDIMIENTO E HISTORIAL
 */

const mongoose = require('mongoose');
const TradeCycle = require('../models/TradeCycle');

/**
 * 1. OBTENER KPIs de Ciclos Cerrados (Win Rate, Profit Medio, etc.)
 */
exports.getCycleKpis = async (req, res) => {
    const userId = req.user.id;
    const strategyFilter = req.query.strategy || 'Long';

    try {
        const kpis = await TradeCycle.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId), 
                    strategy: strategyFilter,
                    status: 'COMPLETED'
                }
            },
            {
                $group: {
                    _id: null,
                    totalCycles: { $sum: 1 }, 
                    averageProfitPercentage: { $avg: '$profitPercentage' }, 
                    totalNetProfit: { $sum: '$netProfit' }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalCycles: 1,
                    averageProfitPercentage: { $round: ["$averageProfitPercentage", 2] },
                    totalNetProfit: { $round: ["$totalNetProfit", 2] }
                }
            }
        ]);
        
        const result = kpis.length > 0 ? kpis[0] : { totalCycles: 0, averageProfitPercentage: 0, totalNetProfit: 0 };

        res.json({ success: true, data: result }); 

    } catch (error) {
        console.error('❌ [ANALYTICS-KPI] Error:', error.message);
        res.status(500).json({ success: false, message: 'Error al calcular estadísticas.' });
    }
};

/**
 * 2. OBTENER SERIE DE DATOS PARA GRÁFICA DE EQUIDAD
 */
exports.getEquityCurveData = async (req, res) => {
    const userId = req.user.id;
    const strategyFilter = req.query.strategy || 'Long'; 

    try {
        const cycles = await TradeCycle.find({
            userId: new mongoose.Types.ObjectId(userId),
            strategy: strategyFilter,
            status: 'COMPLETED'
        })
        .sort({ endTime: 1 })
        .select('endTime netProfit')
        .lean();
        
        if (!cycles || cycles.length === 0) {
            return res.json({ success: true, data: [] });
        }

        let cumulativeProfit = 0;
        const curveData = cycles.map(cycle => {
            cumulativeProfit += (cycle.netProfit || 0);
            return {
                timestamp: cycle.endTime,
                profit: parseFloat((cycle.netProfit || 0).toFixed(2)),
                cumulative: parseFloat(cumulativeProfit.toFixed(2))
            };
        });

        res.json({ success: true, data: curveData });

    } catch (error) {
        console.error('❌ [ANALYTICS-CURVE] Error:', error.message);
        res.status(500).json({ success: false, data: [] });
    }
};

/**
 * 3. OBTENER LISTADO DE CICLOS (Para la tabla de historial)
 */
exports.getTradeCycles = async (req, res) => {
    const userId = req.user.id;
    const { strategy, limit = 20, page = 1 } = req.query;

    try {
        const filter = { userId: new mongoose.Types.ObjectId(userId) };
        if (strategy) filter.strategy = strategy;

        const cycles = await TradeCycle.find(filter)
            .sort({ startTime: -1 }) // Los más recientes primero
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        const total = await TradeCycle.countDocuments(filter);

        res.json({ 
            success: true, 
            data: cycles,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('❌ [ANALYTICS-LIST] Error:', error.message);
        res.status(500).json({ success: false, message: 'Error al obtener el historial de ciclos.' });
    }
};