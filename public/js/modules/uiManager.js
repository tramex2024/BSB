/**
 * uiManager.js - Orquestador Atómico (Sincronizado & Blindado 2026)
 * Integración Final: Mapeo maestro intacto + Protección contra parpadeo
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig, uiLocks } from './ui/controls.js';
import { isSavingConfig, checkConfigAcknowledgment } from './apiService.js';
import { updateMetricsFromState } from './metricsManager.js';

export { displayMessage } from './ui/notifications.js';

let lastPrice = 0;

const STATUS_COLORS = {
    'RUNNING': '#10b981',      
    'STOPPED': '#ef4444',      
    'BUYING': '#60a5fa',         
    'SELLING': '#fbbf24',      
    'PAUSED': '#fb923c',    
};

const CRITICAL_INPUTS = [
    'auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l',
    'auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s',
    'auamountai-usdt', 'ai-amount-usdt'
];

export function getSanitizedValue(id) {
    const el = document.getElementById(id);
    if (!el) return undefined;
    const val = el.value.trim();
    if (val === "") return undefined;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? undefined : parsed;
}

window.addEventListener('input', (e) => {
    if (CRITICAL_INPUTS.includes(e.target.id)) {
        e.target.dataset.lastUserMutation = Date.now();
    }
}, true);

// Variable de memoria para persistencia de datos (colócala fuera de la función, al nivel del módulo)
let lastKnownState = null;

export async function updateBotUI(state) {
    // --- 🛡️ MEMORY BUFFER: Protege contra estados vacíos durante transiciones ---
    if (!state || Object.keys(state).length === 0) {
        if (lastKnownState) {
            console.warn("⚠️ Received empty or null state during transition. Using memory cache.");
            state = lastKnownState;
        } else {
            return; // No hay estado ni caché, abortamos
        }
    } else {
        lastKnownState = state;
    }

    // 🔍 AUDIT LOG: Checking exact data received by frontend
    // console.log("📥 [FRONTEND RECEIVED STATE]:", state);

    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // --- 🛡️ SYNC SHIELD ---
    if (state.config) {
        checkConfigAcknowledgment(state.config);

        if (!isSavingConfig) {
            const activeLocks = {};
            CRITICAL_INPUTS.forEach(id => {
                const inputEl = document.getElementById(id);
                if (!inputEl) return;
                
                const isFocused = inputEl === document.activeElement;
                const lastMutation = parseInt(inputEl.dataset.lastUserMutation || 0);
                const isInsideGracePeriod = (Date.now() - lastMutation) < 2500;

                // Capture state if user is interacting or lock is active
                if (isFocused || isInsideGracePeriod || uiLocks.isLocked(id)) {
                    activeLocks[id] = inputEl.value;
                }
            });

            syncInputsFromConfig(state.config);

            // Force restoration of active editing
            Object.entries(activeLocks).forEach(([id, preservedValue]) => {
                const inputEl = document.getElementById(id);
                if (inputEl && inputEl.value !== preservedValue) {
                    inputEl.value = preservedValue;
                }
            });
        }
    }

    // --- MASTER MAPPING ---
    const elements = {
        'auprofit': 'total_profit', 
        'aubalance-usdt': 'lastAvailableUSDT', 
        'aubalance-btc': 'lastAvailableBTC',
        'aulprofit-val': 'lprofit',   
        'aulbalance': 'lbalance',     
        'aulcycle': 'lcycle',         
        'aulsprice': 'lpc',           
        'aultprice': 'ltprice',       
        'aultppc': 'lppc',          
        'aulcoverage': 'lcoverage',   
        'aulnorder': 'lnorder', 
        'ausprofit-val': 'sprofit',   
        'ausbalance': 'sbalance',     
        'auscycle': 'scycle',         
        'ausbprice': 'spc',           
        'austprice': 'stprice',       
        'austppc': 'sppc',          
        'auscoverage': 'scoverage',   
        'ausnorder': 'snorder', 
        'ai-virtual-balance': 'aibalance', 
        'aubot-aistate': 'aistate', 
        'ai-trend-label': 'trend',     
        'ai-engine-msg': 'aiMessage',  
        'aubot-lstate': 'lstate',
        'aubot-sstate': 'sstate',
        'ai-mode-status': 'aistate',
        'cycle-avg-duration': 'avg_duration',
        'cycle-efficiency': 'profit_per_day',
        'cycle-avg-profit': 'avg_profit_percent',
        'cycle-net-profit': 'net_avg_profit',
        'total-cycles-closed': 'total_cycles',
        'cycle-avg-orders': 'avg_orders',
        'cycle-avg-recovery': 'avg_recovery',
        'cycle-win-rate': 'win_rate' 
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        let val = state[key] !== undefined ? state[key] : (state.stats ? state.stats[key] : undefined);
        if (val === undefined || val === null) return;

        // --- EXCEPTIONS FOR METRICS ---
        if (id === 'cycle-efficiency') {
            el.textContent = `$${parseFloat(val).toFixed(2)}/d`;
            return;
        }
        if (id === 'cycle-avg-duration' || id === 'cycle-avg-profit' || id === 'cycle-avg-orders' || id === 'cycle-avg-recovery' || id === 'cycle-win-rate' || id === 'cycle-net-profit') {
            el.textContent = val; 
            return;
        }

        if (id.includes('state') || id.includes('status')) {
            const currentStatus = val.toString().toUpperCase().trim();
            if (el.textContent !== currentStatus) {
                el.textContent = currentStatus;
                el.style.color = id.includes('aistate') && currentStatus === 'RUNNING' ? '#818cf8' : (STATUS_COLORS[currentStatus] || '#9ca3af');
            }
            return;
        }

        if (id.includes('profit')) {
            formatProfit(el, val);
        } else if (id.includes('btc') || id === 'aubalance-btc') {
            const btcVal = parseFloat(val).toFixed(6);
            if (el.textContent !== btcVal) el.textContent = btcVal;
        } else if (id.includes('cycle') || id.includes('norder')) {
            const cycleVal = Math.floor(val).toString();
            if (el.textContent !== cycleVal) el.textContent = cycleVal;
        } else if (id.includes('coverage')) {
            el.textContent = parseFloat(val).toLocaleString(); 
        } else {
            formatValue(el, val, false, false);
        }
    });

    // --- PULSE METRICS ---
    const pulseSource = state.aiLastPulse || state;
    const pulseMetrics = [
        { id: 'ai-adx-val', key: 'aiAdx', fallbackKey: 'lai', barId: 'ai-adx-bar' },
        { id: 'ai-rsi-val', key: 'aiRsi', fallbackKey: 'rsi14', barId: null },
        { id: 'ai-macd-val', key: 'aiMacd', fallbackKey: 'macdValue', barId: null }
    ];

    pulseMetrics.forEach(metric => {
        const el = document.getElementById(metric.id);
        if (!el) return;
        const val = pulseSource[metric.key] !== undefined ? pulseSource[metric.key] : pulseSource[metric.fallbackKey]; 
        if (val !== undefined && val !== null) {
            const floatVal = parseFloat(val);
            el.textContent = metric.id.includes('macd') ? floatVal.toFixed(4) : floatVal.toFixed(1);
            if (metric.barId) updatePulseBars(metric.id, floatVal);
        }
    });

    // --- STOCH METRICS ---
    const stochEl = document.getElementById('ai-stoch-val');
    const stochBar = document.getElementById('ai-stoch-bar');
    const kVal = parseFloat(pulseSource.aiStochK ?? pulseSource.stochK ?? state.stochK ?? 0);
    const dVal = parseFloat(pulseSource.aiStochD ?? pulseSource.stochD ?? state.stochD ?? 0);

    if (stochEl) {
        stochEl.textContent = `${kVal.toFixed(1)} / ${dVal.toFixed(1)}`;
    }
    if (stochBar) {
        const percent = Math.min(Math.max(kVal, 0), 100);
        stochBar.style.width = `${percent}%`;
    }

    // --- AI CONFIDENCE ---
    const confidenceVal = parseFloat(pulseSource.aiConfidence ?? state.aiConfidence ?? 0);
    const confidenceTextEl = document.getElementById('ai-confidence-value');
    if (confidenceTextEl) {
        confidenceTextEl.textContent = `${Math.round(confidenceVal)}%`;
    }

    const circleEl = document.getElementById('ai-confidence-circle');
    if (circleEl) {
        const perimeter = 364.42;
        const strokeOffset = perimeter - (Math.min(Math.max(confidenceVal, 0), 100) / 100) * perimeter;
        circleEl.style.strokeDashoffset = strokeOffset;
    }

    const hasStateData = state.lstate !== undefined || state.sstate !== undefined || state.aistate !== undefined || state.isRunning !== undefined;
    if (hasStateData) updateControlsState(state);

    try {
        const dashboard = await import('./dashboard.js');
        if (dashboard) {
            const lProfit = parseFloat(state.lprofit ?? state.stats?.lprofit ?? 0);
            const sProfit = parseFloat(state.sprofit ?? state.stats?.sprofit ?? 0);
            const aiProfit = parseFloat(state.aiprofit ?? state.stats?.aiprofit ?? 0);

            if (typeof dashboard.updatePnLBar === 'function') {
                dashboard.updatePnLBar('long', lProfit);
                dashboard.updatePnLBar('short', sProfit);
                dashboard.updatePnLBar('ai', aiProfit);
            }
            if (typeof dashboard.updateDistributionWidget === 'function') {
                dashboard.updateDistributionWidget(state);
            }
        }
    } catch (err) {
        console.error("⚠️ Failed to link cross-update with dashboard.js:", err);
    }

    updateMetricsFromState(state);
}

function updatePulseBars(id, value) {
    const barId = id.replace('-val', '-bar');
    const bar = document.getElementById(barId);
    if (!bar) return;
    let percent = id.includes('adx') ? (value / 50) * 100 : value; 
    bar.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
}

export function updateControlsState(state) {
    if (!state) return;
    const lInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l'];
    const sInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s'];
    const aiInputs = ['auamountai-usdt', 'ai-amount-usdt']; 

    if (state.lstate !== undefined) updateButtonState('austartl-btn', state.lstate, 'LONG', lInputs);
    if (state.sstate !== undefined) updateButtonState('austarts-btn', state.sstate, 'SHORT', sInputs);
    if (state.aistate !== undefined || state.isRunning !== undefined) {
        const btnAi = document.getElementById('btn-start-ai') || document.getElementById('austartai-btn');
        const actualAiStatus = state.aistate || (state.isRunning ? 'RUNNING' : 'STOPPED');
        if (btnAi) updateButtonState(btnAi.id, actualAiStatus, 'AI', aiInputs); 
    }
}