// BSB/server/controllers/analyticsController.js

const mongoose = require('mongoose');
const TradeCycle = require('../models/TradeCycle'); // Importamos el modelo TradeCycle

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
    // Asumimos que el ID del bot se debe obtener del usuario autenticado (si tienes un setup multi-usuario)
    // o simplemente tomamos el ID del primer Autobot si solo tienes una instancia.
    // 💡 IMPORTANTE: Si solo usas UN bot (Autobot), puedes ajustar esto para buscar ese ID.
    const botId = req.user.autobotId; // Asumiendo que el ID del bot está en el token del usuario

    if (!botId) {
        return res.status(400).json({ success: false, message: 'Autobot ID no proporcionado en la solicitud.' });
    }

    try {
        const kpis = await TradeCycle.aggregate([
            {
                // 1. Filtrar solo por ciclos Long (para este dashboard) y por el bot específico
                $match: {
                    autobotId: new mongoose.Types.ObjectId(botId),
                    strategy: 'Long'
                }
            },
            {
                // 2. Agrupar todos los documentos filtrados en un solo resultado para calcular promedios/totales
                $group: {
                    _id: null, // Agrupar todos en un solo documento
                    
                    // 🎯 KPI 1: Total de ciclos cerrados
                    totalCycles: { $sum: 1 }, 
                    
                    // 🎯 KPI 2: Suma de porcentajes de ganancia (para luego calcular el promedio)
                    totalProfitPercentage: { $sum: '$profitPercentage' },
                }
            },
            {
                // 3. Proyectar el resultado final y calcular el promedio
                $project: {
                    _id: 0,
                    totalCycles: 1,
                    // Calcular el promedio del porcentaje de ganancia
                    averageProfitPercentage: {
                        $divide: ['$totalProfitPercentage', '$totalCycles']
                    }
                }
            }
        ]);

        // Si no hay ciclos, devolver valores predeterminados
        if (kpis.length === 0) {
             return res.json([{ averageProfitPercentage: 0, totalCycles: 0 }]);
        }

        res.json(kpis); // Devuelve un array con un solo objeto
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

    if (!botId) {
        return res.status(400).json({ success: false, message: 'Autobot ID no proporcionado en la solicitud.' });
    }

    try {
        const equityCurve = await TradeCycle.aggregate([
            {
                // 1. Filtrar por bot y estrategia Long (o la que quieras incluir en la curva)
                $match: {
                    autobotId: new mongoose.Types.ObjectId(botId),
                    strategy: 'Long'
                }
            },
            {
                // 2. Ordenar por tiempo de finalización para calcular la curva acumulada
                $sort: { endTime: 1 }
            },
            {
                // 3. Calcular la ganancia acumulada (running sum)
                $group: {
                    _id: null,
                    // Recorrer los ciclos y acumular la ganancia neta en cada paso
                    cycles: {
                        $push: {
                            endTime: '$endTime',
                            netProfit: '$netProfit',
                            // 💡 Es fundamental que tu backend soporte $reduce y $map para esto.
                            // Si tu MongoDB es muy antiguo, tendrás que calcular esto en el backend (JS) o frontend.
                            // Por simplicidad, y asumiendo un MongoDB moderno, usamos $push para el cálculo en JS.
                            // CÁLCULO MÁS SEGURO: Dejamos la acumulación en el Frontend/JS, y solo enviamos los datos.
                            // La agregación directa de $sum y $push a menudo es complicada de hacer en un solo paso
                            // sin un $window.

                            // 💡 ESTRATEGIA: Sólo enviar los datos brutos.
                            initialInvestment: '$initialInvestment', // Necesario para la línea base
                            finalRecovery: '$finalRecovery'
                        }
                    }
                }
            },
            {
                // 4. Desenrollar el array para devolver una lista plana y limpia de ciclos
                $unwind: '$cycles'
            },
            {
                // 5. Proyectar el formato final
                $project: {
                    _id: 0,
                    endTime: '$cycles.endTime',
                    netProfit: '$cycles.netProfit',
                    // Incluimos inversión y recuperación para que el frontend pueda calcular el valor del capital
                    initialInvestment: '$cycles.initialInvestment',
                    finalRecovery: '$cycles.finalRecovery'
                }
            }
        ]);

        // 💡 Cálculo de la Curva Acumulada en el servidor (JavaScript)
        // Ya que la agregación con $group, $sort, $window es compleja y depende de la versión de Mongo,
        // es más seguro y sencillo calcular la suma acumulada en la aplicación (Node.js) antes de enviar.

        let cumulativeProfit = 0;
        const curveDataWithCumulative = equityCurve.map(cycle => {
            cumulativeProfit += cycle.netProfit;
            return {
                endTime: cycle.endTime,
                netProfit: cycle.netProfit,
                cumulativeProfit: cumulativeProfit
            };
        });

        res.json(curveDataWithCumulative);

    } catch (error) {
        console.error('Error al obtener los datos de la Curva de Crecimiento:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al obtener la curva.' });
    }
};