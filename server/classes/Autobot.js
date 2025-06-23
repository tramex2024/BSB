// server/classes/Autobot.js

const { MIN_USDT_VALUE_FOR_BITMART } = require('../config');
const bitmartService = require('../services/bitmartService'); // Asegúrate de que este servicio pueda tomar credenciales por instancia
const BotStateModel = require('../models/BotState'); // Usaremos el modelo directamente
const { runAnalysis } = require('../bitmart_indicator_analyzer'); // Reutilizamos el analizador para sus señales de compra

// Define el par de trading para el Autobot
const TRADE_SYMBOL = 'BTC_USDT';

class Autobot {
    constructor(userId, apiCredentials, ioInstance) {
        this.userId = userId;
        this.apiCredentials = apiCredentials; // { apiKey, apiSecret, memo }
        this.ioInstance = ioInstance; // Socket.IO instance for real-time updates
        this.botState = null; // Will be loaded from DB
        this.strategyIntervalId = null; // To hold setInterval ID

        // Bind 'this' to methods that will be passed as callbacks
        this.runBotLogic = this.runBotLogic.bind(this);
    }

    async loadBotState() {
        try {
            let userBotState = await BotStateModel.findOne({ userId: this.userId });
            if (!userBotState) {
                // If no state exists, create a default one
                userBotState = new BotStateModel({ userId: this.userId });
                await userBotState.save();
                console.log(`[AUTOBOT-${this.userId}] Estado inicial del bot creado.`);
            }
            this.botState = userBotState.autobot; // Load the specific 'autobot' part of the state
            console.log(`[AUTOBOT-${this.userId}] Estado del Autobot cargado para el usuario ${this.userId}. Estado actual: ${this.botState.state}`);
        } catch (error) {
            console.error(`[AUTOBOT-${this.userId}] Error al cargar el estado del Autobot:`, error.message);
            // Optionally, set bot to ERROR state or re-throw
            this.botState = null; // Ensure it's null if load fails
            throw new Error(`Failed to load Autobot state: ${error.message}`);
        }
    }

    async saveBotState() {
        if (!this.botState) {
            console.warn(`[AUTOBOT-${this.userId}] No hay estado del Autobot para guardar.`);
            return;
        }
        try {
            // Find and update only the 'autobot' subdocument
            await BotStateModel.findOneAndUpdate(
                { userId: this.userId },
                { $set: { autobot: this.botState } },
                { upsert: true, new: true } // Create if not exists, return updated doc
            );
            // console.log(`[AUTOBOT-${this.userId}] Estado del Autobot guardado.`);
        } catch (error) {
            console.error(`[AUTOBOT-${this.userId}] Error al guardar el estado del Autobot:`, error.message);
        }
    }

    resetCycleVariables() {
        // Reinicia las variables al inicio de un nuevo ciclo de compra/venta
        this.botState.cycleProfit = 0;
        this.botState.ppc = 0;
        this.botState.cp = 0;
        this.botState.ac = 0;
        this.botState.pm = 0;
        this.botState.pv = 0;
        this.botState.pc = 0;
        this.botState.lastOrder = {};
        this.botState.orderCountInCycle = 0;
        this.botState.lastOrderUSDTAmount = 0;
        this.botState.nextCoverageUSDTAmount = 0;
        this.botState.nextCoverageTargetPrice = 0;
    }

    async getAccountBalance(currency) {
        try {
            // Call bitmartService with instance-specific API credentials
            const balanceData = await bitmartService.getWalletBalance(currency, this.apiCredentials);
            // console.log(`[AUTOBOT-${this.userId}] Saldo de ${currency}:`, balanceData);
            return parseFloat(balanceData.available); // Return available balance
        } catch (error) {
            console.error(`[AUTOBOT-${this.userId}] Error al obtener balance de ${currency}:`, error.message);
            this.botState.state = 'ERROR';
            this.ioInstance.to(this.userId).emit('botError', { botType: 'autobot', message: `Error al obtener balance de ${currency}: ${error.message}` });
            return 0; // Return 0 on error
        }
    }

    async placeBuyOrder(amountUSDT, targetPrice) {
        if (amountUSDT <= 0) {
            console.warn(`[AUTOBOT-${this.userId}] Intento de compra con monto USDT <= 0. Abortando.`);
            return false;
        }

        try {
            // Use bitmartService with instance-specific API credentials
            const order = await bitmartService.placeLimitOrder(
                TRADE_SYMBOL,
                'buy',
                amountUSDT, // Amount in USDT for market buy, or base currency for limit buy (needs clarification in bitmartService)
                targetPrice, // Target price for limit order
                this.apiCredentials
            );

            console.log(`[AUTOBOT-${this.userId}] Orden de compra (limit) colocada:`, order);

            // Update bot state after successful order placement
            this.botState.lastOrder = {
                orderId: order.order_id,
                price: targetPrice,
                size: amountUSDT, // Assuming amountUSDT is the quote volume here
                side: 'buy',
                type: 'limit',
                state: 'placed'
            };
            this.botState.openOrders.push({
                orderId: order.order_id,
                symbol: TRADE_SYMBOL,
                side: 'buy',
                price: targetPrice,
                // amount: order.amount, // BitMart API usually returns base asset amount
                amount: amountUSDT, // For tracking, assuming this is USDT amount requested
                time: Date.now()
            });

            // Emit to frontend
            this.ioInstance.to(this.userId).emit('autobotLog', `Orden de compra colocada: ${amountUSDT} USDT @ ${targetPrice}`);
            return true;

        } catch (error) {
            console.error(`[AUTOBOT-${this.userId}] Error al colocar orden de compra:`, error.message);
            this.ioInstance.to(this.userId).emit('autobotLog', `ERROR al colocar orden de compra: ${error.message}`);
            // Potencialmente cambiar el estado a ERROR o NO_COVERAGE si el problema es de balance
            if (error.message.includes('balance') || error.message.includes('funds')) {
                this.botState.state = 'NO_COVERAGE';
                this.ioInstance.to(this.userId).emit('botStateUpdate', { autobot: this.botState });
            } else {
                // Decide si un error de orden debe detener completamente el bot
                // this.botState.state = 'ERROR';
            }
            return false;
        }
    }

    async placeSellOrder() {
        // Simplificado: vender todo el BTC disponible al precio de mercado actual.
        // En un bot real, querrías una venta limitada en `botState.pv` o `botState.pc`
        // y gestionar la cantidad de BTC a vender con más precisión.
        // Por simplicidad, aquí vende todo el activo.

        if (this.botState.ac <= 0) {
            console.warn(`[AUTOBOT-${this.userId}] No hay BTC para vender (${this.botState.ac}). Abortando venta.`);
            this.botState.state = 'BUYING'; // Si no hay activo, volver a comprar
            return false;
        }

        try {
            // Use bitmartService with instance-specific API credentials
            const order = await bitmartService.placeMarketOrder(
                TRADE_SYMBOL,
                'sell',
                this.botState.ac, // Amount of BTC to sell
                this.apiCredentials
            );

            console.log(`[AUTOBOT-${this.userId}] Orden de venta (market) colocada:`, order);

            // Calculate estimated profit for the cycle
            // (Order 'order' from bitmartService.placeMarketOrder might not contain final execution price)
            // For accurate profit, you'd need to fetch actual trade details from BitMart or listen to websocket trades.
            // Here, we'll estimate based on current price for display.
            const estimatedSoldUSDT = this.botState.ac * this.botState.currentPrice;
            const estimatedProfit = estimatedSoldUSDT - this.botState.cp; // cp is total USDT spent
            this.botState.profit += estimatedProfit; // Global profit
            this.botState.cycleProfit = estimatedProfit; // Profit for this cycle

            // Reset cycle variables and transition to BUYING
            this.botState.state = 'BUYING';
            this.botState.cycle++;
            this.resetCycleVariables(); // Prepare for next cycle

            // Emit to frontend
            this.ioInstance.to(this.userId).emit('autobotLog', `Orden de venta ejecutada. Ganancia estimada del ciclo: ${estimatedProfit.toFixed(2)} USDT.`);
            this.ioInstance.to(this.userId).emit('autobotTrade', {
                type: 'sell',
                price: this.botState.currentPrice, // The price at which it sold
                amountBTC: this.botState.ac,
                amountUSDT: estimatedSoldUSDT,
                profit: estimatedProfit,
                timestamp: Date.now()
            });

            // If stopOnCycleEnd is true, transition to STOPPED
            if (this.botState.stopOnCycleEnd) {
                console.log(`[AUTOBOT-${this.userId}] stopOnCycleEnd activado. Deteniendo bot después de la venta.`);
                await this.stopStrategy();
                this.ioInstance.to(this.userId).emit('autobotLog', 'Bot detenido por fin de ciclo.');
            }

            return true;

        } catch (error) {
            console.error(`[AUTOBOT-${this.userId}] Error al colocar orden de venta:`, error.message);
            this.ioInstance.to(this.userId).emit('autobotLog', `ERROR al colocar orden de venta: ${error.message}`);
            // Decide si un error de orden debe detener completamente el bot
            // this.botState.state = 'ERROR';
            return false;
        }
    }

    async cancelOpenOrders() {
        try {
            // Use bitmartService with instance-specific API credentials
            const result = await bitmartService.cancelAllOpenOrders(TRADE_SYMBOL, this.apiCredentials);
            console.log(`[AUTOBOT-${this.userId}] Órdenes abiertas canceladas:`, result);
            this.botState.openOrders = []; // Clear local tracking
            return true;
        } catch (error) {
            console.error(`[AUTOBOT-${this.userId}] Error al cancelar órdenes abiertas:`, error.message);
            this.ioInstance.to(this.userId).emit('autobotLog', `ERROR al cancelar órdenes: ${error.message}`);
            return false;
        }
    }

    async checkOrderCompletion(orderId, orderType) {
        try {
            // You would poll BitMart API to check if the order has been filled.
            // This is a simplified placeholder. In a real bot, you'd use websockets or frequent polling.
            const orderDetails = await bitmartService.getOrderDetail(orderId, this.apiCredentials);
            if (orderDetails && orderDetails.status === 'filled') { // Assuming 'filled' status
                console.log(`[AUTOBOT-${this.userId}] Orden ${orderId} completada.`);

                const filledAmount = parseFloat(orderDetails.executed_amount); // Amount of BTC bought/sold
                const filledPrice = parseFloat(orderDetails.price); // Price at which it was filled
                const filledQtyUSDT = parseFloat(orderDetails.executed_volume); // Total USDT volume

                // Update botState based on order type (buy or sell)
                if (orderType === 'buy') {
                    // Actualizar capital y activo promedio de compra
                    this.botState.cp += filledQtyUSDT; // Sumar USDT gastado
                    this.botState.ac += filledAmount; // Sumar BTC adquirido
                    this.botState.ppc = this.botState.cp / this.botState.ac; // Recalcular PPC

                    this.botState.orderCountInCycle++;
                    this.botState.lastOrderUSDTAmount = filledQtyUSDT;

                    // Remove from open orders
                    this.botState.openOrders = this.botState.openOrders.filter(o => o.orderId !== orderId);

                    console.log(`[AUTOBOT-${this.userId}] Compra completada: ${filledAmount.toFixed(8)} BTC @ ${filledPrice.toFixed(2)}.`);
                    console.log(`[AUTOBOT-${this.userId}] PPC: ${this.botState.ppc.toFixed(2)}, AC: ${this.botState.ac.toFixed(8)}, CP: ${this.botState.cp.toFixed(2)}`);

                    // Transición a SELLING después de la primera compra o una cobertura
                    this.botState.state = 'SELLING';
                    this.ioInstance.to(this.userId).emit('autobotTrade', {
                        type: 'buy',
                        price: filledPrice,
                        amountBTC: filledAmount,
                        amountUSDT: filledQtyUSDT,
                        timestamp: Date.now()
                    });

                } else if (orderType === 'sell') {
                    // Already handled in placeSellOrder, which calls resetCycleVariables
                    console.log(`[AUTOBOT-${this.userId}] Venta completada.`);
                    // Ensure state transition and reset are done
                    this.botState.state = 'BUYING'; // Should already be set
                    this.botState.openOrders = this.botState.openOrders.filter(o => o.orderId !== orderId);
                }
                return true;
            }
            return false; // Not filled yet
        } catch (error) {
            console.error(`[AUTOBOT-${this.userId}] Error al verificar orden ${orderId}:`, error.message);
            this.ioInstance.to(this.userId).emit('autobotLog', `ERROR al verificar orden ${orderId}: ${error.message}`);
            return false;
        }
    }

    async runBotLogic() {
        if (!this.botState) {
            console.error(`[AUTOBOT-${this.userId}] Estado del bot no cargado. Abortando runBotLogic.`);
            return;
        }
        if (this.botState.state === 'STOPPED' || this.botState.state === 'ERROR') {
            console.log(`[AUTOBOT-${this.userId}] Bot en estado ${this.botState.state}. No se ejecuta la lógica.`);
            return;
        }

        try {
            // Actualizar el precio actual del mercado
            const ticker = await bitmartService.getTicker(TRADE_SYMBOL);
            if (ticker && ticker.last_price) {
                this.botState.currentPrice = parseFloat(ticker.last_price);
            } else {
                console.warn(`[AUTOBOT-${this.userId}] No se pudo obtener el precio actual. Usando el último precio conocido.`);
                // Continuar con el último precio conocido o establecer un estado de error si es crítico
                // this.botState.state = 'ERROR'; return;
            }

            const availableUSDT = await this.getAccountBalance('USDT');
            const availableBTC = await this.getAccountBalance('BTC');

            // Actualizar el activo disponible del bot con el balance real
            this.botState.ac = availableBTC;

            // Emitir el estado actual al frontend en cada ciclo
            if (this.ioInstance) {
                this.ioInstance.to(this.userId).emit('botStateUpdate', { autobot: this.botState });
            }

            // Primero, verificar el estado de las órdenes abiertas pendientes (solo si hay alguna)
            if (this.botState.openOrders.length > 0) {
                console.log(`[AUTOBOT-${this.userId}] Verificando ${this.botState.openOrders.length} órdenes abiertas...`);
                for (let i = this.botState.openOrders.length - 1; i >= 0; i--) {
                    const order = this.botState.openOrders[i];
                    const isFilled = await this.checkOrderCompletion(order.orderId, order.side);
                    if (isFilled) {
                        // checkOrderCompletion ya actualiza el estado y emite eventos
                        // La orden ya fue eliminada de this.botState.openOrders dentro de checkOrderCompletion
                    }
                }
            }

            switch (this.botState.state) {
                case 'RUNNING': // Estado inicial para encontrar la primera señal de compra
                case 'BUYING':
                    console.log(`[AUTOBOT-${this.userId}] Estado: BUYING. Precio actual: ${this.botState.currentPrice.toFixed(2)}`);

                    // Obtener señal de compra del analizador de indicadores
                    const signal = await runAnalysis(); // This needs to be passed credentials too if getCandles calls bitmartService directly
                                                        // For now, it uses a global bitmartService, which is problematic for multi-user
                                                        // WE WILL FIX THIS IN BotManager.js or bitmartService.js
                    if (signal.action === 'COMPRA') {
                        // Lógica de compra inicial o de cobertura
                        let amountToBuyUSDT;
                        let targetPrice;

                        if (this.botState.orderCountInCycle === 0) {
                            // Primera compra del ciclo
                            amountToBuyUSDT = this.botState.purchaseAmount;
                            targetPrice = this.botState.currentPrice; // Compra a precio de mercado o el último precio
                            console.log(`[AUTOBOT-${this.userId}] Señal de compra inicial detectada. Cantidad: ${amountToBuyUSDT} USDT.`);
                        } else {
                            // Compra de cobertura (DCA)
                            // Calcula el precio objetivo para la cobertura
                            targetPrice = this.botState.ppc * (1 - this.botState.decrementPercentage / 100);
                            amountToBuyUSDT = this.botState.lastOrderUSDTAmount * (1 + this.botState.incrementPercentage / 100);
                            this.botState.nextCoverageUSDTAmount = amountToBuyUSDT;
                            this.botState.nextCoverageTargetPrice = targetPrice;

                            console.log(`[AUTOBOT-${this.userId}] Precio actual: ${this.botState.currentPrice.toFixed(2)}, Objetivo de cobertura: ${targetPrice.toFixed(2)}.`);

                            if (this.botState.currentPrice > targetPrice) {
                                console.log(`[AUTOBOT-${this.userId}] Esperando que el precio caiga a ${targetPrice.toFixed(2)} para la cobertura.`);
                                break; // Esperar a que el precio caiga al objetivo
                            }
                        }

                        // Asegurarse de que el monto de la orden sea mayor que el mínimo de BitMart
                        if (amountToBuyUSDT < MIN_USDT_VALUE_FOR_BITMART) {
                            console.warn(`[AUTOBOT-${this.userId}] Monto de compra (${amountToBuyUSDT.toFixed(2)} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART}). Ajustando.`);
                            amountToBuyUSDT = MIN_USDT_VALUE_FOR_BITMART;
                        }

                        // Verificar balance antes de intentar colocar la orden
                        if (availableUSDT >= amountToBuyUSDT) {
                            console.log(`[AUTOBOT-${this.userId}] Colocando orden de compra de ${amountToBuyUSDT.toFixed(2)} USDT @ ${targetPrice.toFixed(2)}.`);
                            await this.placeBuyOrder(amountToBuyUSDT, targetPrice);
                        } else {
                            console.warn(`[AUTOBOT-${this.userId}] Fondos insuficientes para la compra de ${amountToBuyUSDT.toFixed(2)} USDT. Balance USDT: ${availableUSDT.toFixed(2)}.`);
                            this.ioInstance.to(this.userId).emit('autobotLog', `ERROR: Fondos insuficientes para la compra. Requerido: ${amountToBuyUSDT.toFixed(2)} USDT.`);
                            this.botState.state = 'NO_COVERAGE'; // Transición al estado de "sin cobertura"
                        }
                    } else {
                        console.log(`[AUTOBOT-${this.userId}] Esperando señal de compra. Precio actual: ${this.botState.currentPrice.toFixed(2)}.`);
                    }
                    break;

                case 'SELLING':
                    console.log(`[AUTOBOT-${this.userId}] Estado: SELLING. Precio actual: ${this.botState.currentPrice.toFixed(2)}, PPC: ${this.botState.ppc.toFixed(2)}`);

                    if (this.botState.ac === 0) {
                        console.log(`[AUTOBOT-${this.userId}] No hay activos para vender. Volviendo a BUYING.`);
                        this.botState.state = 'BUYING';
                        this.resetCycleVariables();
                        break;
                    }

                    // Calcula PM (Peak Price) si el precio actual es mayor
                    if (this.botState.pm === 0 || this.botState.currentPrice > this.botState.pm) {
                        this.botState.pm = this.botState.currentPrice;
                        // Calcula el precio de venta (pv) como PM - triggerPercentage
                        this.botState.pv = this.botState.pm * (1 - this.botState.triggerPercentage / 100);
                        // Calcula el precio de caída (pc) como PM - (triggerPercentage + algún factor de seguridad si quieres)
                        // O, puedes ajustar pc para que sea el mismo pv si triggerPercentage es tu stop principal
                        this.botState.pc = this.botState.pm * (1 - this.botState.triggerPercentage / 100);

                        // Asegura que el precio de venta (pv) no sea menor al precio promedio de compra (ppc)
                        // para intentar siempre vender con ganancia mínima.
                        if (this.botState.pv < this.botState.ppc) {
                             // Ajusta PV para que sea PPC + un pequeño margen (ej. 0.3% de ganancia)
                            this.botState.pv = this.botState.ppc * 1.003;
                            // También ajusta PC para que no venda por debajo de este nuevo PV ajustado
                            this.botState.pc = this.botState.pv;
                            console.warn(`[AUTOBOT-${this.userId}] PV/PC calculado es menor al PPC. Ajustando PV/PC para asegurar ganancia mínima.`);
                        }
                    }

                    // Si el precio actual cae por debajo del precio de caída (pc)
                    // y el bot tiene activo (BTC) para vender, entonces procede a vender.
                    if (this.botState.currentPrice <= this.botState.pc && this.botState.ac > 0) {
                        console.log(`[AUTOBOT-${this.userId}] Condiciones de venta alcanzadas! Colocando orden de venta.`);
                        await this.placeSellOrder();
                    } else {
                        console.log(`[AUTOBOT-${this.userId}] Esperando condiciones para la venta. Precio actual: ${this.botState.currentPrice.toFixed(2)}, PM: ${this.botState.pm.toFixed(2)}, PV: ${this.botState.pv.toFixed(2)}, PC: ${this.botState.pc.toFixed(2)}`);
                    }
                    break;

                case 'NO_COVERAGE':
                    console.log(`[AUTOBOT-${this.userId}] Estado: NO_COVERAGE. Esperando fondos para la próxima orden de ${this.botState.nextCoverageUSDTAmount.toFixed(2)} USDT @ ${this.botState.nextCoverageTargetPrice.toFixed(2)}.`);
                    // Si el balance USDT disponible ahora es suficiente, intenta volver a BUYING
                    if (availableUSDT >= this.botState.nextCoverageUSDTAmount && this.botState.nextCoverageUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART) {
                        console.log(`[AUTOBOT-${this.userId}] Fondos disponibles. Volviendo a estado BUYING para intentar la orden de cobertura.`);
                        this.botState.state = 'BUYING';
                    }
                    break;

                case 'ERROR':
                    console.error(`[AUTOBOT-${this.userId}] Estado: ERROR. El bot ha encontrado un error crítico. Requiere intervención manual.`);
                    // Puedes añadir lógica para notificar, reintentar o apagar completamente.
                    break;

                default:
                    console.warn(`[AUTOBOT-${this.userId}] Estado desconocido del bot: ${this.botState.state}. Estableciendo a STOPPED.`);
                    this.botState.state = 'STOPPED';
                    break;
            }
        } catch (error) {
            console.error(`[AUTOBOT-${this.userId}] Excepción en runBotLogic:`, error);
            this.ioInstance.to(this.userId).emit('botError', { botType: 'autobot', message: `Excepción en la lógica del bot: ${error.message}` });
            this.botState.state = 'ERROR'; // Cambia a estado de error
        } finally {
            // Guarda el estado del bot después de cada ejecución de la lógica
            if (this.botState.state !== 'STOPPED') {
                await this.saveBotState();
            }
            // Emitir el estado actual del bot al frontend después de cada ciclo
            if (this.ioInstance) {
                this.ioInstance.to(this.userId).emit('botStateUpdate', { autobot: this.botState });
            }
        }
    }

    async startStrategy(params) {
        if (!this.botState) {
            await this.loadBotState(); // Ensure state is loaded before starting
            if (!this.botState) { // If loading failed, cannot start
                return { success: false, message: 'Failed to load Autobot state.', botState: null };
            }
        }

        if (this.botState.state !== 'STOPPED' && this.botState.state !== 'NO_COVERAGE' && this.botState.state !== 'ERROR') {
            console.warn(`[AUTOBOT-${this.userId}] Intento de iniciar Autobot ya en estado: ${this.botState.state}.`);
            this.ioInstance.to(this.userId).emit('botStateUpdate', { autobot: this.botState });
            return { success: false, message: `Autobot already ${this.botState.state}.`, botState: { ...this.botState._doc } };
        }

        console.log(`[AUTOBOT-${this.userId}] Iniciando estrategia del bot...`);
        // Update only the specific parameters relevant for starting
        if (params) {
            // Ensure only allowed parameters are updated for security and state consistency
            this.botState.purchaseAmount = params.purchaseAmount || this.botState.purchaseAmount;
            this.botState.incrementPercentage = params.incrementPercentage || this.botState.incrementPercentage;
            this.botState.decrementPercentage = params.decrementPercentage || this.botState.decrementPercentage;
            this.botState.triggerPercentage = params.triggerPercentage || this.botState.triggerPercentage;
            this.botState.stopOnCycleEnd = typeof params.stopOnCycleEnd === 'boolean' ? params.stopOnCycleEnd : this.botState.stopOnCycleEnd;
        }

        this.botState.state = 'RUNNING'; // Inicializa en RUNNING para buscar la primera señal
        this.botState.cycle = 0; // Reiniciar ciclos al iniciar
        this.botState.profit = 0; // Reiniciar ganancias al iniciar
        this.resetCycleVariables(); // Asegurar que las variables del ciclo estén limpias

        if (this.strategyIntervalId) {
            clearInterval(this.strategyIntervalId);
        }

        // Iniciar el loop principal de la lógica del bot cada 5 segundos (ajustable)
        this.strategyIntervalId = setInterval(this.runBotLogic, 5000);
        console.log(`[AUTOBOT-${this.userId}] Loop de estrategia iniciado.`);

        await this.saveBotState();
        this.ioInstance.to(this.userId).emit('botStateUpdate', { autobot: this.botState });
        return { success: true, message: 'Autobot strategy started.', botState: { ...this.botState._doc } };
    }

    async stopStrategy() {
        if (this.strategyIntervalId) {
            console.log(`[AUTOBOT-${this.userId}] Deteniendo la estrategia del bot.`);
            clearInterval(this.strategyIntervalId);
            this.strategyIntervalId = null;
        }
        this.botState.state = 'STOPPED';
        // Asegurarse de cancelar órdenes abiertas al detener el bot
        await this.cancelOpenOrders();
        await this.saveBotState();
        this.ioInstance.to(this.userId).emit('botStateUpdate', { autobot: this.botState });
        return { success: true, message: 'Autobot strategy stopped.', botState: { ...this.botState._doc } };
    }
}

module.exports = Autobot;