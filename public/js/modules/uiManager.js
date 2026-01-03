// public/js/modules/uiManager.js

/**
 * Variable global para comparar el precio anterior con el nuevo
 * y poder cambiar el color (verde si sube, rojo si baja).
 */
let lastPrice = 0;

/**
 * Mapeo de estados a clases CSS de Tailwind
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
 * Actualiza la UI de forma estable con los datos del Socket
 */
export function updateBotUI(state) {
    if (!state) return;

    // --- 1. ACTUALIZACIÓN DE PRECIO CON COLORES ---
    const priceElement = document.getElementById('auprice');
    if (priceElement && state.price !== undefined && state.price !== null) {
        const currentPrice = Number(state.price);
        
        // Solo actualizar si el precio ha cambiado
        if (currentPrice !== lastPrice) {
            priceElement.classList.remove('text-emerald-400', 'text-red-400', 'text-white');
            
            if (lastPrice !== 0) {
                if (currentPrice > lastPrice) {
                    priceElement.classList.add('text-emerald-400'); // Sube
                } else if (currentPrice < lastPrice) {
                    priceElement.classList.add('text-red-400');    // Baja
                } else {
                    priceElement.classList.add('text-white');      // Igual
                }
            } else {
                priceElement.classList.add('text-white');
            }

            priceElement.textContent = `$${currentPrice.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            })}`;
            
            lastPrice = currentPrice;
        }
    }

    // --- 2. ACTUALIZACIÓN DE ESTADOS LONG/SHORT ---
    updateStatusLabel('aubot-lstate', state.lstate);
    updateStatusLabel('aubot-sstate', state.sstate);

    // --- 3. ACTUALIZACIÓN DE VALORES NUMÉRICOS ---
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
        
        // Filtro de integridad: no borrar datos si el socket manda un nulo
        if (rawValue === undefined || rawValue === null) continue;

        const value = Number(rawValue);
        if (isNaN(value)) continue;

        if (dataKey.includes('profit')) {
            formatProfit(element, value);
        } else if (['lnorder', 'snorder', 'lcycle', 'scycle'].includes(dataKey)) {
            // Enteros
            if (element.textContent !== value.toString()) {
                element.textContent = value.toFixed(0);
            }
        } else {
            // Decimales (BTC 6, USDT 2)
            const isBtcField = elementId.includes('btc') || elementId === 'aubalance-btc';
            const decimals = isBtcField ? 6 : 2;
            const formatted = value.toLocaleString(undefined, { 
                minimumFractionDigits: decimals, 
                maximumFractionDigits: decimals 
            });

            if (element.textContent !== formatted) {
                element.textContent = formatted;
            }
        }
    }

    // --- 4. CONTROL DE BOTONES E INPUTS ---
    const isStopped = state.lstate === 'STOPPED' && state.sstate === 'STOPPED';
    updateControlsState(isStopped);
}

/**
 * Formatea el profit con signo y colores
 */
function formatProfit(element, value) {
    const sign = value >= 0 ? '+' : '-';
    const formatted = `${sign}$${Math.abs(value).toFixed(2)}`;
    
    if (element.textContent === formatted) return;

    element.textContent = formatted;
    element.classList.remove('text-emerald-400', 'text-red-400', 'text-gray-400');
    
    if (value > 0) element.classList.add('text-emerald-400');
    else if (value < 0) element.classList.add('text-red-400');
    else element.classList.add('text-gray-400');
}

/**
 * Bloquea los ajustes mientras el bot corre, pero permite darle a STOP
 */
function updateControlsState(isStopped) {
    const startStopButton = document.getElementById('austart-btn');
    const autobotSettings = document.getElementById('autobot-settings');
    
    if (startStopButton) {
        const newText = isStopped ? 'START BOT' : 'STOP BOT';
        if (startStopButton.textContent !== newText) {
            startStopButton.textContent = newText;
            startStopButton.className = isStopped 
                ? 'flex-1 bg-emerald-600 hover:bg-emerald-700 py-3 rounded-xl font-bold transition-all shadow-lg uppercase text-sm' 
                : 'flex-1 bg-red-600 hover:bg-red-700 py-3 rounded-xl font-bold transition-all shadow-lg uppercase text-sm';
        }
    }

    if (autobotSettings) {
        const inputs = autobotSettings.querySelectorAll('input, select');
        inputs.forEach(input => {
            if (input.id === 'au-stop-at-cycle-end') {
                input.disabled = false; // Siempre habilitado
                return;
            }
            input.disabled = !isStopped;
            input.style.opacity = isStopped ? '1' : '0.5';
            input.style.cursor = isStopped ? 'auto' : 'not-allowed';
        });
    }
}

function updateStatusLabel(id, status) {
    const el = document.getElementById(id);
    if (!el || !status || el.textContent === status) return;
    
    el.textContent = status;
    el.className = `font-bold ${STATUS_COLORS[status] || 'text-gray-500'}`;
}

/**
 * Toasts (Mensajes de éxito/error)
 */
export function displayMessage(message, type = 'info') {
    const container = document.getElementById('message-container');
    if (!container) return;

    container.textContent = message;
    container.classList.remove('bg-blue-500', 'bg-red-500', 'bg-emerald-500', 'hidden');
    
    const bgClass = type === 'error' ? 'bg-red-500' : (type === 'success' ? 'bg-emerald-500' : 'bg-blue-500');
    container.classList.add(bgClass, 'active');

    setTimeout(() => {
        container.classList.remove('active');
        container.classList.add('hidden');
    }, 4000);
}