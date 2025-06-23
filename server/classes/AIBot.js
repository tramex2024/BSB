// server/classes/AIBot.js

const { MIN_USDT_VALUE_FOR_BITMART } = require('../config');
const bitmartService = require('../services/bitmartService');
const BotStateModel = require('../models/BotState');
const { RSI } = require('technicalindicators');

const TRADE_SYMBOL = 'BTC_USDT';
const LICENSE_COST_PER_DAY = 0.30; // Costo de la licencia por día en USDT

// --- Direcciones de billetera para depósitos (¡REEMPLAZA CON TUS DIRECCIONES REALES!) ---
const MY_BTC_DEPOSIT_ADDRESS = 'bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // Tu dirección BTC para recibir pagos
const MY_USDT_TRC20_DEPOSIT_ADDRESS = 'TRC20_WALLET_ADDRESS_EXAMPLE_TXXXXXXXXXXXXXXXXXXXXXX'; // Tu dirección USDT (TRC20) para recibir pagos

class AIBot {
    // ... (constructor, loadBotState, saveBotState, resetCycleVariables, getAccountBalance,
    //      placeBuyOrder, placeSellOrder, cancelOpenOrders, checkOrderCompletion,
    //      getCandlesForAnalysis, calculateAdvancedIndicators, determineAIBotAction,
    //      calculateDynamicBuyAmount, runBotLogic, startStrategy, stopStrategy - all mostly unchanged)

    async extendLicense(amountUSDT, transactionId, sourceWalletAddress, currency, network) {
        // En una aplicación real, no confiarías ciegamente en transactionId y sourceWalletAddress.
        // Los usarías para filtrar y verificar el historial de depósitos.

        console.log(`[AIBOT-${this.userId}] Intentando extender licencia. Monto: ${amountUSDT} ${currency}, TxID: ${transactionId}, Origen: ${sourceWalletAddress}, Red: ${network}`);

        // 1. Obtener mi dirección de depósito (según la moneda y red elegida por el usuario)
        let myDepositAddress;
        if (currency === 'BTC') {
            myDepositAddress = MY_BTC_DEPOSIT_ADDRESS;
        } else if (currency === 'USDT' && network === 'TRC20') {
            myDepositAddress = MY_USDT_TRC20_DEPOSIT_ADDRESS;
        } else {
            const errorMessage = `Moneda o red no soportada para pagos de licencia: ${currency} (${network})`;
            console.error(`[AIBOT-${this.userId}] ${errorMessage}`);
            return { success: false, message: errorMessage };
        }

        // 2. Consultar el historial de depósitos de BitMart
        let depositRecords;
        try {
            depositRecords = await bitmartService.getDepositHistory(this.apiCredentials, currency);
            if (!depositRecords || depositRecords.length === 0) {
                const message = 'No se encontraron depósitos recientes para esta moneda.';
                console.warn(`[AIBOT-${this.userId}] ${message}`);
                return { success: false, message: message };
            }
        } catch (error) {
            console.error(`[AIBOT-${this.userId}] Error al obtener historial de depósitos:`, error.message);
            return { success: false, message: `Error al verificar depósitos: ${error.message}` };
        }

        // 3. Verificar si hay un depósito coincidente
        const matchedDeposit = depositRecords.find(deposit =>
            parseFloat(deposit.amount) >= amountUSDT && // Asegurar que el monto sea igual o mayor
            deposit.currency === currency &&
            deposit.state === 'success' && // El depósito debe estar completado
            deposit.tx_id === transactionId // Verificar la ID de transacción
            // OJO: BitMart API no siempre provee la "source wallet address" directamente en el historial de depósitos
            // Podrías necesitar un paso adicional para verificar esto si es crítico,
            // o confiar en la combinación de monto, moneda y tx_id.
            // Para fines de esta demo, nos enfocaremos en monto, moneda y tx_id.
        );

        if (!matchedDeposit) {
            const message = 'No se encontró un depósito coincidente con la transacción o monto proporcionado.';
            console.warn(`[AIBOT-${this.userId}] ${message}`);
            return { success: false, message: message };
        }

        // 4. Si se encuentra un depósito coincidente y no se ha usado para una licencia antes:
        // Aquí necesitarías una forma de evitar que la misma transacción se use varias veces.
        // Podrías guardar las 'tx_id' usadas en tu modelo BotState o en otra colección.
        // Por simplicidad en esta demo, no implementaremos un check de 'transacción ya usada'.
        // console.log(`[AIBOT-${this.userId}] Depósito coincidente encontrado:`, matchedDeposit);

        const daysToAdd = Math.floor(amountUSDT / LICENSE_COST_PER_DAY);
        if (daysToAdd <= 0) {
            const errorMessage = `Monto de ${amountUSDT} ${currency} es insuficiente para extender la licencia (requiere al menos ${LICENSE_COST_PER_DAY} USDT).`;
            console.warn(`[AIBOT-${this.userId}] ${errorMessage}`);
            return { success: false, message: errorMessage };
        }

        let currentEndDate = new Date(this.botState.licenseEndDate);
        if (isNaN(currentEndDate.getTime()) || currentEndDate < new Date()) {
            currentEndDate = new Date(); // Si está expirada o no es válida, empieza desde ahora
        }

        currentEndDate.setDate(currentEndDate.getDate() + daysToAdd);
        this.botState.licenseEndDate = currentEndDate;

        console.log(`[AIBOT-${this.userId}] Licencia extendida en ${daysToAdd} días. Nueva fecha de fin: ${this.botState.licenseEndDate.toISOString()}.`);
        this.ioInstance.to(this.userId).emit('aibotLog', `Licencia extendida en ${daysToAdd} días. Nueva fecha de fin: ${this.botState.licenseEndDate.toLocaleDateString()}.`);

        // Si estaba en LICENSE_EXPIRED, cámbialo a STOPPED para que pueda ser iniciado
        if (this.botState.state === 'LICENSE_EXPIRED') {
            this.botState.state = 'STOPPED';
        }

        await this.saveBotState();
        const daysRemaining = Math.ceil((new Date(this.botState.licenseEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        this.ioInstance.to(this.userId).emit('botStateUpdate', { aibot: { ...this.botState._doc, daysRemaining } });
        return { success: true, message: `Licencia extendida por ${daysToAdd} días.`, daysRemaining: daysRemaining };
    }

    // --- TEMPORAL: Función para establecer una licencia de prueba (¡ELIMINAR EN PRODUCCIÓN!) ---
    async setTestLicense() {
        console.warn(`[AIBOT-${this.userId}] ¡ADVERTENCIA! Estableciendo una licencia de prueba por 100 días.`);
        let testEndDate = new Date();
        testEndDate.setDate(testEndDate.getDate() + 100); // 100 días desde ahora
        this.botState.licenseEndDate = testEndDate;
        if (this.botState.state === 'LICENSE_EXPIRED') {
            this.botState.state = 'STOPPED';
        }
        await this.saveBotState();
        const daysRemaining = Math.ceil((new Date(this.botState.licenseEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        this.ioInstance.to(this.userId).emit('aibotLog', `Licencia de prueba activada por 100 días. Días restantes: ${daysRemaining}.`);
        this.ioInstance.to(this.userId).emit('botStateUpdate', { aibot: { ...this.botState._doc, daysRemaining } });
    }
}

module.exports = AIBot;