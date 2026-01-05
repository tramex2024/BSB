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
 * Actualiza la UI de forma estable con los datos del Socket usando PUNTO DECIMAL
 */
export function updateBotUI(state) {
    if (!state) return;

    // --- 1. ACTUALIZACIÓN DE PRECIO CON COLORES ---
    const priceElement = document.getElementById('auprice');
    if (priceElement && state.price !== undefined && state.price !== null) {
        const currentPrice = Number(state.price);
        
        if (currentPrice !== lastPrice) {
            priceElement.classList.remove('text-emerald-400', 'text-red-400', 'text-white');
            
            if (lastPrice !== 0) {
                if (currentPrice > lastPrice) priceElement.classList.add('text-emerald-400');
                else if (currentPrice < lastPrice) priceElement.classList.add('text-red-400');
                else priceElement.classList.add('text-white');
            } else {
                priceElement.classList.add('text-white');
            }

            // 🟢 CORRECCIÓN: Forzado a en-US para PUNTO DECIMAL (.)
            priceElement.textContent = `$${currentPrice.toLocaleString('en-US', { 
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
        if (rawValue === undefined || rawValue === null) continue;

        const value = Number(rawValue);
        if (isNaN(value)) continue;

        if (dataKey.includes('profit')) {
            formatProfit(element, value);
        } else if (['lnorder', 'snorder', 'lcycle', 'scycle'].includes(dataKey)) {
            if (element.textContent !== value.toString()) {
                element.textContent = value.toFixed(0);
            }
        } else {
            const isBtcField = elementId.includes('btc') || elementId === 'aubalance-btc';
            const decimals = isBtcField ? 6 : 2;

            // 🟢 CORRECCIÓN: Forzado a en-US en todos los labels numéricos
            const formatted = value.toLocaleString('en-US', { 
                minimumFractionDigits: decimals, 
                maximumFractionDigits: decimals 
            });

            if (element.textContent !== formatted) {
                element.textContent = formatted;
            }
        }
    }

    // --- 4. CONTROL DE BOTONES E INPUTS (Lógica de Bloqueo) ---
    const isGlobalStopped = state.lstate === 'STOPPED' && state.sstate === 'STOPPED';
    updateControlsState(isGlobalStopped);
}

/**
 * Formatea el profit con signo, colores y PUNTO DECIMAL
 */
function formatProfit(element, value) {
    const sign = value >= 0 ? '+' : '-';
    // 🟢 CORRECCIÓN: toFixed siempre usa punto decimal por estándar JS
    const formatted = `${sign}$${Math.abs(value).toFixed(2)}`;
    
    if (element.textContent === formatted) return;

    element.textContent = formatted;
    element.classList.remove('text-emerald-400', 'text-red-400', 'text-gray-400');
    
    if (value > 0) element.classList.add('text-emerald-400');
    else if (value < 0) element.classList.add('text-red-400');
    else element.classList.add('text-gray-400');
}

/**
 * Gestiona el estado de los inputs y el botón principal.
 */
function updateControlsState(isStopped) {
    const startStopButton = document.getElementById('austart-btn');
    const autobotSettings = document.getElementById('autobot-settings');
    
    if (startStopButton) {
        const newText = isStopped ? 'START AUTOBOT' : 'STOP AUTOBOT';
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
            const isIndependentStop = ['au-stop-long-at-cycle', 'au-stop-short-at-cycle', 'au-stop-at-cycle-end'].includes(input.id);
            
            if (isIndependentStop) {
                input.disabled = false;
                input.style.opacity = '1';
                input.style.cursor = 'pointer';
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
    el.className = `text-[10px] font-bold ${STATUS_COLORS[status] || 'text-gray-500'}`;
}

/**
 * Toasts (Mensajes de éxito/error)
 */
export function displayMessage(message, type = 'info') {
    const container = document.getElementById('message-container');
    if (!container) return;

    container.textContent = message;
    container.className = 'fixed bottom-5 right-5 px-6 py-3 rounded-xl text-white font-bold shadow-2xl z-50 transition-all transform animate-slideUp';
    
    const bgClass = type === 'error' ? 'bg-red-500' : (type === 'success' ? 'bg-emerald-500' : 'bg-blue-500');
    container.classList.add(bgClass);

    setTimeout(() => {
        container.classList.add('opacity-0', 'translate-y-10');
        setTimeout(() => container.classList.add('hidden'), 500);
    }, 4000);
}