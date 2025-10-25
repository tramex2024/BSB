// BSB/server/src/states/long/LBuying.js

const { checkAndPlaceCoverageOrder } = require('../../utils/coverageLogic'); 
// Se asume que orderManager tiene las funciones necesarias
// const { placeCoverageBuyOrder } = require('../../utils/orderManager'); 
const { getOrderDetail } = require('../../../services/bitmartService'); 
const { handleSuccessfulBuy } = require('../../utils/dataManager'); 

// Valor mínimo de orden para BitMart (se puede obtener de la configuración)
const MIN_USDT_VALUE_FOR_BITMART = 5.00; 

/**
 * Función central de la estrategia Long en estado BUYING.
 * Maneja la recuperación de órdenes, la inicialización de targets y el monitoreo de cobertura/venta.
 */
async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateBotState, updateLStateData, updateGeneralBotState,
    } = dependencies;
    
    const SYMBOL = String(config.symbol || 'BTC_USDT'); 
    const lStateData = botState.lStateData;

    log("Estado Long: BUYING. Verificando el estado de la última orden o gestionando compras de cobertura...", 'info');
    
    // =================================================================
    // === [ BLOQUE CRÍTICO DE RECUPERACIÓN DE SERVIDOR ] ================
    // =================================================================
    const lastOrder = lStateData.lastOrder;

    // 1. Verificar si hay una orden de compra pendiente registrada en la DB
    if (lastOrder && lastOrder.order_id && lastOrder.side === 'buy') {
        
        const orderIdString = String(lastOrder.order_id); 
        log(`Recuperación: Orden de compra pendiente con ID ${orderIdString} detectada en DB. Consultando BitMart...`, 'warning');

        try {
            const orderDetails = await getOrderDetail(SYMBOL, orderIdString);
            
            if (orderDetails) {
                
                // PASO 1: Extracción de Montos de la Orden para la comparación
                const totalRequestedAmount = parseFloat(orderDetails.amount || 0); // La cantidad total solicitada ('All Btc' en tu app)
                const filledVolume = parseFloat(orderDetails.filled_volume || 0); // La cantidad ejecutada ('filled' en tu app)

                // PASO 2: Nueva Condición de Éxito (TOTAL)
                const isOrderFullyFilled = 
                    orderDetails.state === 'filled' || 
                    (orderDetails.state === 'partially_canceled' && filledVolume >= totalRequestedAmount);

                if (isOrderFullyFilled) {
                    // Si está completada (total o total disfrazada)
                    log(`Recuperación exitosa: La orden ID ${orderIdString} se completó (Estado: ${orderDetails.state}). Procesando...`, 'success');
                    
                    // handleSuccessfulBuy: Actualiza PPC, AC, lastExecutionPrice y limpia lastOrder.
                    // Nota: Asumimos que handleSuccessfulBuy sabe manejar el reembolso de lo no gastado (si aplica).
                    await handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState, log); 
                    return;

                } else if (orderDetails.state === 'new' || orderDetails.state === 'partially_filled' || 
                           (orderDetails.state === 'partially_canceled' && filledVolume > 0 && filledVolume < totalRequestedAmount)) {
                    
                    // Condición para seguir esperando o manejar una ejecución parcial real:
                    // new, partially_filled, o partially_canceled con ejecución parcial real.
                    
                    if (filledVolume > 0 && orderDetails.state === 'partially_filled') {
                         // Si es partially_filled, procesamos la parte ejecutada y seguimos esperando o pasamos a cobertura.
                         // *** IMPORTANTE: Si la lógica de tu bot permite pasar a cobertura después de un 'partially_filled'
                         // sin esperar el resto, entonces handleSuccessfulBuy debe ser llamado aquí.
                         log(`Recuperación: La orden ID ${orderIdString} tiene ejecución parcial (${filledVolume}/${totalRequestedAmount}). Procesando parte ejecutada.`, 'info');
                         await handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState, log);
                         return; // El ciclo continuará con la lógica de monitoreo de targets.
                    } else {
                        log(`Recuperación: La orden ID ${orderIdString} sigue ${orderDetails.state} en BitMart. Esperando.`, 'info');
                        // Continuar esperando a la próxima iteración.
                        return;
                    }

                } else {
                    // Asumiendo fallo (e.g., canceled sin ejecución, o no encontrada).
                    log(`La orden ID ${orderIdString} no está activa ni completada (Estado: ${orderDetails.state}). Limpiando lastOrder.`, 'error');
                    await updateLStateData({ 'lastOrder': null });
                    // Aquí se debería llamar a handleSuccessfulBuy si es un 'canceled' total para reembolsar el balance
                    // Pero como no tenemos la info completa de 'canceled', nos limitamos a limpiar y salir.
                    return; 
                }

            } else {
                // orderDetails es nulo o vacío
                log(`Advertencia: No se pudo obtener detalle para la orden ID ${orderIdString}. Reintentando.`, 'warning');
                return;
            }

        } catch (error) {
            log(`Error al consultar orden en BitMart durante la recuperación: ${error.message}`, 'error');
            // Mantenemos el estado BUYING para reintentar la consulta en el siguiente ciclo
            return;
        }
    }
    // =================================================================
    // === [ FIN DEL BLOQUE DE RECUPERACIÓN ] ============================
    // =================================================================

    // --- 2. INICIALIZACIÓN DE TARGETS (Si es la primera vez que se entra en BUYING) ---
    // Usamos lStateData.pc === 0 como indicador de que los targets no han sido calculados.
    if (lStateData.pc === 0 && lStateData.ppc > 0) {
        log('Calculando objetivos iniciales (Venta/Cobertura) para la nueva posición...', 'info');

        const ppc = lStateData.ppc; // Precio Promedio de Compra
        const lastExecutionPrice = lStateData.lastExecutionPrice || ppc; // Precio real de la última ejecución

        // CÁLCULO DE TARGETS INICIALES
        const profitPercent = config.long.profit_percent / 100;
        const priceVariance = config.long.price_var / 100;
        const sizeVariance = config.long.size_var / 100;
        
        // 2a. CALCULAR LTPRICE (Precio Objetivo de Venta)
        const targetSellPrice = ppc * (1 + profitPercent);
        
        // 2b. CALCULAR PC (Precio de Caída). Inicialmente, se basa en el Precio Máximo (que es lastExecutionPrice al inicio).
        const currentPM = lastExecutionPrice; // En la primera inicialización, PM es la ejecución de la orden 1
        const fallPrice = currentPM * (1 - priceVariance);

        // 2c. CALCULAR NEXT COVERAGE PRICE (Próxima Compra: Progresión Geométrica del Precio)
        // Precio de Cobertura = Precio de Ejecución Anterior * (1 - Price_Var)
        const nextCoveragePrice = lastExecutionPrice * (1 - priceVariance); 

        // 2d. CALCULAR REQUIRED COVERAGE AMOUNT (Monto de la Próxima Orden: Progresión Geométrica del Monto)
        // El monto de la orden 1 es 'purchaseUsdt'. La orden 2 usa este valor como base para la progresión.
        // Monto de Cobertura = Monto Anterior * (1 + Size_Var)
        const previousOrderAmount = config.long.purchaseUsdt; 
        const nextCoverageAmount = previousOrderAmount * (1 + sizeVariance);

        const update = {
            'ltprice': targetSellPrice, // TargetPrice global
            'lStateData.pc': fallPrice, // Precio de Caída (Venta de Cobertura)
            'lStateData.pm': currentPM, // Inicialización del Precio Máximo
            'lStateData.nextCoveragePrice': nextCoveragePrice, // Precio de Próxima Compra
            'lStateData.requiredCoverageAmount': nextCoverageAmount, // Monto para la siguiente compra
        };

        // 🚨 Es vital que guardemos el PPC y el AC previamente
        // Ya que updateGeneralBotState solo acepta campos de primer nivel
        await updateGeneralBotState({ ltprice: targetSellPrice });
        await updateLStateData(update); // Guardamos todos los sub-campos

        log(`Targets Iniciales establecidos. Venta (ltprice): ${targetSellPrice.toFixed(2)}, Próxima Cobertura: ${nextCoveragePrice.toFixed(2)} (${nextCoverageAmount.toFixed(2)} USDT)`, 'success');
        
        // Retornar para que la próxima iteración ya tenga los targets para monitorear.
        return;
    }
    
    // --- 3. MONITOREO CONTINUO ---

    if (lStateData.ppc > 0 && lStateData.ac > 0 && lStateData.pc > 0) {
        
        // 3a. ACTUALIZACIÓN DINÁMICA DE PM y PC (Trailing logic)
        // PM solo debe subir.
        if (currentPrice > lStateData.pm) {
            
            const priceVariance = config.long.price_var / 100;
            const newPM = currentPrice;
            const newPC = newPM * (1 - priceVariance);
            
            // Si el nuevo precio de caída es mayor que el anterior, lo actualizamos (trailing up)
            if (newPC > lStateData.pc) {
                lStateData.pm = newPM;
                lStateData.pc = newPC;
                
                // Actualizar DB
                await updateLStateData({ 
                    'lStateData.pm': newPM,
                    'lStateData.pc': newPC
                });
                log(`PM actualizado a ${newPM.toFixed(2)}. PC (Precio de Caída) actualizado a ${newPC.toFixed(2)}.`, 'warning');
            }
        }

        // 3b. TRIGGER DE VENTA (ltprice)
        if (currentPrice >= lStateData.ltprice) {
            log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó o superó el objetivo de venta (${lStateData.ltprice.toFixed(2)}). Transicionando a SELLING.`, 'success'); 
            await updateBotState('SELLING', 'long');
            return;
        }

        // 3c. TRIGGER DE COBERTURA (nextCoveragePrice)
        const nextCoverageAmount = lStateData.requiredCoverageAmount;
        
        if (currentPrice <= lStateData.nextCoveragePrice && botState.lbalance >= nextCoverageAmount) {
            log(`PRECIO DE COBERTURA ALCANZADO (${lStateData.nextCoveragePrice.toFixed(2)}). Intentando nueva compra de cobertura por ${nextCoverageAmount.toFixed(2)} USDT.`, 'warning');
            
            // Revertir el estado a RUNNING si el capital no es suficiente:
            if (botState.lbalance < nextCoverageAmount) {
                log('Advertencia: Capital insuficiente para la siguiente orden de cobertura. Reingresando a RUNNING para esperar señal.', 'error');
                await updateBotState('RUNNING', 'long');
                return;
            }

            // Aquí se llamaría a la función que inicia la orden de compra de cobertura.
            // await checkAndPlaceCoverageOrder(dependencies, nextCoverageAmount); 
            // Para la prueba, simplemente logueamos que se colocaría la orden:
            // log("Orden de Cobertura Colocada (Simulación)", 'debug');
            
        }
    }
}

module.exports = { run };
