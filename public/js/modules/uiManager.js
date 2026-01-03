// public/js/modules/uiManager.js

/**
 * Mapeo de estados a clases CSS
 */
const STATUS_COLORS = {
    RUNNING: 'text-emerald-400',
    STOPPED: 'text-red-400',
    BUYING: 'text-blue-400',
    SELLING: 'text-yellow-400',
    NO_COVERAGE: 'text-purple-400',
    PAUSED: 'text-orange-400'
};

/**
 * Actualiza la UI de forma estable
 */
export function updateBotUI(state) {
    if (!state) return;

    // 1. Actualización de estados (solo si cambian)
    updateStatusLabel('aubot-lstate', state.lstate);
    updateStatusLabel('aubot-sstate', state.sstate);

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
        
        // --- CORRECCIÓN CRÍTICA: FILTRO DE INTEGRIDAD ---
        // Si el valor es undefined o null, NO actualizamos. 
        // Esto evita que el balance BTC o el Profit vuelvan a 0 si el socket manda un paquete parcial.
        if (rawValue === undefined || rawValue === null) continue;

        const value = Number(rawValue);
        if (isNaN(value)) continue;

        // 2. Lógica de renderizado según tipo de dato
        if (dataKey.includes('profit')) {
            formatProfit(element, value);
        } else if (['lnorder', 'snorder', 'lcycle', 'scycle'].includes(dataKey)) {
            // Números enteros
            if (element.textContent !== value.toString()) {
                element.textContent = value.toFixed(0);
            }
        } else {
            // Lógica de precisión para USDT vs BTC
            const isBtcField = elementId.includes('btc') || elementId === 'aubalance-btc';
            const decimals = isBtcField ? 6 : 2;
            const formatted = value.toLocaleString(undefined, { 
                minimumFractionDigits: decimals, 
                maximumFractionDigits: decimals 
            });

            // Solo actualizamos el DOM si el texto cambió (Evita parpadeos de renderizado)
            if (element.textContent !== formatted) {
                element.textContent = formatted;
            }
        }
    }

    // 3. Control de Botones e Inputs
    const isStopped = state.lstate === 'STOPPED' && state.sstate === 'STOPPED';
    updateControlsState(isStopped);
}

/**
 * Formatea el beneficio de forma que el ancho sea predecible
 */
function formatProfit(element, value) {
    const sign = value >= 0 ? '+' : '-';
    const formatted = `${sign}$${Math.abs(value).toFixed(2)}`;
    
    // Solo actualizar si el valor cambió
    if (element.textContent === formatted) return;

    element.textContent = formatted;

    // Gestión de colores Emerald/Red
    element.classList.remove('text-emerald-400', 'text-red-400', 'text-gray-400');
    if (value > 0) element.classList.add('text-emerald-400');
    else if (value < 0) element.classList.add('text-red-400');
    else element.classList.add('text-gray-400');
}

/**
 * Bloquea/Desbloquea ajustes sin causar saltos visuales
 */
function updateControlsState(isStopped) {
    const startStopButton = document.getElementById('austart-btn');
    const autobotSettings = document.getElementById('autobot-settings');

    if (startStopButton) {
        const newText = isStopped ? 'START BOT' : 'STOP BOT';
        if (startStopButton.textContent !== newText) {
            startStopButton.textContent = newText;
            startStopButton.className = isStopped 
                ? 'flex-1 bg-emerald-600 hover:bg-emerald-700 py-3 rounded-xl font-bold transition-all' 
                : 'flex-1 bg-orange-600 hover:bg-orange-700 py-3 rounded-xl font-bold transition-all';
        }
    }

    if (autobotSettings) {
        // En lugar de iterar cada vez, aplicamos una clase al contenedor
        autobotSettings.style.pointerEvents = isStopped ? 'auto' : 'none';
        autobotSettings.style.opacity = isStopped ? '1' : '0.6';
    }
}

function updateStatusLabel(id, status) {
    const el = document.getElementById(id);
    if (!el || !status || el.textContent === status) return;
    
    el.textContent = status;
    el.className = `font-bold ${STATUS_COLORS[status] || 'text-gray-500'}`;
}

/**
 * Muestra notificaciones temporales en pantalla (Toasts)
 */
export function displayMessage(message, type = 'info') {
    const container = document.getElementById('message-container');
    if (!container) {
        console.warn("No se encontró el contenedor 'message-container' para mostrar el mensaje:", message);
        return;
    }

    // Actualizar contenido y clases
    container.textContent = message;
    
    // Limpiar clases previas de tipo
    container.classList.remove('bg-blue-500', 'bg-red-500', 'bg-emerald-500', 'hidden');
    
    // Asignar color según tipo (Ejemplo con Tailwind)
    const bgClass = type === 'error' ? 'bg-red-500' : (type === 'success' ? 'bg-emerald-500' : 'bg-blue-500');
    container.classList.add(bgClass, 'active');

    // Auto-ocultar después de 4 segundos
    setTimeout(() => {
        container.classList.remove('active');
        container.classList.add('hidden');
    }, 4000);
}