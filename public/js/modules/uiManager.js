/**
 * uiManager.js - Orquestador Atómico (Sincronizado 2026)
 * Etapa 1: Protección Total contra parpadeo y reseteo de estados.
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
import { isSavingConfig } from './apiService.js';
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

/**
 * Función Principal: Actualiza todos los elementos visuales
 */
export async function updateBotUI(state) {
    if (!state) return;

    // 1. Actualización de Precio (Con suavizado)
    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // 2. MAPEO MAESTRO (Sincronizado con IDs de HTML y Propiedades del Estado)
    const elements = {
        'auprofit': 'total_profit', 
        'aubalance-usdt': 'lastAvailableUSDT', 
        'aubalance-btc': 'lastAvailableBTC',

        // ESTRATEGIA LONG
        'aulprofit-val': 'lprofit',   
        'aulbalance': 'lbalance',     
        'aulcycle': 'lcycle',           
        'aulsprice': 'lpc',             
        'aultprice': 'ltprice',       
        'aultppc': 'lppc',           
        'aulcoverage': 'lcoverage',   
        'aulnorder': 'lnorder', 

        // ESTRATEGIA SHORT
        'ausprofit-val': 'sprofit',   
        'ausbalance': 'sbalance',     
        'auscycle': 'scycle',           
        'ausbprice': 'spc',             
        'austprice': 'stprice',       
        'austppc': 'sppc',           
        'auscoverage': 'scoverage',   
        'ausnorder': 'snorder', 

        // AI ENGINE (CORREGIDO: Sincronización exacta con las propiedades del backend)
        'ai-virtual-balance': 'aibalance', 
        'ai-adx-val': 'aiAdx',                   
        'ai-stoch-val': 'aiStoch',                
        'aubot-aistate': 'aistate', 
        'ai-trend-label': 'aiTrendLabel',     
        'ai-engine-msg': 'aiEngineMsg',  

        // ESTADOS DE TEXTO
        'aubot-lstate': 'lstate',
        'aubot-sstate': 'sstate',
        'ai-mode-status': 'aistate' 
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        let val = state[key] !== undefined ? state[key] : (state.stats ? state.stats[key] : undefined);

        if (val === undefined || val === null) return;

        // --- Renderizado de Estados ---
        if (id.includes('state') || id.includes('status')) {
            const currentStatus = val.toString().toUpperCase().trim();
            if (el.textContent !== currentStatus) {
                el.textContent = currentStatus;
                if (id.includes('aistate')) {
                    el.style.color = currentStatus === 'RUNNING' ? '#818cf8' : '#ef4444';
                } else {
                    el.style.color = STATUS_COLORS[currentStatus] || '#9ca3af'; 
                }
            }
            return;
        }

        // --- Renderizado de Números y Datos de Mercado ---
        if (id.includes('profit')) {
            formatProfit(el, val);
        } else if (id.includes('btc') || id === 'aubalance-btc') {
            const btcVal = parseFloat(val).toFixed(6);
            if (el.textContent !== btcVal) el.textContent = btcVal;
        } else if (id.includes('cycle') || id.includes('norder')) {
            const cycleVal = Math.floor(val).toString();
            if (el.textContent !== cycleVal) el.textContent = cycleVal;
        } else if (id.includes('adx') || id.includes('stoch')) {
            el.textContent = parseFloat(val).toFixed(1);
            updatePulseBars(id, val); 
        } else if (id.includes('coverage')) {
            el.textContent = parseFloat(val).toLocaleString(); 
        } else {
            formatValue(el, val, false, false);
        }
    });

    // 3. Barras de Confianza AI y Círculo de Confianza
    if (state.aiConfidence !== undefined) {
        const bar = document.getElementById('ai-confidence-fill');
        if (bar) bar.style.width = `${state.aiConfidence}%`;
        
        const confValEl = document.getElementById('ai-confidence-value');
        if (confValEl) confValEl.textContent = `${parseInt(state.aiConfidence)}%`;
    }

    // 4. Sincronización de Inputs
    if (state.config && !isSavingConfig) { 
        syncInputsFromConfig(state.config); 
    }

    // 5. Control de Botones
    const hasStateData = state.lstate !== undefined || 
                         state.sstate !== undefined || 
                         state.aistate !== undefined || 
                         state.isRunning !== undefined;

    if (hasStateData) {
        updateControlsState(state);
    }

    // 6. Actualización de Dashboard e Integración de Pulso de Mercado
    try {
        const dashboard = await import('./dashboard.js');
        if (dashboard) {
            // Actualización de barras de PnL
            if (typeof dashboard.updatePnLBar === 'function') {
                const lProfit = parseFloat(state.lprofit ?? state.stats?.lprofit ?? 0);
                const sProfit = parseFloat(state.sprofit ?? state.stats?.sprofit ?? 0);
                const aiProfit = parseFloat(state.aiprofit ?? state.stats?.aiprofit ?? 0);

                dashboard.updatePnLBar('long', lProfit);
                dashboard.updatePnLBar('short', sProfit);
                dashboard.updatePnLBar('ai', aiProfit);
                
                const totalProfit = state.total_profit ?? (lProfit + sProfit + aiProfit);
                const totalEl = document.getElementById('auprofit');
                if (totalEl) formatProfit(totalEl, totalProfit);
            }

            // CORRECCIÓN DIRECTA: Inyectar datos en tiempo real al widget de IA del Dashboard
            if (typeof dashboard.updateAIMarketPulse === 'function') {
                dashboard.updateAIMarketPulse(state);
            }
        }
    } catch (err) { /* Silencioso */ }
    
    // Dentro de uiManager.js -> updateBotUI
    try {
    // Si la función del dashboard está exportada o disponible, la ejecutamos
    import('./dashboard.js').then(db => {
        if (typeof db.updateAIMarketPulse === 'function') {
            db.updateAIMarketPulse(state);
        }
    });
} catch (err) {
    console.warn("Dashboard no listo para recibir Market Pulse");
}

    // Sincronizamos las métricas con el nuevo payload
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
    
    const lState = state.lstate;
    const sState = state.sstate;
    const aiState = state.aistate;

    const longInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l'];
    const shortInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s'];
    const aiInputs = ['ai-amount-usdt']; 

    if (lState !== undefined) {
        updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    }
    
    if (sState !== undefined) {
        updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    }
    
    if (aiState !== undefined || state.isRunning !== undefined) {
        const btnAi = document.getElementById('btn-start-ai') || document.getElementById('austartai-btn');
        const actualAiStatus = aiState || (state.isRunning ? 'RUNNING' : 'STOPPED');

        if (btnAi && !btnAi.disabled) {
            updateButtonState(btnAi.id, actualAiStatus, 'AI', aiInputs); 
        }
        
        const engineMsg = document.getElementById('ai-engine-msg');
        if (engineMsg) {
            if (actualAiStatus === 'RUNNING') {
                engineMsg.textContent = state.aiMessage || state.aiEngineMsg || "NEURAL CORE ANALYZING...";
                engineMsg.classList.add('animate-pulse', 'text-blue-400');
            } else {
                engineMsg.textContent = state.aiEngineMsg || "AI CORE IN STANDBY";
                engineMsg.classList.remove('animate-pulse', 'text-blue-400');
            }
        }
    }
}