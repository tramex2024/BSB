class CandleBuilder {
    constructor() {
        this.currentCandle = null;
    }

    /**
     * Procesa un nuevo precio y opcionalmente el volumen. 
     * Retorna la vela cerrada si el minuto terminó.
     */
    processTick(price, volume = 0) {
        // Normalizamos al inicio del minuto exacto
        const now = new Date();
        const timestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()).getTime();
        
        let closedCandle = null;

        // 1. DETECCIÓN DE CIERRE DE VELA
        if (this.currentCandle && this.currentCandle.timestamp !== timestamp) {
            // La vela del minuto anterior ha terminado
            closedCandle = { ...this.currentCandle };
            this.currentCandle = null;
        }

        // 2. CREACIÓN O ACTUALIZACIÓN
        if (!this.currentCandle) {
            // Iniciamos vela de nuevo minuto
            this.currentCandle = {
                timestamp,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: parseFloat(volume) || 0 // Inicializamos volumen
            };
        } else {
            // Actualizamos vela existente (OHLCV)
            this.currentCandle.high = Math.max(this.currentCandle.high, price);
            this.currentCandle.low = Math.min(this.currentCandle.low, price);
            this.currentCandle.close = price;
            this.currentCandle.volume += parseFloat(volume) || 0; // Acumulamos volumen del tick
        }

        return closedCandle;
    }
}

module.exports = new CandleBuilder();