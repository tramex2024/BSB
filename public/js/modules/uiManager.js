/**
 * uiManager.js - Gestión Atómica de la Interfaz
 * Incluye soporte para Long, Short y AI Bot (Lógica Exponencial)
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

export function updateBotUI(state) {
    if (!state) return;

    // --- 1. ACTUALIZACIÓN DE PRECIO ---
    const priceElement = document.getElementById('auprice');
    if (priceElement && state.price !== undefined) {
        const currentPrice = Number(state.price);
        const isUIEmpty = priceElement.textContent === '$0.00' || priceElement.textContent === '';

        if (currentPrice !== lastPrice || isUIEmpty) {
            if (isUIEmpty || lastPrice === 0) {
                priceElement.className = 'text-white text-2xl font-mono font-bold';
            } else if (currentPrice > lastPrice) {
                priceElement.className = 'text-emerald-400 text-2xl font-mono font-bold';
            } else if (currentPrice < lastPrice) {
                priceElement.className = 'text-red-400 text-2xl font-mono font-bold';
            }
            priceElement.textContent = `$${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            lastPrice = currentPrice;
        }
    }

    // --- 2. VALORES NUMÉRICOS (Dashboard & Bots) ---
    const elementsToUpdate = {
        auprofit: 'total_profit',
        // Balances de posiciones
        aulbalance: 'lbalance',
        ausbalance: 'sbalance',
        auaibalance: 'aibalance', // <--- Agregado AI
        // Precios promedio / Take Profit
        aultprice: 'ltprice',
        austprice: 'stprice',
        // Ciclos actuales
        aulcycle: 'lcycle',
        auscycle: 'scycle',
        auaicycle: 'aicycle',     // <--- Agregado AI
        // Coberturas y otros
        aulcoverage: 'lcoverage', 
        auscoverage: 'scoverage',
        aulsprice: 'lsprice',
        ausbprice: 'sbprice',
        'aulprofit-val': 'lprofit',
        'ausprofit-val': 'sprofit',
        aulnorder: 'lnorder',   
        ausnorder: 'snorder',   
        // Balances de cuenta
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
            let decimals = isBtc ? 6 : (isInteger ? 0 : 2);
            element.textContent = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        }
    }

    // --- 3. SINCRONIZACIÓN DE CONFIGURACIÓN ---
    if (state.config) {
        const conf = state.config;
        const inputsMapping = {
            'auamountl-usdt':    conf.long?.amountUsdt,
            'aupurchasel-usdt':  conf.long?.purchaseUsdt,
            'auincrementl':      conf.long?.size_var,
            'audecrementl':      conf.long?.price_var,
            'aupricestep-l':     conf.long?.price_step_inc,
            'autriggerl':        conf.long?.profit_percent,
            
            'auamounts-usdt':    conf.short?.amountUsdt,
            'aupurchases-usdt':  conf.short?.purchaseUsdt,
            'auincrements':      conf.short?.size_var,
            'audecrements':      conf.short?.price_var,
            'aupricestep-s':     conf.short?.price_step_inc,
            'autriggers':        conf.short?.profit_percent,

            'auamountai-usdt':   conf.ai?.amountUsdt // <--- Agregado AI
        };

        for (const [id, value] of Object.entries(inputsMapping)) {
            const input = document.getElementById(id);
            if (input && value !== undefined && document.activeElement !== input) {
                if (input.value != value) {
                    input.value = value;
                }
            }
        }

        // Checkboxes de parada en ciclo
        const stopL = document.getElementById('au-stop-long-at-cycle');
        const stopS = document.getElementById('au-stop-short-at-cycle');
        const stopAI = document.getElementById('au-stop-ai-at-cycle'); // <--- Agregado AI

        if (stopL && document.activeElement !== stopL) stopL.checked = !!conf.long?.stopAtCycle;
        if (stopS && document.activeElement !== stopS) stopS.checked = !!conf.short?.stopAtCycle;
        if (stopAI && document.activeElement !== stopAI) stopAI.checked = !!conf.ai?.stopAtCycle;
    }
}

export function updateControlsState(state) {
    const activeStates = ['RUNNING', 'BUYING', 'SELLING', 'PAUSED'];
    
    const sStatus = state.sstate || 'STOPPED';
    const lStatus = state.lstate || 'STOPPED';
    const aiStatus = state.aistate || 'STOPPED'; // <--- Agregado AI

    const isShortRunning = activeStates.includes(sStatus);
    const isLongRunning = activeStates.includes(lStatus);
    const isAiRunning = activeStates.includes(aiStatus); // <--- Agregado AI

    // Configuración de botones (Start/Stop)
    const btns = [
        { id: 'austartl-btn', running: isLongRunning, label: 'Long' },
        { id: 'austarts-btn', running: isShortRunning, label: 'Short' },
        { id: 'austartai-btn', running: isAiRunning, label: 'AI' } // <--- Agregado AI
    ];

    btns.forEach(conf => {
        const btn = document.getElementById(conf.id);
        if (btn) {
            btn.textContent = conf.running ? `STOP ${conf.label}` : `START ${conf.label}`;
            btn.className = `flex-1 py-3 rounded-xl font-bold text-[9px] shadow-lg transition-all uppercase text-white ${
                conf.running ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`;
        }
    });

    // Listas de inputs para bloqueo de seguridad
    const longInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l'];
    const shortInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s'];
    const aiInputs = ['auamountai-usdt']; // <--- Agregado AI

    const setLock = (ids, shouldLock) => {
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = shouldLock;
                el.style.opacity = shouldLock ? "0.5" : "1";
                el.style.cursor = shouldLock ? "not-allowed" : "text";
            }
        });
    };

    setLock(longInputs, isLongRunning);
    setLock(shortInputs, isShortRunning);
    setLock(aiInputs, isAiRunning); // <--- Bloqueo de inputs de AI
    
    // Actualización de etiquetas de estado visuales
    updateStatusLabel('aubot-lstate', lStatus);
    updateStatusLabel('aubot-sstate', sStatus);
    updateStatusLabel('aubot-aistate', aiStatus); // <--- Agregado AI
}

function formatProfit(element, value) {
    const sign = value >= 0 ? '+' : '';
    element.textContent = `${sign}$${value.toFixed(2)}`;
    element.className = `text-xl font-mono font-bold ${value >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
}

function updateStatusLabel(id, status) {
    const el = document.getElementById(id);
    if (!el || !status) return;
    el.textContent = status;
    el.className = `font-bold ${STATUS_COLORS[status] || 'text-gray-500'}`;
}

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