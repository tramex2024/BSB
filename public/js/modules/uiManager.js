/**
 * uiManager.js - Gestión Atómica de la Interfaz
 * Optimizado para lógica exponencial y sincronización de estados.
 */

let lastPrice = 0;

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
        const isUIEmpty = priceElement.textContent === '$0.00' || priceElement.textContent === '';

        if (currentPrice !== lastPrice || isUIEmpty) {
            if (isUIEmpty || lastPrice === 0) {
                priceElement.className = 'text-white text-xl font-mono font-bold';
            } else if (currentPrice > lastPrice) {
                priceElement.className = 'text-emerald-400 text-xl font-mono font-bold';
            } else if (currentPrice < lastPrice) {
                priceElement.className = 'text-red-400 text-xl font-mono font-bold';
            }

            priceElement.textContent = `$${currentPrice.toLocaleString('en-US', { 
                minimumFractionDigits: 2, maximumFractionDigits: 2 
            })}`;
            lastPrice = currentPrice;
        }
    }

    // --- 2. VALORES NUMÉRICOS ---
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

    // --- 3. SINCRONIZACIÓN DE CONFIGURACIÓN (Inputs) ---
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
                if (input.value != value) input.value = value;
            }
        }

        const stopL = document.getElementById('au-stop-long-at-cycle');
        const stopS = document.getElementById('au-stop-short-at-cycle');
        if (stopL) stopL.checked = !!conf.long?.stopAtCycle;
        if (stopS) stopS.checked = !!conf.short?.stopAtCycle;
    }

    // --- 4. ACTUALIZACIÓN DE ESTADOS Y BOTONES ---
    updateControlsState(state);
}

/**
 * Gestiona botones, bloqueo de inputs y etiquetas de estado
 */
export function updateControlsState(state) {
    const sStatus = state.s || state.sstate || 'STOPPED';
    const lStatus = state.l || state.lstate || 'STOPPED';

    const isShortRunning = sStatus !== 'STOPPED';
    const isLongRunning = lStatus !== 'STOPPED';

    // Actualización de Botones
    const btnConfigs = [
        { id: 'austartl-btn', running: isLongRunning, label: 'LONG' },
        { id: 'austarts-btn', running: isShortRunning, label: 'SHORT' }
    ];

    btnConfigs.forEach(conf => {
        const btn = document.getElementById(conf.id);
        if (btn) {
            const text = conf.running ? `STOP ${conf.label}` : `START ${conf.label}`;
            btn.textContent = text;
            btn.className = `flex-1 py-3 rounded-xl font-bold text-sm shadow-lg transition-all uppercase text-white ${
                conf.running ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`;
        }
    });

    // Bloqueo de Inputs
    const shouldDisable = isShortRunning || isLongRunning;
    const inputs = [
        'auamountl-usdt', 'auamounts-usdt', 'aupurchasel-usdt', 'aupurchases-usdt',
        'auincrement', 'audecrement', 'autrigger', 'au-stop-long-at-cycle', 'au-stop-short-at-cycle'
    ];

    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = shouldDisable;
            el.classList.toggle('opacity-50', shouldDisable);
            el.classList.toggle('cursor-not-allowed', shouldDisable);
        }
    });

    // Etiquetas de estado
    updateStatusLabel('aubot-lstate', lStatus);
    updateStatusLabel('aubot-sstate', sStatus);
}

/**
 * Formatea valores de ganancia/pérdida
 */
function formatProfit(element, value) {
    const sign = value >= 0 ? '+' : '';
    const formatted = `${sign}$${value.toFixed(2)}`;
    element.textContent = formatted;
    element.className = `text-xl font-mono font-bold ${value >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
}

/**
 * Actualiza etiquetas de estado con colores dinámicos
 */
function updateStatusLabel(id, status) {
    const el = document.getElementById(id);
    if (!el || !status) return;
    el.textContent = status;
    el.className = `text-[10px] font-bold ${STATUS_COLORS[status] || 'text-gray-500'}`;
}

/**
 * Notificaciones Toast
 */
export function displayMessage(message, type = 'info') {
    let container = document.getElementById('message-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'message-container';
        document.body.appendChild(container);
    }

    container.textContent = message;
    container.className = `fixed bottom-5 right-5 px-6 py-3 rounded-xl text-white font-bold shadow-2xl z-50 transition-all transform animate-slideUp ${
        type === 'error' ? 'bg-red-500' : (type === 'success' ? 'bg-emerald-500' : 'bg-blue-500')
    }`;

    setTimeout(() => {
        container.classList.add('opacity-0', 'translate-y-10');
        setTimeout(() => container.remove(), 500);
    }, 4000);
}