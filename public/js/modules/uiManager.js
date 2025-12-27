// public/js/modules/uiManager.js

/**
 * Mapeo de estados a clases CSS de Tailwind para indicadores de estado
 */
const STATUS_COLORS = {
    RUNNING: 'text-green-400',
    STOPPED: 'text-red-400',
    BUYING: 'text-blue-400',
    SELLING: 'text-yellow-400',
    NO_COVERAGE: 'text-purple-400',
    PAUSED: 'text-orange-400'
};

/**
 * Actualiza todos los indicadores numéricos y estados del bot en la interfaz
 */
export function updateBotUI(state) {
    if (!state) return;

    // 1. Actualización de Estados (Largo y Corto)
    updateStatusLabel('aubot-lstate', state.lstate);
    updateStatusLabel('aubot-sstate', state.sstate);

    // 2. Mapeo de Elementos Numéricos
    const elementsToUpdate = {
        auprofit: 'total_profit',
        aulbalance: 'lbalance',
        ausbalance: 'sbalance',
        aultprice: 'ltprice',
        austprice: 'stprice',
        aulcycle: 'lcycle',
        auscycle: 'scycle',
        aulcoverage: 'lcoverage',
        auscoverage: 'scoverage',
        aulnorder: 'lnorder',
        ausnorder: 'snorder',
        aulsprice: 'lsprice',
        ausbprice: 'sbprice',
        aulprofit: 'lprofit',
        ausprofit: 'sprofit'
    };

    for (const [elementId, dataKey] of Object.entries(elementsToUpdate)) {
        const element = document.getElementById(elementId);
        if (!element) continue;

        const rawValue = state[dataKey];
        const value = (rawValue !== undefined && rawValue !== null) ? Number(rawValue) : NaN;

        // Limpiar colores previos de profit
        element.classList.remove('text-green-500', 'text-red-500', 'text-gray-400');

        // Lógica de formateo según el tipo de dato
        if (dataKey.includes('profit')) {
            formatProfit(element, value);
        } else if (['lnorder', 'snorder', 'lcycle', 'scycle'].includes(dataKey)) {
            element.textContent = isNaN(value) ? '0' : value.toFixed(0);
        } else {
            // Precios y Balances: 2 decimales para USDT, 6 para BTC si fuera necesario
            element.textContent = isNaN(value) ? '0.00' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    }

    // 3. Control de Botón e Inputs (Bloqueo de seguridad)
    const isStopped = state.lstate === 'STOPPED' && state.sstate === 'STOPPED';
    updateControlsState(isStopped);
}

/**
 * Actualiza las etiquetas de estado con el color correspondiente
 */
function updateStatusLabel(id, status) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = status || 'OFFLINE';
    el.className = `font-bold ${STATUS_COLORS[status] || 'text-gray-500'}`;
}

/**
 * Aplica formato de color y símbolo de moneda a los campos de beneficio
 */
function formatProfit(element, value) {
    if (isNaN(value)) {
        element.textContent = '$0.00';
        element.classList.add('text-gray-400');
        return;
    }
    
    // Colores: usamos las mismas clases que en el resto de la app
    if (value > 0) element.classList.add('text-green-500');
    else if (value < 0) element.classList.add('text-red-500');
    else element.classList.add('text-gray-400');
    
    // FORMATO UNIFICADO: Signo ($) Valor Absoluto
    // Esto evita que aparezca "$-5.00" y lo convierte en "-$5.00"
    const sign = value >= 0 ? '+' : '-';
    element.textContent = `${sign}$${Math.abs(value).toFixed(2)}`;
}

/**
 * Bloquea o desbloquea los ajustes según si el bot está corriendo
 */
function updateControlsState(isStopped) {
    const startStopButton = document.getElementById('austart-btn');
    const autobotSettings = document.getElementById('autobot-settings');

    if (startStopButton) {
        startStopButton.textContent = isStopped ? 'START BOT' : 'STOP BOT';
        startStopButton.className = isStopped ? 'start-btn w-full py-3 rounded-lg font-bold' : 'stop-btn w-full py-3 rounded-lg font-bold';
    }

    if (autobotSettings) {
        const inputs = autobotSettings.querySelectorAll('input, select');
        inputs.forEach(input => {
            // Permitimos cambiar solo ciertos parámetros en caliente si fuera necesario, 
            // pero por defecto bloqueamos todo por seguridad.
            input.disabled = !isStopped;
            input.parentElement.style.opacity = isStopped ? '1' : '0.6';
        });
    }
}

/**
 * Muestra notificaciones temporales en pantalla
 */
export function displayMessage(message, type = 'info') {
    const container = document.getElementById('message-container');
    if (!container) return;

    // Crear elemento de notificación si no existe un sistema de toast
    container.textContent = message;
    container.className = `message-toast ${type} active`; // Asegúrate de tener estas clases en CSS

    setTimeout(() => {
        container.classList.remove('active');
    }, 4000);
}