// BSB/server/controllers/analyticsController.js

const mongoose = require('mongoose');
const TradeCycle = require('../models/TradeCycle'); // ✅ Modelo Correcto: TradeCycle

// =========================================================================
// 1. OBTENER KPIs de Ciclos Cerrados (Rendimiento Promedio y Total)
// Endpoint: /api/v1/analytics/kpis
// =========================================================================

/**
 * Calcula KPIs clave de los ciclos de trading completados (solo Long por ahora).
 * @param {object} req - Objeto de solicitud (request).
 * @param {object} res - Objeto de respuesta (response).
 */
exports.getCycleKpis = async (req, res) => {
    // 💡 Ajuste: Usar la estrategia 'Long' y 'Short' si quieres incluirlas, o dejar solo 'Long'
    const strategyFilter = req.query.strategy || 'Long'; 
    const botId = req.user.autobotId; 

    if (!botId) {
        // En un entorno de usuario único (single-user), puedes buscar el ID del bot aquí
        // O simplemente asumir que si el middleware authMiddleware funciona, el botId existe.
        return res.status(400).json({ success: false, message: 'Autobot ID no proporcionado en el token de usuario.' });
    }

    try {
        const kpis = await TradeCycle.aggregate([
            {
                // 1. Filtrar solo por el bot específico y la estrategia (Long)
                $match: {
                    autobotId: new mongoose.Types.ObjectId(botId),
                    strategy: strategyFilter
                }
            },
            {
                // 2. Agrupar todos los documentos filtrados en un solo resultado
                $group: {
                    _id: null,
                    totalCycles: { $sum: 1 }, 
                    totalProfitPercentage: { $sum: '$profitPercentage' },
                }
            },
            {
                // 3. Proyectar el resultado final y calcular el promedio
                $project: {
                    _id: 0,
                    totalCycles: 1,
                    // Calcular el promedio
                    averageProfitPercentage: {
                        $divide: ['$totalProfitPercentage', '$totalCycles']
                    }
                }
            }
        ]);

        // Aseguramos que el resultado es un array con el objeto KPI, como espera el frontend
        if (kpis.length === 0) {
            // ✅ CORRECCIÓN: Devolver un OBJETO, no un Array.
            return res.json({ averageProfitPercentage: 0, totalCycles: 0 });
        }

        // ✅ CORRECCIÓN: Devolver directamente el objeto calculado
        // No crees un array "finalKpis", solo crea el objeto.
        const result = {
            averageProfitPercentage: parseFloat(kpis[0].averageProfitPercentage.toFixed(4)),
            totalCycles: kpis[0].totalCycles
        };

        res.json(result); // Envías el objeto { averageProfitPercentage: X, totalCycles: Y }

    } catch (error) {
        console.error('Error al calcular KPIs del ciclo:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al calcular KPIs.' });
    }
};


// =========================================================================
// 2. OBTENER SERIE DE DATOS PARA CURVA DE CRECIMIENTO
// Endpoint: /api/v1/analytics/equity-curve
// =========================================================================

/**
 * Obtiene los datos necesarios para renderizar la Curva de Crecimiento de Capital.
 * @param {object} req - Objeto de solicitud (request).
 * @param {object} res - Objeto de respuesta (response).
 */
exports.getEquityCurveData = async (req, res) => {
    const botId = req.user.autobotId;
    const strategyFilter = req.query.strategy || 'Long'; 

    if (!botId) {
        return res.status(400).json({ success: false, message: 'Autobot ID no proporcionado.' });
    }

    try {        
        const cycles = await TradeCycle.find({
            autobotId: botId,
            strategy: strategyFilter,
            // 🛑 CRÍTICO: Agregar la condición de ciclo cerrado.
            endTime: { $exists: true, $ne: null } 
        })
        .sort({ endTime: 1 }) // Ordenar por tiempo de finalización (ascendente)
        .select('endTime netProfit initialInvestment finalRecovery')
        .lean(); // Usar .lean() para documentos más ligeros

        if (!cycles || cycles.length === 0) {
            return res.json([]);
        }

        // 💡 Cálculo del Acumulado en el servidor (JavaScript)
        let cumulativeProfit = 0;
        const curveDataWithCumulative = cycles.map(cycle => {
            cumulativeProfit += cycle.netProfit;
            return {
                endTime: cycle.endTime,
                netProfit: parseFloat(cycle.netProfit.toFixed(4)),
                // ✅ CRUCIAL: El frontend usará esto para el eje Y
                cumulativeProfit: parseFloat(cumulativeProfit.toFixed(4)) 
            };
        });

        res.json(curveDataWithCumulative);

    } catch (error) {
        console.error('Error al obtener los datos de la Curva de Crecimiento:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al obtener la curva.' });
    }
};