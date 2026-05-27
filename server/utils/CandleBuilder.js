//BSB/server/src/ai/CandleBuilder.js

/**
 * CANDLE BUILDER - GENERADOR DE VELAS OHLCV
 * Este módulo es global y no requiere userId. 
 * Transforma el flujo de Ticks (precios en tiempo real) en velas de 1 minuto.
 */

class CandleBuilder {
    constructor() {
        this.currentCandle = null;
    }

    /**
     * Procesa un nuevo tick de precio y volumen.
     * @param {number} price Precio actual del mercado.
     * @param {number} volume Volumen del tick actual.
     * @returns {Object|null} Retorna la vela cerrada (OHLCV) o null si el minuto sigue activo.
     */
    processTick(price, volume = 0) {
        // Normalizamos al inicio del minuto exacto (segundos y ms a cero)
        const now = new Date();
        const timestamp = new Date(
            now.getFullYear(), 
            now.getMonth(), 
            now.getDate(), 
            now.getHours(), 
            now.getMinutes()
        ).getTime();
        
        let closedCandle = null;

        // 1. DETECCIÓN DE CIERRE DE VELA
        // Si el timestamp del sistema cambió respecto al de la vela actual, el minuto terminó.
        if (this.currentCandle && this.currentCandle.timestamp !== timestamp) {
            closedCandle = { ...this.currentCandle };
            this.currentCandle = null;
        }

        // 2. CREACIÓN O ACTUALIZACIÓN
        const tickPrice = parseFloat(price);
        const tickVolume = parseFloat(volume) || 0;

        if (!this.currentCandle) {
            // Iniciamos vela de un nuevo minuto
            this.currentCandle = {
                timestamp,
                open: tickPrice,
                high: tickPrice,
                low: tickPrice,
                close: tickPrice,
                volume: tickVolume
            };
        } else {
            // Actualizamos vela existente (Estructura OHLCV)
            this.currentCandle.high = Math.max(this.currentCandle.high, tickPrice);
            this.currentCandle.low = Math.min(this.currentCandle.low, tickPrice);
            this.currentCandle.close = tickPrice;
            this.currentCandle.volume += tickVolume; 
        }

        return closedCandle;
    }
}

// Exportamos una única instancia (Singleton)
module.exports = new CandleBuilder();