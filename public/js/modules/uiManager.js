/**
 * uiManager.js - Gestión Atómica de la Interfaz
 * Sincroniza Dashboard y Autobot con lógica exponencial
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
            priceElement.className = 'text-lg font-mono font-bold leading-none ' + 
                (isUIEmpty || currentPrice === lastPrice ? 'text-white' : 
                (currentPrice > lastPrice ? 'text-emerald-400' : 'text-red-400'));
            
            priceElement.textContent = `$${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            lastPrice = currentPrice;
        }
    }

    // --- 2. VALORES NUMÉRICOS (Sincronización Global) ---
    const elementsToUpdate = {
        auprofit: 'total_profit',
        aulbalance: 'lbalance',
        ausbalance: 'sbalance',
        aultprice: 'lppc',
        austprice: 'sppc',
        aulsprice: 'lsprice',
        ausbprice: 'sbprice',
        aulcycle: 'lcycle',
        auscycle: 'scycle',
        aulcoverage: 'lcoverage', 
        auscoverage: 'scoverage',
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
        
        let rawValue = state[dataKey];
        if (rawValue === undefined || rawValue === null) continue;

        const value = Number(rawValue);
        if (elementId.includes('profit')) {
            formatProfit(element, value);
        } else {
            const isBtc = elementId.includes('btc');
            const isInteger = elementId.includes('norder') || elementId.includes('cycle');
            let decimals = isBtc ? 6 : (isInteger ? 0 : 2);
            element.textContent = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        }
    }

    // --- 3. CONFIGURACIÓN E INPUTS ---
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
            'auamountai-usdt':   conf.ai?.amountUsdt
        };

        for (const [id, value] of Object.entries(inputsMapping)) {
            const input = document.getElementById(id);
            if (input && value !== undefined && document.activeElement !== input) {
                input.value = value;
            }
        }

        // Checkboxes
        const stops = {
            'au-stop-long-at-cycle': !!conf.long?.stopAtCycle,
            'au-stop-short-at-cycle': !!conf.short?.stopAtCycle,
            'au-stop-ai-at-cycle': !!conf.ai?.stopAtCycle
        };

        for (const [id, checked] of Object.entries(stops)) {
            const el = document.getElementById(id);
            if (el && document.activeElement !== el) el.checked = checked;
        }
    }
}

export function updateControlsState(state) {
    if (!state) return;

    const activeStates = ['RUNNING', 'BUYING', 'SELLING', 'PAUSED'];
    
    const lStatus = state.lstate || 'STOPPED';
    const sStatus = state.sstate || 'STOPPED';
    const aiStatus = state.aistate || 'STOPPED';

    const isLongRunning = activeStates.includes(lStatus);
    const isShortRunning = activeStates.includes(sStatus);
    const isAiRunning = activeStates.includes(aiStatus);

    // Definición de botones (Dashboard usa los 3, Autobot usa L y S)
    const btns = [
        { id: 'austartl-btn', running: isLongRunning, label: 'L', activeColor: 'bg-red-600', idleColor: 'bg-emerald-600' },
        { id: 'austarts-btn', running: isShortRunning, label: 'S', activeColor: 'bg-red-600', idleColor: 'bg-emerald-600' },
        { id: 'austartai-btn', running: isAiRunning, label: 'AI', activeColor: 'bg-red-600', idleColor: 'bg-indigo-600' }
    ];

    btns.forEach(conf => {
        const btn = document.getElementById(conf.id);
        if (btn) {
            btn.textContent = conf.running ? `STOP ${conf.label}` : (conf.label === 'AI' ? 'AI' : conf.label);
            
            // Reset y aplicación de color
            btn.classList.remove('bg-emerald-600', 'bg-red-600', 'bg-indigo-600', 'opacity-50', 'cursor-not-allowed');
            btn.classList.add(conf.running ? conf.activeColor : conf.idleColor);
            
            // DESBLOQUEO FORZADO
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.style.pointerEvents = "auto";
        }
    });

    // Bloqueo de Inputs
    const setLock = (ids, shouldLock) => {
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = shouldLock;
                el.style.opacity = shouldLock ? "0.4" : "1";
                el.style.pointerEvents = shouldLock ? "none" : "auto";
            }
        });
    };

    setLock(['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l'], isLongRunning);
    setLock(['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s'], isShortRunning);
    setLock(['auamountai-usdt'], isAiRunning);
    
    updateStatusLabel('aubot-lstate', lStatus);
    updateStatusLabel('aubot-sstate', sStatus);
    updateStatusLabel('aubot-aistate', aiStatus);
}

function formatProfit(element, value) {
    const sign = value >= 0 ? '+' : '';
    element.textContent = `${sign}$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    element.className = `text-lg font-mono font-bold ${value >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
}

function updateStatusLabel(id, status) {
    const el = document.getElementById(id);
    if (!el || !status) return;
    el.textContent = status;
    el.className = `text-[9px] font-bold font-mono ${STATUS_COLORS[status] || 'text-gray-500'}`;
}

export function displayMessage(message, type = 'info') {
    let container = document.getElementById('message-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'message-container';
        document.body.appendChild(container);
    }
    container.textContent = message;
    container.className = `fixed bottom-5 right-5 px-4 py-2 rounded-lg text-white text-[10px] font-bold shadow-2xl z-50 transition-all transform translate-y-0 opacity-100 ${
        type === 'error' ? 'bg-red-500' : (type === 'success' ? 'bg-emerald-500' : 'bg-blue-500')
    }`;
    setTimeout(() => {
        if (container) {
            container.className += ' opacity-0 translate-y-4';
            setTimeout(() => { container.remove(); }, 500);
        }
    }, 3000);
}