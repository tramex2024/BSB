// BSB/server/autobotCalculations.js

/**
 * Calcula el estado inicial de los parámetros del bot.
 * @param {object} config - El objeto de configuración del frontend.
 * @returns {object} Un objeto con los parámetros calculados.
 */
function calculateInitialState(config) {
    const { long, short } = config;

    // Los valores de 'lbalance' y 'sbalance' son directamente los valores de los inputs.
    // En el futuro, la lógica de los demás parámetros se agregará aquí.
    const lbalance = parseFloat(long.purchaseUsdt) || 0;
    const sbalance = parseFloat(short.sellBtc) || 0;

    return {
        lstate: 'STOPPED',
        sstate: 'STOPPED',
        profit: 0,
        lbalance: lbalance,
        sbalance: sbalance,
        ltprice: 0,
        stprice: 0,
        lcycle: 0,
        scycle: 0,
        lcoverage: 0,
        scoverage: 0,
        lnorder: 0,
        snorder: 0
    };
}

module.exports = {
    calculateInitialState
};