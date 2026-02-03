/**
 * uiManager.js - Orquestador Atómico con soporte para Dashboard AI Pulse
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
import { displayMessage } from './ui/notifications.js';
import { isSavingConfig } from './apiService.js';

let lastPrice = 0;

export function updateBotUI(state) {
    if (!state || isSavingConfig) return;
    
    // 1. Precio y Tendencia Visual
    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // 2. Mapping Extendido (Incluyendo Dashboard New IDs)
    const elements = {
        auprofit: 'total_profit', 
        'aubalance-usdt': 'lastAvailableUSDT', 
        'aubalance-btc': 'lastAvailableBTC',
        'ai-virtual-balance': 'aibalance', // Para la pestaña IA
        'ai-adx-val': 'adx',               // Para el Pulse del Dashboard
        'ai-stoch-val': 'stochRsi'         // Para el Pulse del Dashboard
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        let val = state[key] ?? state.stats?.[key] ?? state.config?.ai?.[key] ?? 0;

        // --- Lógica de Formateo Especial ---
        if (id.includes('profit')) {
            formatProfit(el, val);
        } else if (id.includes('btc')) {
            formatValue(el, val, true, false);
        } else if (id.includes('adx') || id.includes('stoch')) {
            el.textContent = parseFloat(val).toFixed(1);
            updatePulseBars(id, val); // Actualiza las barritas del Dashboard
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

    // 4. Sincronización Segura de Config
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

    // Normalización para visualización (ADX suele ser 0-50+, Stoch 0-100)
    let percent = id.includes('adx') ? (value / 50) * 100 : value;
    bar.style.width = `${Math.min(percent, 100)}%`;
}

export function updateControlsState(state) {
    if (!state) return;
    
    const lState = state.lstate || 'STOPPED';
    const sState = state.sstate || 'STOPPED';
    const aiEnabled = state.config?.ai?.enabled || false;
    const aiState = aiEnabled ? 'RUNNING' : 'STOPPED';

    // IDs de inputs a bloquear para la IA
    const aiInputs = ['auamountai-usdt', 'ai-amount-usdt'];

    updateButtonState('austartl-btn', lState, 'LONG', ['auamountl-usdt']);
    updateButtonState('austarts-btn', sState, 'SHORT', ['auamounts-usdt']);
    updateButtonState('btn-start-ai', aiState, 'AI', aiInputs);  // Botón unificado
    
    // Mantenemos sincronizado el texto del motor en el Dashboard
    const engineMsg = document.getElementById('ai-engine-msg');
    if (engineMsg && aiEnabled) {
        engineMsg.textContent = state.aiMessage || "NEURAL CORE ANALYZING...";
    }
}