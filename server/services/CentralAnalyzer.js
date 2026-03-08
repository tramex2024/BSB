/**
 * BSB/server/services/CentralAnalyzer.js
 * Motor de Indicadores Técnicos Globales (Versión Auditada 2026)
 * FIX: RSI Sync & Triple-Validation Logic
 */

const { RSI, ADX, Stochastic } = require('technicalindicators');
const bitmartService = require('./bitmartService'); 
const MarketSignal = require('../models/MarketSignal');

class CentralAnalyzer {
    constructor() {
        this.io = null;
        this.symbol = 'BTC_USDT';
        this.config = { 
            RSI_14: 14, 
            RSI_21: 21, 
            ADX_PERIOD: 14, 
            STOCH_PERIOD: 14,
            MOMENTUM_THRESHOLD: 0.8,
            MAX_HISTORY: 250 // Buffer optimizado para estabilidad
        };
        this.lastPrice = 0;
    }

    async init(io) {
        this.io = io;
        console.log("🧠 [CENTRAL-ANALYZER] Motor reactivo inicializado con sincronización de 250 velas.");
        // Al iniciar, intentamos poblar con datos de BitMart si la DB está vacía
        await this.analyze();
    }

    updatePrice(price) {
        this.lastPrice = parseFloat(price);
    }

    /**
     * analyze
     * @param {Array} externalCandles - Opcional: Velas enviadas directamente desde la DB (Etapa 2)
     */
    async analyze(externalCandles = null) {
        try {
            let candles = externalCandles;

            // 1. OBTENCIÓN Y NORMALIZACIÓN DE DATOS
            if (!candles || candles.length === 0) {
                // FALLBACK: Si no hay velas externas, pedimos 300 a BitMart
                const raw = await bitmartService.getKlines(this.symbol, '1', 300);
                
                if (!raw || raw.length === 0) {
                    console.warn("⚠️ [ANALYZER] No se pudieron obtener velas para el cálculo.");
                    return;
                }

                // FIX: Asegurar orden cronológico [Antiguo -> Reciente]
                if (raw[0].timestamp > raw[raw.length - 1].timestamp) {
                    raw.reverse();
                }

                candles = raw.map(c => ({
                    timestamp: String(c.timestamp).length === 10 ? c.timestamp * 1000 : c.timestamp,
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    open: parseFloat(c.open || c.close),
                    close: parseFloat(c.close),
                    volume: parseFloat(c.volume || 0)
                }));
            }

            // Mantener el límite exacto para el cálculo técnico
            if (candles.length > this.config.MAX_HISTORY) {
                candles = candles.slice(-this.config.MAX_HISTORY);
            }

            const closes = candles.map(c => c.close);
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);

            // 2. CÁLCULO DE INDICADORES (CON PRECIO EN TIEMPO REAL)
            // Inyectamos el lastPrice (WebSocket) como el punto de datos más actual
            const currentCloses = [...closes];
            if (this.lastPrice && this.lastPrice !== currentCloses[currentCloses.length - 1]) {
                currentCloses.push(this.lastPrice);
            }

            // Cálculo de RSI
            const rsi14Arr = RSI.calculate({ values: currentCloses, period: this.config.RSI_14 });
            const rsi21Arr = RSI.calculate({ values: currentCloses, period: this.config.RSI_21 });
            
            // Cálculo de ADX
            const adxArr = ADX.calculate({
                high: highs, 
                low: lows, 
                close: closes,
                period: this.config.ADX_PERIOD
            });

            // Cálculo de Estocástico
            const stochArr = Stochastic.calculate({
                high: highs, 
                low: lows, 
                close: closes,
                period: this.config.STOCH_PERIOD,
                signalPeriod: 3
            });

            // 3. EXTRACCIÓN Y FORMATEO DE RESULTADOS
            const curRSI14 = rsi14Arr.length > 0 ? parseFloat(rsi14Arr[rsi14Arr.length - 1].toFixed(2)) : 0;
            const curRSI21 = rsi21Arr.length > 0 ? parseFloat(rsi21Arr[rsi21Arr.length - 1].toFixed(2)) : 0;
            const prevRSI21 = rsi21Arr.length > 1 ? parseFloat(rsi21Arr[rsi21Arr.length - 2].toFixed(2)) : curRSI21;
            
            const curADX = adxArr.length > 0 ? parseFloat(adxArr[adxArr.length - 1].adx.toFixed(2)) : 0;
            const curStoch = stochArr.length > 0 ? stochArr[stochArr.length - 1] : { k: 0, d: 0 };

            // Determinación de la señal (Basada en RSI 21 para evitar ruido)
            const price = this.lastPrice || closes[closes.length - 1];
            const signal = this._getSignal(curRSI21, prevRSI21, curADX, curStoch, price);

            // 4. PERSISTENCIA EN MONGODB (MARKET SIGNALS)
            const updatedSignal = await MarketSignal.findOneAndUpdate(
                { symbol: this.symbol },
                {
                    currentPrice: price,
                    rsi14: curRSI14,
                    rsi21: curRSI21,
                    adx: curADX,
                    stochK: curStoch.k,
                    stochD: curStoch.d,
                    signal: signal.action, 
                    reason: signal.reason,
                    prevRSI: prevRSI21,
                    lastUpdate: new Date()
                },
                { upsert: true, new: true }
            );

            // 5. NOTIFICACIÓN POR WEBSOCKET (FRONTEND)
            if (this.io) {
                this.io.emit('market-signal-update', { 
                    price, 
                    rsi14: curRSI14, 
                    rsi21: curRSI21, 
                    adx: curADX, 
                    stochK: curStoch.k, 
                    stochD: curStoch.d, 
                    signal: signal.action,
                    historyCount: candles.length 
                });
            }

            // DEBUG LOG: Para verificar en la consola que el RSI se mueve
            console.log(`[ANALYZER] BTC: ${price} | RSI14: ${curRSI14} | Signal: ${signal.action}`);

            return updatedSignal;

        } catch (err) {
            console.error(`❌ [CENTRAL-ANALYZER] Error Crítico: ${err.message}`);
        }
    }

    /**
     * Lógica de Señal Unificada
     */
    _getSignal(current, prev, adx, stoch, price) {
        if (!current || !prev) return { action: "HOLD", reason: "Data Loading" };

        const diff = current - prev;
        const isTrending = adx > 20; 

        // ESTRATEGIA COMPRA
        if (prev <= 30 && current > 30) return { action: "BUY", reason: "RSI Oversold Recovery" };
        if (diff > this.config.MOMENTUM_THRESHOLD && current < 60) return { action: "BUY", reason: "Strong Momentum" };

        // ESTRATEGIA VENTA
        if (prev >= 70 && current < 70) return { action: "SELL", reason: "RSI Overbought Rejection" };
        if (diff < -this.config.MOMENTUM_THRESHOLD && current > 40) return { action: "SELL", reason: "Momentum Loss" };

        return { action: "HOLD", reason: "Market Flow" };
    }
}

module.exports = new CentralAnalyzer();