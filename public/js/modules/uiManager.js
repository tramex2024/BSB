// public/js/modules/uiManager.js

/**
 * Estado local para evitar renders innecesarios
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
 * Actualiza la interfaz global con los datos recibidos del Socket
 */
export function updateBotUI(state) {
    if (!state) return;

    // --- 1. ACTUALIZACIÓN DE PRECIO ---
const priceElement = document.getElementById('auprice');
if (priceElement && state.price !== undefined && state.price !== null) {
    const currentPrice = Number(state.price);
    
    // Detectamos si el elemento está recién creado (vacío o con el default del HTML)
    const isUIEmpty = priceElement.textContent === '$0.00' || priceElement.textContent === '';

    // Si el precio cambió O si la interfaz está vacía (por cambio de pestaña)
    if (currentPrice !== lastPrice || isUIEmpty) {
        
        // Lógica de colores
        if (isUIEmpty || lastPrice === 0) {
            priceElement.className = 'text-white'; // Color neutral al aparecer
        } else if (currentPrice > lastPrice) {
            priceElement.className = 'text-emerald-400';
        } else if (currentPrice < lastPrice) {
            priceElement.className = 'text-red-400';
        }

        priceElement.textContent = `$${currentPrice.toLocaleString('en-US', { 
            minimumFractionDigits: 2, maximumFractionDigits: 2 
        })}`;
        
        lastPrice = currentPrice;
    }
}

    // --- 2. ESTADOS DE LAS ESTRATEGIAS ---
    updateStatusLabel('aubot-lstate', state.lstate);
    updateStatusLabel('aubot-sstate', state.sstate);

    // --- 3. VALORES NUMÉRICOS (Lógica de Precisión) ---
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
        aulsprice: 'lsprice',
        ausbprice: 'sbprice',
        'aulprofit-val': 'lprofit',
        'ausprofit-val': 'sprofit',
        aulnorder: 'lnorder',   
        ausnorder: 'snorder',   
        'aubalance-usdt': 'lastAvailableUSDT',
        'aubalance-btc': 'lastAvailableBTC'
    };

    for (const [elementId, dataKey] of Object.entries(elementsToUpdate)) {
        const element = document.getElementById(elementId);
        if (!element) continue;

        const rawValue = state[dataKey];
        if (rawValue === undefined || rawValue === null) continue;

        const value = Number(rawValue);
        if (isNaN(value)) continue;

        if (elementId.includes('profit')) {
            formatProfit(element, value);
        } else {
            // Configuración de decimales según el tipo de dato
            const isBtc = elementId.includes('btc');
            const isInteger = elementId.includes('norder') || elementId.includes('cycle');
            
            let decimals = 2;
            if (isBtc) decimals = 6;
            else if (isInteger) decimals = 0;

            const formatted = value.toLocaleString('en-US', { 
                minimumFractionDigits: decimals, 
                maximumFractionDigits: decimals 
            });
            
            if (element.textContent !== formatted) {
                element.textContent = formatted;
            }
        }
    }

    // --- 4. SINCRONIZACIÓN DE INPUTS (Solo si no están en foco) ---
    if (state.config) {
        const conf = state.config;
        const inputsMapping = {
            'auamountl-usdt': conf.long?.amountUsdt,
            'auamounts-usdt': conf.short?.amountUsdt,
            'aupurchasel-usdt': conf.long?.purchaseUsdt,
            'aupurchases-usdt': conf.short?.purchaseUsdt,
            'auincrement': conf.long?.size_var,
            'audecrement': conf.long?.price_var,
            'autrigger': conf.long?.trigger
        };

        for (const [id, value] of Object.entries(inputsMapping)) {
            const input = document.getElementById(id);
            if (input && value !== undefined && document.activeElement !== input) {
                // Sincroniza el valor del input solo si el usuario no está escribiendo en él
                if (input.value != value) input.value = value;
            }
        }

        // Checkboxes de "Stop at Cycle"
        const stopL = document.getElementById('au-stop-long-at-cycle');
        const stopS = document.getElementById('au-stop-short-at-cycle');
        if (stopL) stopL.checked = !!conf.long?.stopAtCycle;
        if (stopS) stopS.checked = !!conf.short?.stopAtCycle;
    }

    // --- 5. ESTADO GLOBAL DE CONTROLES ---
    const isGlobalStopped = state.lstate === 'STOPPED' && state.sstate === 'STOPPED';
    updateControlsState(isGlobalStopped);
}

/**
 * Formatea valores de ganancia/pérdida con colores y signos
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
 * Gestiona la disponibilidad de los inputs y el estilo del botón Start/Stop
 */
function updateControlsState(isStopped) {
    const startStopButton = document.getElementById('austart-btn');
    const autobotSettings = document.getElementById('autobot-settings');
    
    if (startStopButton) {
        const isRunning = !isStopped;
        const newText = isRunning ? 'STOP AUTOBOT' : 'START AUTOBOT';
        
        if (startStopButton.textContent !== newText) {
            startStopButton.textContent = newText;
            startStopButton.className = isRunning 
                ? 'flex-1 bg-red-600 hover:bg-red-700 py-3 rounded-xl font-bold transition-all shadow-lg uppercase text-sm'
                : 'flex-1 bg-emerald-600 hover:bg-emerald-700 py-3 rounded-xl font-bold transition-all shadow-lg uppercase text-sm';
        }
    }

    if (autobotSettings) {
        const inputs = autobotSettings.querySelectorAll('input');
        inputs.forEach(input => {
            // Ciertos controles siempre deben ser editables (estrategia de salida)
            const isAlwaysEnabled = ['au-stop-long-at-cycle', 'au-stop-short-at-cycle'].includes(input.id);
            
            if (isAlwaysEnabled) {
                input.disabled = false;
                input.style.opacity = '1';
                input.style.cursor = 'pointer';
            } else {
                // Bloquear parámetros base mientras el bot corre para evitar errores de cálculo
                input.disabled = !isStopped;
                input.style.opacity = isStopped ? '1' : '0.5';
                input.style.cursor = isStopped ? 'auto' : 'not-allowed';
            }
        });
    }
}

/**
 * Actualiza etiquetas de estado (RUNNING, STOPPED, etc.)
 */
function updateStatusLabel(id, status) {
    const el = document.getElementById(id);
    if (!el || !status || el.textContent === status) return;
    
    el.textContent = status;
    el.className = `text-[10px] font-bold ${STATUS_COLORS[status] || 'text-gray-500'}`;
}

/**
 * Sistema de Notificaciones (Toasts)
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