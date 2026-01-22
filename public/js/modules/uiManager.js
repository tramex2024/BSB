/**
 * uiManager.js - Gestión Atómica de la Interfaz
 * Optimizado para evitar parpadeos y bloqueos de interfaz.
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
 * Actualiza los datos informativos (precios, balances, profits)
 */
export function updateBotUI(state) {
    if (!state) return;

    // --- 1. ACTUALIZACIÓN DE PRECIO ---
    const priceElement = document.getElementById('auprice');
    if (priceElement && state.price != null) {
        const currentPrice = Number(state.price);
        const formattedPrice = `$${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        if (priceElement.textContent !== formattedPrice) {
            if (lastPrice !== 0) {
                // Cambio de color según tendencia
                priceElement.className = `text-lg font-mono font-bold leading-none ${currentPrice > lastPrice ? 'text-emerald-400' : (currentPrice < lastPrice ? 'text-red-400' : 'text-white')}`;
            } else {
                priceElement.className = 'text-lg font-mono font-bold text-white leading-none';
            }
            priceElement.textContent = formattedPrice;
            lastPrice = currentPrice;
        }
    }

    // --- 2. VALORES NUMÉRICOS (Mapping Atómico) ---
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
        
        // Búsqueda flexible de datos (directo o en sub-objeto balances)
        let rawValue = state[dataKey];
        if (rawValue === undefined && state.balances) {
            if (elementId.includes('usdt')) rawValue = state.balances.USDT;
            if (elementId.includes('btc')) rawValue = state.balances.BTC;
        }

        if (rawValue === undefined || rawValue === null) continue;
        const value = Number(rawValue);
        if (isNaN(value)) continue;

        if (elementId.includes('profit')) {
            formatProfit(element, value);
        } else {
            const isBtc = elementId.includes('btc');
            const isInteger = elementId.includes('norder') || elementId.includes('cycle');
            let decimals = isBtc ? 6 : (isInteger ? 0 : 2);
            
            const formatted = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
            if (element.textContent !== formatted) {
                element.textContent = formatted;
            }
        }
    }

    // --- 3. SINCRONIZACIÓN DE INPUTS (Sin interrumpir al usuario) ---
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
            // IMPORTANTE: Solo actualiza si el usuario NO está escribiendo en ese campo
            if (input && value !== undefined && document.activeElement !== input) {
                const valNum = parseFloat(value) || 0;
                const inputNum = parseFloat(input.value) || 0;
                // Evitamos actualizar si la diferencia es insignificante (precisión flotante)
                if (Math.abs(valNum - inputNum) > 0.000001) {
                    input.value = value;
                }
            }
        }

        const stops = {
            'au-stop-long-at-cycle': !!conf.long?.stopAtCycle,
            'au-stop-short-at-cycle': !!conf.short?.stopAtCycle,
            'au-stop-ai-at-cycle': !!conf.ai?.stopAtCycle
        };

        for (const [id, checked] of Object.entries(stops)) {
            const el = document.getElementById(id);
            if (el && document.activeElement !== el && el.checked !== checked) {
                el.checked = checked;
            }
        }
    }
}

/**
 * Actualiza visualmente los botones START/STOP basándose en el estado del servidor
 */
export function updateControlsState(state) {
    if (!state) return;

    // Estos son los estados en los que el botón debe decir "STOP"
    const runningStates = ['RUNNING', 'BUYING', 'SELLING', 'PAUSED'];

    // Obtenemos los estados (si no vienen, asumimos STOPPED)
    const lStatus = (state.lstate || 'STOPPED').toUpperCase();
    const sStatus = (state.sstate || 'STOPPED').toUpperCase();
    const aiStatus = (state.aistate || 'STOPPED').toUpperCase();

    // Mapeo de botones: ID del HTML vs su estado y nombre
    const buttons = [
        { id: 'austartl-btn', currentStatus: lStatus, type: 'LONG' },
        { id: 'austarts-btn', currentStatus: sStatus, type: 'SHORT' },
        { id: 'austartai-btn', currentStatus: aiStatus, type: 'AI' }
    ];

    buttons.forEach(btnInfo => {
        const btnElement = document.getElementById(btnInfo.id);
        if (btnElement) {
            const isAlive = runningStates.includes(btnInfo.currentStatus);
            
            // 1. Cambiar el texto
            btnElement.textContent = isAlive ? `STOP ${btnInfo.type}` : `START ${btnInfo.type}`;

            // 2. Cambiar el color (Rojo si corre, Verde/Indigo si está parado)
            btnElement.classList.remove('bg-emerald-600', 'bg-red-600', 'bg-indigo-600');
            
            if (isAlive) {
                btnElement.classList.add('bg-red-600');
            } else {
                // El botón AI suele ser Indigo, los otros Esmeralda (verde)
                btnElement.classList.add(btnInfo.type === 'AI' ? 'bg-indigo-600' : 'bg-emerald-600');
            }

            // 3. Rehabilitar el botón (por si estaba en "WAIT...")
            btnElement.disabled = false;
            btnElement.style.opacity = "1";
            btnElement.style.pointerEvents = "auto";
        }
    });

    // --- BLOQUEO DE INPUTS ---
    // Bloqueamos los campos de texto si el bot ya está encendido
    const inputsLong = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl'];
    const inputsShort = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements'];

    const setLock = (ids, isRunning) => {
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = isRunning;
                el.style.opacity = isRunning ? "0.5" : "1";
            }
        });
    };

    setLock(inputsLong, runningStates.includes(lStatus));
    setLock(inputsShort, runningStates.includes(sStatus));
}

function formatProfit(element, value) {
    const sign = value >= 0 ? '+' : '';
    const formatted = `${sign}$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    if (element.textContent !== formatted) {
        element.textContent = formatted;
        element.className = `text-lg font-mono font-bold ${value >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    }
}

function updateStatusLabel(id, status) {
    const el = document.getElementById(id);
    if (!el || !status || el.textContent === status) return;
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
            container.classList.add('opacity-0', 'translate-y-4');
            setTimeout(() => { container.remove(); }, 500);
        }
    }, 3000);
}