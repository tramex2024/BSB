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

  // MAPEO MAESTRO: Coincidencia exacta con tus 3 archivos HTML
    const elements = {
        // === MARKET & GLOBALES (Se repiten en Dashboard y Autobot) ===
        'auprice': 'price',
        'auprofit': 'total_profit', 
        'aubalance-usdt': 'lastAvailableUSDT', 
        'aubalance-btc': 'lastAvailableBTC',

        // === AUTOBOT: ESTRATEGIA LONG ===
        'aulprofit-val': 'lprofit',   // L-PNL
        'aulbalance': 'lbalance',     // L-Wallet
        'aulcycle': 'lcycle',         // L-Cycle
        'aulsprice': 'llep',          // L-Stop
        'aultprice': 'ltprice',       // L-Target
        'aultppc': 'lppc',            // L-AvgPx
        'aulcoverage': 'lcoverage',   // L-Cover
        'aulnorder': 'locc',          // L-MaxSO

        // === AUTOBOT: ESTRATEGIA SHORT ===
        'ausprofit-val': 'sprofit',   // S-PNL
        'ausbalance': 'sbalance',     // S-Wallet
        'auscycle': 'scycle',         // S-Cycle
        'ausbprice': 'slep',          // S-Stop
        'austprice': 'stprice',       // S-Target
        'austppc': 'sppc',            // S-AvgPx
        'auscoverage': 'scoverage',   // S-Cover
        'ausnorder': 'socc',          // S-MaxSO

        // === AI ENGINE (Pestaña Neural) ===
        'ai-virtual-balance': 'aibalance', // Saldo Actual en IA
        'ai-adx-val': 'lai',               // Usando lai/sai según corresponda
        'ai-stoch-val': 'lac',             // O el indicador que manejes
        'aubot-aistate': 'lstate',         // Estado del motor IA (usando lstate como proxy)

        // === ESTADOS (Textos de estado) ===
        'aubot-lstate': 'lstate',
        'aubot-sstate': 'sstate',
        'ai-mode-status': 'lstate'         // Reutiliza el estado para el modo
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        // Buscamos el valor en la raíz o en stats
        let val = state[key] ?? state.stats?.[key] ?? 0;

        // --- Lógica de Renderizado ---
        if (id.includes('profit')) {
            formatProfit(el, val);
        } else if (id.includes('btc')) {
            formatValue(el, val, true, false);
        } else if (id.includes('cycle') || id.includes('maxsos')) {
            el.textContent = Math.floor(val); // Ciclos y órdenes son enteros
        } else if (id.includes('adx') || id.includes('stoch')) {
            el.textContent = parseFloat(val).toFixed(1);
            updatePulseBars(id, val); 
        } else {
            // Precios y Balances
            formatValue(el, val, false, false);
        }
    });

    // 3. Sincronización de Barras de Confianza
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
    if (state.config?.long) { 
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