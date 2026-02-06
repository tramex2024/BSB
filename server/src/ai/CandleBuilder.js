// server/src/ai/CandleBuilder.js

class CandleBuilder {
    constructor() {
        this.currentCandle = null;
    }

    /**
     * Procesa un nuevo precio. 
     * Retorna la vela cerrada si el minuto terminó, de lo contrario retorna null.
     */
    processTick(price) {
        const timestamp = new Date().setSeconds(0, 0); // Inicio del minuto actual
        let closedCandle = null;

        // Si cambió el minuto, cerramos la vela anterior
        if (this.currentCandle && this.currentCandle.timestamp !== timestamp) {
            closedCandle = { ...this.currentCandle };
            this.currentCandle = null;
        }

        // Si no hay vela iniciada para este minuto, la creamos
        if (!this.currentCandle) {
            this.currentCandle = {
                timestamp,
                open: price,
                high: price,
                low: price,
                close: price
            };
        } else {
            // Actualizamos la vela en formación
            this.currentCandle.high = Math.max(this.currentCandle.high, price);
            this.currentCandle.low = Math.min(this.currentCandle.low, price);
            this.currentCandle.close = price;
        }

        return closedCandle;
    }
}

module.exports = new CandleBuilder();