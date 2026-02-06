// public/js/modules/uiManager.js

/**
 * uiManager.js - Orquestador Atómico
 * Ajuste: Protección de escritura y estados en tiempo real.
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
import { isSavingConfig } from './apiService.js';

export { displayMessage } from './ui/notifications.js';

let lastPrice = 0;

const STATUS_COLORS = {
    'RUNNING': '#10b981',      
    'STOPPED': '#ef4444',      
    'BUYING': '#60a5fa',        
    'SELLING': '#fbbf24',      
    'PAUSED': '#fb923c',      
};

export function updateBotUI(state) {
    if (!state) return;
    
    // 1. Precio de Mercado (Siempre se actualiza, no depende de isSavingConfig)
    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // MAPEO MAESTRO
    const elements = {
        'auprofit': 'total_profit', 
        'aubalance-usdt': 'lastAvailableUSDT', 
        'aubalance-btc': 'lastAvailableBTC',

        // LONG
        'aulprofit-val': 'lprofit',   
        'aulbalance': 'lbalance',     
        'aulcycle': 'lcycle',         
        'aulsprice': 'lpc',            
        'aultprice': 'ltprice',       
        'aultppc': 'lppc',            
        'aulcoverage': 'lcoverage',   
        'aulnorder': 'lnorder',      

        // SHORT
        'ausprofit-val': 'sprofit',   
        'ausbalance': 'sbalance',     
        'auscycle': 'scycle',         
        'ausbprice': 'spc',            
        'austprice': 'stprice',       
        'austppc': 'sppc',            
        'auscoverage': 'scoverage',   
        'ausnorder': 'snorder',

        // AI ENGINE
        'ai-virtual-balance': 'aibalance', 
        'ai-adx-val': 'lai',                
        'ai-stoch-val': 'lac',              
        'aubot-aistate': 'aistate', 

        // ESTADOS
        'aubot-lstate': 'lstate',
        'aubot-sstate': 'sstate',
        'ai-mode-status': 'aistate' 
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        let val = state[key] ?? state.stats?.[key] ?? 0;

        // Render de Estados
        if (id.includes('state') || id.includes('status')) {
            const currentStatus = (val || 'STOPPED').toString().toUpperCase().trim();
            el.textContent = currentStatus;
            el.style.color = STATUS_COLORS[currentStatus] || '#9ca3af'; 
            el.className = "font-bold font-mono uppercase";
            return;
        }

        // Render de Datos Numéricos
        if (id.includes('profit')) {
            formatProfit(el, val);
        } else if (id.includes('btc') || id === 'aubalance-btc') {
            el.textContent = parseFloat(val).toFixed(6);
        } else if (id.includes('cycle') || id.includes('norder')) {
            el.textContent = Math.floor(val); 
        } else if (id.includes('adx') || id.includes('stoch')) {
            el.textContent = val < 1 ? parseFloat(val).toFixed(4) : parseFloat(val).toFixed(1);
            updatePulseBars(id, val); 
        } else if (id.includes('coverage')) {
            el.textContent = parseFloat(val).toLocaleString(); 
        } else {
            formatValue(el, val, false, false);
        }
    });

    // 3. AI Confidence Bar
    if (state.aiConfidence !== undefined) {
        const bar = document.getElementById('ai-confidence-fill');
        if (bar) bar.style.width = `${state.aiConfidence}%`;
    }

    // 4. Sincronización de Inputs (PROTEGIDA)
    if (state.config && !isSavingConfig) { 
        syncInputsFromConfig(state.config); 
    }

    updateControlsState(state);
}

function updatePulseBars(id, value) {
    const barId = id.replace('-val', '-bar');
    const bar = document.getElementById(barId);
    if (!bar) return;
    let percent = id.includes('adx') ? (value / 50) * 100 : (value * 100); 
    bar.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
}

export function updateControlsState(state) {
    if (!state) return;
    
    const lState = state.lstate || 'STOPPED';
    const sState = state.sstate || 'STOPPED';
    const aiState = state.aistate || 'STOPPED';

    const longInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l'];
    const shortInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s'];
    const aiInputs = ['auamountai-usdt', 'ai-amount-usdt'];

    updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    updateButtonState('btn-start-ai', aiState, 'AI', aiInputs); 
    
    // Espejo del botón AI en el Dashboard
    const aiDashBtn = document.getElementById('austartai-btn');
    if (aiDashBtn) updateButtonState('austartai-btn', aiState, 'AI', aiInputs);

    const engineMsg = document.getElementById('ai-engine-msg');
    if (engineMsg) {
        if (aiState === 'RUNNING' || state.config?.ai?.enabled) {
            engineMsg.textContent = state.aiMessage || "NEURAL CORE ANALYZING...";
            engineMsg.classList.add('animate-pulse', 'text-blue-400');
        } else {
            engineMsg.textContent = "AI CORE IN STANDBY";
            engineMsg.classList.remove('animate-pulse', 'text-blue-400');
        }
    }
}