/**
 * uiManager.js - Atomic Orchestrator (Synchronized & Shielded 2026)
 * Final Integration: Static Dashboard Import + DOM Diffing Guard + State Persistence
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig, uiLocks } from './ui/controls.js';
import { isSavingConfig, checkConfigAcknowledgment } from './apiService.js';
import { updateMetricsFromState } from './metricsManager.js';
import * as dashboard from './dashboard.js';

export { displayMessage } from './ui/notifications.js';

let lastPrice = 0;
let lastKnownState = null;
let lastAiPulse = {}; // 🛡️ Caché persistente para el último pulso válido de la IA

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

export async function updateBotUI(state) {
    // --- 🛡️ STATE GUARD: Protects against empty states during tab transitions ---
    if (!state || Object.keys(state).length === 0) {
        if (lastKnownState) {
            console.warn("⚠️ Received empty or null state during transition. Using memory cache.");
            state = lastKnownState;
        } else {
            return;
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

                    if (isFocused || isInsideGracePeriod || uiLocks.isLocked(id)) {
                        activeLocks[id] = inputEl.value;
                    }
                });

                syncInputsFromConfig(state.config);

                // 🛡️ Sincronización explícita para los inputs de la IA (dentro del escudo)
                const aiConfig = state.config.ai || state.config.aibot || state.config.aiBot;
                if (aiConfig) {
                    const aiVal = aiConfig.amountUsdt ?? aiConfig.amount ?? 0;
                    
                    ['auamountai-usdt', 'ai-amount-usdt'].forEach(inputId => {
                        const inputEl = document.getElementById(inputId);
                        if (inputEl && inputEl !== document.activeElement) {
                            const currentVal = parseFloat(inputEl.value);
                            if (isNaN(currentVal) || currentVal !== Number(aiVal)) {
                                inputEl.value = aiVal;
                            }
                        }
                    });
                }

                Object.entries(activeLocks).forEach(([id, preservedValue]) => {
                    const inputEl = document.getElementById(id);
                    if (inputEl && inputEl.value !== preservedValue) {
                        inputEl.value = preservedValue;
                    }
                });
            }
        }

    // --- MASTER MAPPING WITH DOM DIFFING GUARD ---
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
        'aulncp': 'lncp',
        'aulrca': 'lrca',
        'aulcoverage': 'lcoverage',   
        'aulnorder': 'lnorder', 
        'ausprofit-val': 'sprofit',   
        'ausbalance': 'sbalance',     
        'auscycle': 'scycle',         
        'ausbprice': 'spc',           
        'austprice': 'stprice',       
        'austppc': 'sppc', 
        'ausncp': 'sncp', 
        'ausrca': 'srca', 
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

        let formattedText = '';

        if (id === 'cycle-efficiency') {
            formattedText = `$${parseFloat(val).toFixed(2)}/d`;
        } else if (id === 'cycle-avg-duration' || id === 'cycle-avg-profit' || id === 'cycle-avg-orders' || id === 'cycle-avg-recovery' || id === 'cycle-win-rate' || id === 'cycle-net-profit') {
            formattedText = val.toString();
        } else if (id.includes('state') || id.includes('status')) {
            formattedText = val.toString().toUpperCase().trim();
            if (el.textContent !== formattedText) {
                el.textContent = formattedText;
                el.style.color = id.includes('aistate') && formattedText === 'RUNNING' ? '#818cf8' : (STATUS_COLORS[formattedText] || '#9ca3af');
            }
            return;
        } else if (id.includes('btc') || id === 'aubalance-btc') {
            formattedText = parseFloat(val).toFixed(6);
        } else if (id.includes('cycle') || id.includes('norder')) {
            formattedText = Math.floor(val).toString();
        } else if (id.includes('coverage')) {
            formattedText = parseFloat(val).toLocaleString();
        } else {
            // For general formatted values, delegate or compute diffing inside formatters if possible, 
            // but we can check assignment directly where appropriate.
        }

        // --- DOM DIFFING CHECK: Only update DOM if text actually changed ---
        if (formattedText && el.textContent !== formattedText) {
            el.textContent = formattedText;
        } else if (!formattedText && !id.includes('profit')) {
            formatValue(el, val, false, false);
        }

        if (id.includes('profit')) {
            formatProfit(el, val);
        }
    });

    // --- PULSE METRICS (Shielded with Persistent Cache) ---
    if (state.aiLastPulse && typeof state.aiLastPulse === 'object' && Object.keys(state.aiLastPulse).length > 0) {
        lastAiPulse = state.aiLastPulse;
    }
    const pulseSource = lastAiPulse;

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
            const newText = metric.id.includes('macd') ? floatVal.toFixed(4) : floatVal.toFixed(1);
            if (el.textContent !== newText) {
                el.textContent = newText;
            }
            if (metric.barId) updatePulseBars(metric.id, floatVal);
        }
    });

    // --- STOCH METRICS ---
    const stochEl = document.getElementById('ai-stoch-val');
    const stochBar = document.getElementById('ai-stoch-bar');
    const kVal = parseFloat(pulseSource.aiStochK ?? pulseSource.stochK ?? 0);
    const dVal = parseFloat(pulseSource.aiStochD ?? pulseSource.stochD ?? 0);

    if (stochEl) {
        const stochText = `${kVal.toFixed(1)} / ${dVal.toFixed(1)}`;
        if (stochEl.textContent !== stochText) {
            stochEl.textContent = stochText;
        }
    }
    if (stochBar) {
        const percent = Math.min(Math.max(kVal, 0), 100);
        const newWidth = `${percent}%`;
        if (stochBar.style.width !== newWidth) {
            stochBar.style.width = newWidth;
        }
    }

    // --- AI CONFIDENCE ---
    const confidenceVal = parseFloat(pulseSource.aiConfidence ?? 0);
    const confidenceTextEl = document.getElementById('ai-confidence-value');
    if (confidenceTextEl) {
        const confText = `${Math.round(confidenceVal)}%`;
        if (confidenceTextEl.textContent !== confText) {
            confidenceTextEl.textContent = confText;
        }
    }

    const circleEl = document.getElementById('ai-confidence-circle');
    if (circleEl) {
        const perimeter = 364.42;
        const strokeOffset = perimeter - (Math.min(Math.max(confidenceVal, 0), 100) / 100) * perimeter;
        circleEl.style.strokeDashoffset = strokeOffset;
    }

    const hasStateData = state.lstate !== undefined || state.sstate !== undefined || state.aistate !== undefined || state.isRunning !== undefined;
    if (hasStateData) updateControlsState(state);

    // --- DASHBOARD SYNC (Using static import) ---
    try {
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
    const newWidth = `${Math.min(Math.max(percent, 0), 100)}%`;
    if (bar.style.width !== newWidth) {
        bar.style.width = newWidth;
    }
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