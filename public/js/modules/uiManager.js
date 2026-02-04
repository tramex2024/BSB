/**
 * uiManager.js - Orquestador Atómico (Sincronizado con BD JSON 2026)
 * Ajuste: Se añadió 'aistate' y se corrigieron punteros de AI Engine.
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
    if (!state || isSavingConfig) return;
    
    // 1. Precio de Mercado
    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // MAPEO MAESTRO (Sincronizado con los nombres de tu base de datos)
    const elements = {
        'auprofit': 'total_profit', 
        'aubalance-usdt': 'lastAvailableUSDT', 
        'aubalance-btc': 'lastAvailableBTC',

        // AUTOBOT: LONG
        'aulprofit-val': 'lprofit',   
        'aulbalance': 'lbalance',     
        'aulcycle': 'lcycle',         
        'aulsprice': 'lpc',           
        'aultprice': 'ltprice',       
        'aultppc': 'lppc',            
        'aulcoverage': 'lcoverage',   
        'aulnorder': 'lnorder', // Corregido: en tu JSON es 'lnorder', no 'aulnorder'     

        // AUTOBOT: SHORT
        'ausprofit-val': 'sprofit',   
        'ausbalance': 'sbalance',     
        'auscycle': 'scycle',         
        'ausbprice': 'spc',           
        'austprice': 'stprice',       
        'austppc': 'sppc',            
        'auscoverage': 'scoverage',   
        'ausnorder': 'snorder', // Corregido: en tu JSON es 'snorder', no 'ausnorder'

        // AI ENGINE (Sincronizado con los campos específicos de tu JSON)
        'ai-virtual-balance': 'aibalance', 
        'ai-adx-val': 'lai',               
        'ai-stoch-val': 'lac',             
        'aubot-aistate': 'aistate', // <-- CORREGIDO: Ahora usa el campo real de la BD

        // ESTADOS DE INTERFAZ
        'aubot-lstate': 'lstate',
        'aubot-sstate': 'sstate',
        'ai-mode-status': 'aistate' // <-- CORREGIDO: Refleja el estado real de la IA
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
        } else if (id.includes('btc') || id === 'aubalance-btc') {
            // Formato para 6-8 decimales en BTC
            el.textContent = parseFloat(val).toFixed(6);
        } else if (id.includes('cycle') || id.includes('norder')) {
            el.textContent = Math.floor(val); 
        } else if (id.includes('adx') || id.includes('stoch')) {
            // Si el valor es pequeño (como lac: 0.002) mostramos más decimales
            el.textContent = val < 1 ? parseFloat(val).toFixed(4) : parseFloat(val).toFixed(1);
            updatePulseBars(id, val); 
        } else if (id.includes('coverage')) {
            el.textContent = parseFloat(val).toLocaleString(); // Para ver 76,464 completo
        } else {
            formatValue(el, val, false, false);
        }
    });

    // 3. Sincronización de Barras de Confianza (AI)
    if (state.aiConfidence !== undefined) {
        const bar = document.getElementById('ai-confidence-fill');
        if (bar) bar.style.width = `${state.aiConfidence}%`;
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
    // Ajuste de escala para la barra visual
    let percent = id.includes('adx') ? (value / 50) * 100 : (value * 100); 
    bar.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
}

export function updateControlsState(state) {
    if (!state) return;
    
    const lState = state.lstate || 'STOPPED';
    const sState = state.sstate || 'STOPPED';
    const aiState = state.aistate || 'STOPPED'; // <-- CORREGIDO: Usa aistate de la BD

    const longInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l'];
    const shortInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s'];
    const aiInputs = ['auamountai-usdt', 'ai-amount-usdt'];

    updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    updateButtonState('btn-start-ai', aiState, 'AI', aiInputs); 
    
    const engineMsg = document.getElementById('ai-engine-msg');
    if (engineMsg && state.config?.ai?.enabled) {
        engineMsg.textContent = state.aiMessage || "NEURAL CORE ANALYZING...";
    }
}