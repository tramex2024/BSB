/**
 * uiManager.js - Orquestador Atómico
 * Sincronización total de Dashboard, Autobot y AI Pulse
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
import { isSavingConfig } from './apiService.js';

export { displayMessage } from './ui/notifications.js';

let lastPrice = 0;

export function updateBotUI(state) {
    if (!state || isSavingConfig) return;
    
    // 1. Precio de Mercado
    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // MAPEO MAESTRO: Respetando la naturaleza de cada variable
    const elements = {
        // === MARKET & GLOBALES ===
        'auprofit': 'total_profit', 
        'aubalance-usdt': 'lastAvailableUSDT', 
        'aubalance-btc': 'lastAvailableBTC',

        // === AUTOBOT: ESTRATEGIA LONG ===
        'aulprofit-val': 'lprofit',   
        'aulbalance': 'lbalance',     
        'aulcycle': 'lcycle',         
        'aulsprice': 'llep',          
        'aultprice': 'ltprice',       
        'aultppc': 'lppc',            
        'aulcoverage': 'lcoverage',   // Distancia de cobertura (Precio/Variación)
        'aulnorder': 'aulnorder',     // L-MaxSO: Máximo de órdenes configuradas

        // === AUTOBOT: ESTRATEGIA SHORT ===
        'ausprofit-val': 'sprofit',   
        'ausbalance': 'sbalance',     
        'auscycle': 'scycle',         
        'ausbprice': 'slep',          
        'austprice': 'stprice',       
        'austppc': 'sppc',            
        'auscoverage': 'scoverage',   // Distancia de cobertura (Precio/Variación)
        'ausnorder': 'ausnorder',     // S-MaxSO: Máximo de órdenes configuradas

        // === AI ENGINE (Pestaña Neural) ===
        'ai-virtual-balance': 'aibalance', 
        'ai-adx-val': 'lai',               
        'ai-stoch-val': 'lac',             
        'aubot-aistate': 'lstate',         

        // === ESTADOS ===
        'aubot-lstate': 'lstate',
        'aubot-sstate': 'sstate',
        'ai-mode-status': 'lstate'         
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        let val = state[key] ?? state.stats?.[key] ?? 0;

        // --- Lógica de Renderizado Atómica ---
        if (id.includes('profit')) {
            formatProfit(el, val);
        } else if (id.includes('btc')) {
            formatValue(el, val, true, false);
        } else if (id.includes('cycle') || id.includes('norder')) {
            // Ciclos y MaxSO (Órdenes) siempre son enteros
            el.textContent = Math.floor(val); 
        } else if (id.includes('adx') || id.includes('stoch')) {
            el.textContent = parseFloat(val).toFixed(1);
            updatePulseBars(id, val); 
        } else if (id.includes('coverage')) {
            // Cobertura se mantiene con su formato original (usualmente precio o %)
            el.textContent = formatValue(el, val, false, true); 
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
            aubotAiState.textContent = isAiActive ? 'ACTIVE' : 'STOPPED';
            aubotAiState.className = `text-[9px] font-bold font-mono uppercase ${isAiActive ? 'text-purple-400' : 'text-red-400'}`;
        }
    }

    // 4. Sincronización de Inputs (Configuración)
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