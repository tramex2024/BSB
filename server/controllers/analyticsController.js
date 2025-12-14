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
    const strategyFilter = req.query.strategy || 'Long'; 
    const botId = req.user.autobotId; 
    let botObjectId;

    // 💡 Intenta crear el ObjectId, si falla, es un ID inválido.
    try {
        botObjectId = new mongoose.Types.ObjectId(botId);
    } catch (e) {
        // Esto captura si el ID del token no es una cadena válida de 24 caracteres.
        console.error(`[KPI DEBUG] ID de bot inválido en token: ${botId}`, e);
        return res.json({ averageProfitPercentage: 0, totalCycles: 0 }); 
    }

    try {
        const kpis = await TradeCycle.aggregate([
            {
                $match: {
                    // 1. Usar el ObjectId ya creado
                    autobotId: botObjectId, 
                    strategy: strategyFilter,
                    
                    // 2. 🛑 CONDICIÓN DE CICLO CERRADO (CRÍTICO)
                    //endTime: { $exists: true, $ne: null },
                    //profitPercentage: { $exists: true, $ne: null, $gt: -100 } // profitPercentage > -100 (para evitar errores de cálculo extremos)
                }
            },
            {
                $group: {
                    _id: null,
                    totalCycles: { $sum: 1 }, 
                    // 💡 Simplificamos el cálculo del promedio aquí
                    averageProfitPercentage: { $avg: '$profitPercentage' }, 
                }
            },
            {
                // 3. Proyectar el resultado final y limpiar
                $project: {
                    _id: 0,
                    totalCycles: 1,
                    averageProfitPercentage: 1
                }
            }
        ]);
        
        // 🚨 LOG DE DEBUGGING CRÍTICO 1
    console.log(`\n======================================================`);
    console.log(`[KPI DEBUG] Consulta Final: ${kpis.length} documentos encontrados.`);
    if (kpis.length > 0) {
        console.log(`[KPI DEBUG] Resultado de la Agregación KPI:`, kpis[0]);
    }
    console.log(`======================================================\n`);

        // 4. Formato de Respuesta
        if (kpis.length === 0) {
            return res.json({ averageProfitPercentage: 0, totalCycles: 0 });
        }

        // Devolver un OBJETO ÚNICO, no un array de objetos
        const result = {
            averageProfitPercentage: parseFloat(kpis[0].averageProfitPercentage.toFixed(4)),
            totalCycles: kpis[0].totalCycles
        };

        res.json(result); 
    } catch (error) {
        console.error('Error al calcular KPIs del ciclo:', error);
        res.status(500).json({ averageProfitPercentage: 0, totalCycles: 0 });
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

    try {
        const cycles = await TradeCycle.find({
            // 🛑 Usar el botId como string es válido en .find() si Mongoose lo permite. 
            // Para asegurar, lo mejor es usar new mongoose.Types.ObjectId(botId)
            autobotId: new mongoose.Types.ObjectId(botId),
            strategy: strategyFilter,
            // 🛑 Condición de ciclo cerrado
            //endTime: { $exists: true, $ne: null } 
        })
        .sort({ endTime: 1 })// Ordenar por tiempo de finalización (ascendente)
        .select('endTime netProfit initialInvestment finalRecovery')
        .lean(); // Usar .lean() para documentos más ligeros
        
        / 🚨 LOG DE DEBUGGING CRÍTICO 2
    console.log(`\n------------------------------------------------------`);
    console.log(`[CURVE DEBUG] Consulta Final: ${cycles.length} ciclos encontrados.`);
    if (cycles.length > 0) {
        // Muestra el primer ciclo encontrado para verificar la estructura
        console.log(`[CURVE DEBUG] Primer Ciclo (Muestra):`, cycles[0]);
    }
    console.log(`------------------------------------------------------\n`);

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