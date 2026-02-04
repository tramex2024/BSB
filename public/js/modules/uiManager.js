/**
 * uiManager.js - Orquestador Atómico (Corregido: Mapeo L-Stop/S-Stop)
 * Sincronización total basada en STATUS_COLORS
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
import { isSavingConfig } from './apiService.js';

export { displayMessage } from './ui/notifications.js';

let lastPrice = 0;

// Sincronización exacta con STATUS_COLORS de tu aplicación
const STATUS_COLORS = {
    'RUNNING': '#10b981',      
    'STOPPED': '#ef4444',      
    'BUYING': '#60a5fa',        
    'SELLING': '#fbbf24',      
    'PAUSED': '#fb923c',    
};

export function updateBotUI(state) {
    if (!state || isSavingConfig) return;
    
    // 1. Precio de Mercado
    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // MAPEO MAESTRO CORREGIDO
    const elements = {
        'auprofit': 'total_profit', 
        'aubalance-usdt': 'lastAvailableUSDT', 
        'aubalance-btc': 'lastAvailableBTC',

        // AUTOBOT: LONG
        'aulprofit-val': 'lprofit',   
        'aulbalance': 'lbalance',     
        'aulcycle': 'lcycle',         
        'aulsprice': 'llep', // Entry Price          
        'aultprice': 'ltprice', // Target Price      
        'aultppc': 'lpc',       // <--- CORREGIDO: L-Stop ahora usa lpc (Long Price Close)
        'aulcoverage': 'lcoverage',   
        'aulnorder': 'aulnorder',     

        // AUTOBOT: SHORT
        'ausprofit-val': 'sprofit',   
        'ausbalance': 'sbalance',     
        'auscycle': 'scycle',         
        'ausbprice': 'slep', // Entry Price          
        'austprice': 'stprice', // Target Price      
        'austppc': 'spc',       // <--- CORREGIDO: S-Stop ahora usa spc (Short Price Close)
        'auscoverage': 'scoverage',   
        'ausnorder': 'ausnorder',     

        // AI ENGINE
        'ai-virtual-balance': 'aibalance', 
        'ai-adx-val': 'lai',               
        'ai-stoch-val': 'lac',             
        'aubot-aistate': 'lstate',         

        // ESTADOS
        'aubot-lstate': 'lstate',
        'aubot-sstate': 'sstate',
        'ai-mode-status': 'lstate'         
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        let val = state[key] ?? state.stats?.[key] ?? 0;

        // --- Lógica de Renderizado de Estados y Colores ---
        if (id.includes('state') || id.includes('status')) {
            const currentStatus = (val || 'STOPPED').toString().toUpperCase().trim();
            el.textContent = currentStatus;
            
            el.style.color = STATUS_COLORS[currentStatus] || '#9ca3af'; 
            el.className = "font-bold font-mono uppercase";
            return;
        }

        // --- Lógica de Renderizado de Datos ---
        if (id.includes('profit')) {
            formatProfit(el, val);
        } else if (id.includes('btc')) {
            formatValue(el, val, true, false);
        } else if (id.includes('cycle') || id.includes('norder')) {
            el.textContent = Math.floor(val); 
        } else if (id.includes('adx') || id.includes('stoch')) {
            el.textContent = parseFloat(val).toFixed(1);
            updatePulseBars(id, val); 
        } else if (id.includes('coverage')) {
            el.textContent = parseFloat(val).toFixed(2);
        } else {
            formatValue(el, val, false, false);
        }
    });

    // 3. Sincronización de Barras de Confianza (AI)
    if (state.aiConfidence !== undefined) {
        const bar = document.getElementById('ai-confidence-fill');
        if (bar) bar.style.width = `${state.aiConfidence}%`;
        
        const aubotAiState = document.getElementById('aubot-aistate');
        if (aubotAiState) {
            const isAiActive = state.config?.ai?.enabled;
            const aiStatus = isAiActive ? 'RUNNING' : 'STOPPED';
            aubotAiState.textContent = aiStatus;
            aubotAiState.style.color = STATUS_COLORS[aiStatus];
            aubotAiState.className = "text-[9px] font-bold font-mono uppercase";
        }
    }

    // 4. Sincronización de Inputs
    if (state.config) { 
        syncInputsFromConfig(state.config); 
    }

    updateControlsState(state);
}

function updatePulseBars(id, value) {
    const barId = id.replace('-val', '-bar');
    const bar = document.getElementById(barId);
    if (!bar) return;
    let percent = id.includes('adx') ? (value / 50) * 100 : value;
    bar.style.width = `${Math.min(percent, 100)}%`;
}

export function updateControlsState(state) {
    if (!state) return;
    
    const lState = state.lstate || 'STOPPED';
    const sState = state.sstate || 'STOPPED';
    const aiEnabled = state.config?.ai?.enabled || false;
    const aiState = aiEnabled ? 'RUNNING' : 'STOPPED';

    const longInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l'];
    const shortInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s'];
    const aiInputs = ['auamountai-usdt', 'ai-amount-usdt'];

    updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    updateButtonState('btn-start-ai', aiState, 'AI', aiInputs); 
    
    const engineMsg = document.getElementById('ai-engine-msg');
    if (engineMsg && aiEnabled) {
        engineMsg.textContent = state.aiMessage || "NEURAL CORE ANALYZING...";
    }
}