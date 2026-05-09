/**
 * BSB/server/controllers/analyticsController.js
 * CONTROLADOR DE ANALÍTICAS - VERSIÓN PRODUCCIÓN
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
 * OBTENER KPIs de Ciclos - Versión Optimizada
 * Calcula promedios de órdenes, recuperación y duración.
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
                    totalNetProfit: { $sum: '$netProfit' },
                    totalProfitPct: { $sum: '$profitPercentage' },
                    totalOrders: { $sum: '$orderCount' },
                    totalRecovery: { $sum: '$finalRecovery' },
                    // Cálculo de duración total en milisegundos
                    totalDurationMs: { 
                        $sum: { $subtract: ["$endTime", "$startTime"] } 
                    },
                    winningCycles: {
                        $sum: { $cond: [{ $gt: ["$netProfit", 0] }, 1, 0] }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalCycles: 1,
                    totalNetProfit: { $round: ["$totalNetProfit", 2] },
                    winRate: { 
                        $cond: [{ $eq: ["$totalCycles", 0] }, 0, 
                        { $multiply: [{ $divide: ["$winningCycles", "$totalCycles"] }, 100] }] 
                    },
                    // Promedios críticos para el Dashboard
                    avgProfitPct: { 
                        $cond: [{ $eq: ["$totalCycles", 0] }, 0, { $divide: ["$totalProfitPct", "$totalCycles"] }] 
                    },
                    avgOrders: { 
                        $cond: [{ $eq: ["$totalCycles", 0] }, 0, { $divide: ["$totalOrders", "$totalCycles"] }] 
                    },
                    avgRecovery: { 
                        $cond: [{ $eq: ["$totalCycles", 0] }, 0, { $divide: ["$totalRecovery", "$totalCycles"] }] 
                    },
                    // Convertir duración promedio de ms a horas
                    avgDurationHours: {
                        $cond: [
                            { $eq: ["$totalCycles", 0] }, 
                            0, 
                            { $divide: [{ $divide: ["$totalDurationMs", "$totalCycles"] }, 3600000] }
                        ]
                    }
                }
            }
        ]);

        res.json({ 
            success: true, 
            data: kpis[0] || { totalCycles: 0, totalNetProfit: 0, winRate: 0, avgProfitPct: 0, avgOrders: 0, avgRecovery: 0, avgDurationHours: 0 } 
        });
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
                profit: parseFloat((cycle.netProfit || 0)),
                cumulative: parseFloat(cumulativeProfit)
            };
        });

        res.json({ success: true, data: curveData });
    } catch (error) {
        res.status(500).json({ success: false, data: [] });
    }
};

/**
 * 3. OBTENER LISTADO DE CICLOS - VERSIÓN CORREGIDA
 * Se eliminó el límite forzado para permitir analíticas completas.
 */
exports.getTradeCycles = async (req, res) => {
    const userId = req.user.id;
    const { strategy, limit, page = 1 } = req.query; // Quitamos el limit = 20 por defecto
    const strategyFilter = normalize(strategy || 'all');

    try {
        const filter = { userId: new mongoose.Types.ObjectId(userId) };
        if (strategyFilter !== 'all') filter.strategy = strategyFilter;

        // Lógica de paginación inteligente:
        // Si no se envía un límite (como en la carga inicial del Dashboard), traemos TODO.
        const parsedLimit = limit ? parseInt(limit) : 0; 
        const parsedPage = parseInt(page);

        const [cycles, total] = await Promise.all([
            TradeCycle.find(filter)
                .sort({ startTime: -1 })
                .limit(parsedLimit) // Si es 0, Mongoose ignora el límite
                .skip(parsedLimit ? (parsedPage - 1) * parsedLimit : 0)
                .lean(),
            TradeCycle.countDocuments(filter)
        ]);

        res.json({ 
            success: true, 
            data: cycles,
            pagination: { 
                total, 
                page: parsedPage, 
                pages: parsedLimit ? Math.ceil(total / parsedLimit) : 1 
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};