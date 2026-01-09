// BSB/server/controllers/analyticsController.js

const mongoose = require('mongoose');
const TradeCycle = require('../models/TradeCycle');

/**
 * 1. OBTENER KPIs de Ciclos Cerrados
 */
exports.getCycleKpis = async (req, res) => {
    const strategyFilter = req.query.strategy || 'Long'; 
    const botId = req.user.autobotId; 
    let botObjectId;

    try {
        botObjectId = new mongoose.Types.ObjectId(botId);
    } catch (e) {
        return res.json({ success: false, data: { averageProfitPercentage: 0, totalCycles: 0 } }); 
    }

    try {
        const kpis = await TradeCycle.aggregate([
            {
                $match: {
                    autobotId: botObjectId, 
                    strategy: strategyFilter,
                    // Descomenta esto cuando quieras filtrar solo ciclos finalizados:
                    // endTime: { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: null,
                    totalCycles: { $sum: 1 }, 
                    averageProfitPercentage: { $avg: '$profitPercentage' }, 
                }
            },
            {
                $project: {
                    _id: 0,
                    totalCycles: 1,
                    averageProfitPercentage: 1
                }
            }
        ]);
        
        if (kpis.length === 0) {
            return res.json({ success: true, data: { averageProfitPercentage: 0, totalCycles: 0 } });
        }

        const result = {
            averageProfitPercentage: parseFloat(kpis[0].averageProfitPercentage.toFixed(4)),
            totalCycles: kpis[0].totalCycles
        };

        // ✅ Respuesta envuelta para apiService.js
        res.json({ success: true, data: result }); 

    } catch (error) {
        console.error('Error al calcular KPIs:', error);
        res.status(500).json({ success: false, data: { averageProfitPercentage: 0, totalCycles: 0 } });
    }
};

/**
 * 2. OBTENER SERIE DE DATOS PARA CURVA DE CRECIMIENTO
 */
exports.getEquityCurveData = async (req, res) => {
    const botId = req.user.autobotId;
    const strategyFilter = req.query.strategy || 'Long'; 

    try {
        const cycles = await TradeCycle.find({
            autobotId: new mongoose.Types.ObjectId(botId),
            strategy: strategyFilter
        })
        .sort({ endTime: 1 })
        .select('endTime netProfit initialInvestment')
        .lean();
        
        if (!cycles || cycles.length === 0) {
            return res.json({ success: true, data: [] });
        }

        let cumulativeProfit = 0;
        const curveDataWithCumulative = cycles.map(cycle => {
            cumulativeProfit += (cycle.netProfit || 0);
            return {
                endTime: cycle.endTime,
                netProfit: parseFloat((cycle.netProfit || 0).toFixed(4)),
                cumulativeProfit: parseFloat(cumulativeProfit.toFixed(4)),
                // Agregamos esto por si tu chart.js lo necesita:
                accumulatedProfit: parseFloat(cumulativeProfit.toFixed(4)) 
            };
        });

        // ✅ Respuesta envuelta para apiService.js
        res.json({ success: true, data: curveDataWithCumulative });

    } catch (error) {
        console.error('Error al obtener curva:', error);
        res.status(500).json({ success: false, message: 'Error interno', data: [] });
    }
};