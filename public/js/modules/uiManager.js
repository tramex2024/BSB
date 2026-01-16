/**
 * uiManager.js - Gestión Atómica de la Interfaz
 * Optimizado para evitar parpadeos y colisiones de estado.
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
                priceElement.className = 'text-white text-3xl font-bold';
            } else if (currentPrice > lastPrice) {
                priceElement.className = 'text-emerald-400 text-3xl font-bold';
            } else if (currentPrice < lastPrice) {
                priceElement.className = 'text-red-400 text-3xl font-bold';
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
                if (input.value != value) input.value = value;
            }
        }

        const stopL = document.getElementById('au-stop-long-at-cycle');
        const stopS = document.getElementById('au-stop-short-at-cycle');
        if (stopL) stopL.checked = !!conf.long?.stopAtCycle;
        if (stopS) stopS.checked = !!conf.short?.stopAtCycle;
    }

    // --- 5. ACTUALIZACIÓN VISUAL DE BOTONES ---
    updateControlsState(state);
}

/**
 * Gestiona el estado visual de los botones individuales con validación anti-flash
 */
function updateControlsState(state) {
    // MAPEAMOS LAS VARIABLES QUE VIENEN DEL SERVIDOR
    // Si viene 's' lo usamos, si viene 'sstate' también. Si no, 'STOPPED'.
    const sState = state.sstate || state.s || 'STOPPED';
    const lState = state.lstate || state.l || 'STOPPED';

    const btnConfigs = [
        { id: 'austartl-btn', running: lState !== 'STOPPED', label: 'LONG' },
        { id: 'austarts-btn', running: sState !== 'STOPPED', label: 'SHORT' }
    ];

    btnConfigs.forEach(conf => {
        const btn = document.getElementById(conf.id);
        if (btn) {
            const expectedText = conf.running ? `STOP ${conf.label}` : `START ${conf.label}`;
            
            if (btn.textContent !== expectedText) {
                btn.textContent = expectedText;
                btn.className = conf.running 
                    ? 'flex-1 bg-red-600 hover:bg-red-700 py-3 rounded-xl font-bold transition-all shadow-lg uppercase text-sm text-white'
                    : 'flex-1 bg-emerald-600 hover:bg-emerald-700 py-3 rounded-xl font-bold transition-all shadow-lg uppercase text-sm text-white';
            }
        }
    });

    // Bloqueo de inputs de estrategia (Protección de Lógica Exponencial)
    const settingsContainer = document.getElementById('autobot-settings');
    if (settingsContainer) {
        const isAnyRunning = (state.lstate && state.lstate !== 'STOPPED') || 
                             (state.sstate && state.sstate !== 'STOPPED');
        
        const inputs = settingsContainer.querySelectorAll('input');
        inputs.forEach(input => {
            const isAlwaysEnabled = ['au-stop-long-at-cycle', 'au-stop-short-at-cycle'].includes(input.id);
            if (!isAlwaysEnabled) {
                if (input.disabled !== isAnyRunning) {
                    input.disabled = isAnyRunning;
                    input.style.opacity = isAnyRunning ? '0.5' : '1';
                    input.style.cursor = isAnyRunning ? 'not-allowed' : 'auto';
                }
            }
        });
    }
}

/**
 * Formatea valores de ganancia/pérdida
 */
function formatProfit(element, value) {
    const sign = value >= 0 ? '+' : '-';
    const formatted = `${sign}$${Math.abs(value).toFixed(2)}`;
    
    if (element.textContent === formatted) return;

    element.textContent = formatted;
    element.className = `text-xl font-bold ${value >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
}

/**
 * Actualiza etiquetas de estado
 */
function updateStatusLabel(id, status) {
    const el = document.getElementById(id);
    if (!el || !status || el.textContent === status) return;
    
    el.textContent = status;
    el.className = `text-[10px] font-bold ${STATUS_COLORS[status] || 'text-gray-500'}`;
}

/**
 * Notificaciones Toast
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