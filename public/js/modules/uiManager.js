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

export async function updateBotUI(state) {
    if (!state) return;

    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // --- 🛡️ [NUEVO] BLINDAJE DE SINCRONIZACIÓN ---
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

                // Captura el estado si el usuario está interactuando o tiene el lock activo
                if (isFocused || isInsideGracePeriod || uiLocks.isLocked(id)) {
                    activeLocks[id] = inputEl.value;
                }
            });

            syncInputsFromConfig(state.config);

            // Restauración forzosa de la edición activa
            Object.entries(activeLocks).forEach(([id, preservedValue]) => {
                const inputEl = document.getElementById(id);
                if (inputEl && inputEl.value !== preservedValue) {
                    inputEl.value = preservedValue;
                }
            });
        }
    }

    // --- MAPEO MAESTRO (Tu lógica original intacta) ---
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

        // IDs de las métricas de ciclo
    	'cycle-avg-duration': 'avg_duration',  // ID del HTML -> Propiedad en el estado
    	'cycle-efficiency': 'profit_per_day',  // ID del HTML -> Propiedad en el estado
	    
        // Si también quieres asegurar los otros campos de esa tarjeta:
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

        // --- 🛡️ EXCEPCIONES PARA NUEVAS MÉTRICAS (PREVENCIÓN DE REDONDEO) ---
        if (id === 'cycle-efficiency') {
            el.textContent = `$${parseFloat(val).toFixed(2)}/d`;
            return;
        }
        if (id === 'cycle-avg-duration' || id === 'cycle-avg-profit' || id === 'cycle-avg-orders' || id === 'cycle-avg-recovery' || id === 'cycle-win-rate' || id === 'cycle-net-profit') {
            el.textContent = val; 
            return;
        }
        // --- FIN DE EXCEPCIONES ---

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
            // Este bloque solo se ejecutará para IDs que NO sean los de arriba
            const cycleVal = Math.floor(val).toString();
            if (el.textContent !== cycleVal) el.textContent = cycleVal;
        } else if (id.includes('coverage')) {
            el.textContent = parseFloat(val).toLocaleString(); 
        } else {
            formatValue(el, val, false, false);
        }
    });

    const pulseMetrics = [
        { id: 'ai-adx-val', key: 'lai', fallbackKey: 'aiAdx', barId: 'ai-adx-bar' },
        { id: 'ai-stoch-val', key: 'lac', fallbackKey: 'aiStochK', barId: 'ai-stoch-bar' },
        { id: 'ai-rsi-val', key: 'aiRsi', fallbackKey: 'rsi', barId: null },
        { id: 'ai-macd-val', key: 'aiMacd', fallbackKey: 'macd', barId: null }
    ];

    pulseMetrics.forEach(metric => {
        const el = document.getElementById(metric.id);
        if (!el) return;
        const val = state[metric.key] !== undefined ? state[metric.key] : state[metric.fallbackKey]; 
        if (val !== undefined && val !== null) {
            const floatVal = parseFloat(val);
            el.textContent = metric.id.includes('macd') ? floatVal.toFixed(4) : floatVal.toFixed(1);
            if (metric.barId) updatePulseBars(metric.id, floatVal);
        }
    });

    if (state.aiConfidence !== undefined) {
        const bar = document.getElementById('ai-confidence-fill');
        if (bar) bar.style.width = `${Math.min(Math.max(state.aiConfidence, 0), 100)}%`;
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
        console.error("⚠️ Falló el enlace de actualización cruzada con dashboard.js:", err);
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