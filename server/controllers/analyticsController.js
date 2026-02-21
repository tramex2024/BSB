/**
 * BSB/server/controllers/analyticsController.js
 * CONTROLADOR DE ANALÍTICAS, RENDIMIENTO E HISTORIAL
 */

const mongoose = require('mongoose');
const TradeCycle = require('../models/TradeCycle');

/**
 * 1. OBTENER KPIs de Ciclos (Corregido: Soporte para 'all' y documentos sin status)
 */
exports.getCycleKpis = async (req, res) => {
    const userId = req.user.id;
    const strategyFilter = req.query.strategy || 'all';

    try {
        // 1. Construir el objeto de match dinámicamente
        const matchStage = {
            userId: new mongoose.Types.ObjectId(userId)
        };

        // 2. Si no es 'all', normalizamos y filtramos por estrategia
        if (strategyFilter !== 'all') {
            const formattedStrategy = strategyFilter.charAt(0).toUpperCase() + strategyFilter.slice(1).toLowerCase();
            matchStage.strategy = formattedStrategy;
        }

        // NOTA: Hemos omitido status: 'COMPLETED' para asegurar que lea tus datos actuales.
        // Si en el futuro agregas el campo status a la DB, puedes volver a incluirlo aquí.

        const kpis = await TradeCycle.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalCycles: { $sum: 1 }, 
                    averageProfitPercentage: { $avg: '$profitPercentage' }, 
                    totalNetProfit: { $sum: '$netProfit' },
                    // Calculamos ciclos ganadores para el Win Rate
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
                        $multiply: [ { $divide: ["$winningCycles", "$totalCycles"] }, 100 ] 
                    }
                }
            }
        ]);
        
        const result = kpis.length > 0 ? kpis[0] : { 
            totalCycles: 0, 
            averageProfitPercentage: 0, 
            totalNetProfit: 0,
            winRate: 0 
        };

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
    let strategyFilter = req.query.strategy; 

    try {
        // 1. Construcción dinámica del filtro
        const query = { 
            userId: new mongoose.Types.ObjectId(userId)
            // Quitamos status: 'COMPLETED' temporalmente o lo hacemos flexible
        };

        // 2. Lógica para "all" y normalización de Mayúsculas
        if (strategyFilter && strategyFilter !== 'all') {
            // Convierte 'long' en 'Long', 'short' en 'Short', etc.
            const formattedStrategy = strategyFilter.charAt(0).toUpperCase() + strategyFilter.slice(1).toLowerCase();
            query.strategy = formattedStrategy;
        }

        const cycles = await TradeCycle.find(query)
            .sort({ endTime: 1 })
            .select('endTime netProfit strategy') // Añadimos strategy para debug
            .lean();
        
        if (!cycles || cycles.length === 0) {
            return res.json({ success: true, data: [] });
        }

        let cumulativeProfit = 0;
        const curveData = cycles.map(cycle => {
            cumulativeProfit += (cycle.netProfit || 0);
            return {
                timestamp: cycle.endTime,
                strategy: cycle.strategy, // Útil para el frontend
                profit: parseFloat((cycle.netProfit || 0).toFixed(4)),
                cumulative: parseFloat(cumulativeProfit.toFixed(4))
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