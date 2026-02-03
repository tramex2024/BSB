/**
 * uiManager.js - Orquestador Atómico con soporte para Dashboard AI Pulse
 * Restaurado con lógica de bloqueo de controles completa.
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
import { isSavingConfig } from './apiService.js';

// 🛡️ Re-export para que otros módulos (como apiService) tengan acceso
export { displayMessage } from './ui/notifications.js';

let lastPrice = 0;

export function updateBotUI(state) {
    if (!state || isSavingConfig) return;
    
    // 1. Precio y Tendencia Visual
    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // 2. Mapping Extendido (Dashboard + Tabs)
    const elements = {
        auprofit: 'total_profit', 
        'aubalance-usdt': 'lastAvailableUSDT', 
        'aubalance-btc': 'lastAvailableBTC',
        'ai-virtual-balance': 'aibalance', 
        'ai-adx-val': 'adx',               
        'ai-stoch-val': 'stochRsi'         
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        let val = state[key] ?? state.stats?.[key] ?? state.config?.ai?.[key] ?? 0;

        if (id.includes('profit')) {
            formatProfit(el, val);
        } else if (id.includes('btc')) {
            formatValue(el, val, true, false);
        } else if (id.includes('adx') || id.includes('stoch')) {
            el.textContent = parseFloat(val).toFixed(1);
            updatePulseBars(id, val); 
        } else {
            formatValue(el, val, false, false);
        }
    });

    // 3. Sincronización de Barras de Confianza (Dashboard)
    if (state.aiConfidence !== undefined) {
        const bar = document.getElementById('ai-confidence-fill');
        if (bar) bar.style.width = `${state.aiConfidence}%`;
        
        const aubotAiState = document.getElementById('aubot-aistate');
        if (aubotAiState) {
            aubotAiState.textContent = state.config?.ai?.enabled ? 'ACTIVE' : 'STOPPED';
            aubotAiState.className = `text-[9px] font-bold font-mono uppercase ${state.config?.ai?.enabled ? 'text-purple-400' : 'text-red-400'}`;
        }
    }

    // 4. Sincronización Segura de Config (Solo si hay datos válidos)
    if (state.config?.long && Object.keys(state.config.long).length > 2) { 
        syncInputsFromConfig(state.config); 
    }

    updateControlsState(state);
}

/**
 * Actualiza las barras de progreso ADX/Stoch del Dashboard
 */
function updatePulseBars(id, value) {
    const barId = id.replace('-val', '-bar');
    const bar = document.getElementById(barId);
    if (!bar) return;

    let percent = id.includes('adx') ? (value / 50) * 100 : value;
    bar.style.width = `${Math.min(percent, 100)}%`;
}

/**
 * Gestiona el estado de bloqueo de botones e inputs
 */
export function updateControlsState(state) {
    if (!state) return;
    
    const lState = state.lstate || 'STOPPED';
    const sState = state.sstate || 'STOPPED';
    const aiEnabled = state.config?.ai?.enabled || false;
    const aiState = aiEnabled ? 'RUNNING' : 'STOPPED';

    // 🛡️ BLOQUEO INTEGRAL: Todos los parámetros de la estrategia
    const longInputs = [
        'auamountl-usdt', 
        'aupurchasel-usdt', 
        'auincrementl', 
        'audecrementl', 
        'autriggerl', 
        'aupricestep-l'
    ];

    const shortInputs = [
        'auamounts-usdt', 
        'aupurchases-usdt', 
        'auincrements', 
        'audecrements', 
        'autriggers', 
        'aupricestep-s'
    ];

    const aiInputs = ['auamountai-usdt', 'ai-amount-usdt'];

    // Sincronización de botones y bloqueo de inputs correspondientes
    updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    
    // Botones Espejo de la IA
    updateButtonState('austartai-btn', aiState, 'AI', aiInputs); 
    updateButtonState('btn-start-ai', aiState, 'AI', aiInputs);
    
    // Mensaje del motor IA
    const engineMsg = document.getElementById('ai-engine-msg');
    if (engineMsg && aiEnabled) {
        engineMsg.textContent = state.aiMessage || "NEURAL CORE ANALYZING...";
    }
}