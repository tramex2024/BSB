/**
 * uiManager.js - Orquestador Atómico (Sincronizado 2026)
 * Ajuste: Protección contra parpadeo por mensajes incompletos.
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

/**
 * Función Principal: Actualiza todos los elementos visuales
 */
export function updateBotUI(state) {
    if (!state) return;
    
    // 1. Actualización de Precio
    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // 2. MAPEO MAESTRO: Vincular ID del DOM con Propiedad del Estado Global
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
        'lnorder-val': 'lnorder',     

        // ESTRATEGIA SHORT
        'ausprofit-val': 'sprofit',   
        'ausbalance': 'sbalance',     
        'auscycle': 'scycle',         
        'ausbprice': 'spc',           
        'austprice': 'stprice',       
        'austppc': 'sppc',           
        'auscoverage': 'scoverage',   
        'snorder-val': 'snorder',

        // AI ENGINE
        'ai-virtual-balance': 'aibalance', 
        'ai-adx-val': 'lai',                
        'ai-stoch-val': 'lac',              
        'aubot-aistate': 'aistate', 

        // ESTADOS DE TEXTO
        'aubot-lstate': 'lstate',
        'aubot-sstate': 'sstate',
        'ai-mode-status': 'aistate' 
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        // Buscamos el valor en el estado o en el sub-objeto stats
        let val = state[key] ?? state.stats?.[key];

        // IMPORTANTE: Si el valor es undefined, no hacemos nada (evita parpadeo)
        if (val === undefined) return;

        // --- Renderizado de Estados (Colores y Texto) ---
        if (id.includes('state') || id.includes('status')) {
            const currentStatus = (val || 'STOPPED').toString().toUpperCase().trim();
            el.textContent = currentStatus;
            el.style.color = STATUS_COLORS[currentStatus] || '#9ca3af'; 
            return;
        }

        // --- Renderizado de Números y Datos ---
        if (id.includes('profit')) {
            formatProfit(el, val);
        } else if (id.includes('btc') || id === 'aubalance-btc') {
            el.textContent = parseFloat(val).toFixed(6);
        } else if (id.includes('cycle') || id.includes('norder')) {
            el.textContent = Math.floor(val); 
        } else if (id.includes('adx') || id.includes('stoch')) {
            el.textContent = parseFloat(val).toFixed(1);
            updatePulseBars(id, val); 
        } else if (id.includes('coverage')) {
            el.textContent = parseFloat(val).toLocaleString(); 
        } else {
            formatValue(el, val, false, false);
        }
    });

    // 3. Barras de Confianza AI
    if (state.aiConfidence !== undefined) {
        const bar = document.getElementById('ai-confidence-fill');
        if (bar) bar.style.width = `${state.aiConfidence}%`;
    }

    // 4. Sincronización de Inputs (Solo si hay una configuración válida en el mensaje)
    if (state.config && !isSavingConfig) { 
        syncInputsFromConfig(state.config); 
    }

    // 5. Solo actualizamos controles si el mensaje contiene información de estados
    if (state.lstate || state.sstate || state.aistate || state.isRunning !== undefined) {
        updateControlsState(state);
    }
}

/**
 * Actualiza las barras de progreso visual de los indicadores
 */
function updatePulseBars(id, value) {
    const barId = id.replace('-val', '-bar');
    const bar = document.getElementById(barId);
    if (!bar) return;
    let percent = id.includes('adx') ? (value / 50) * 100 : value; 
    bar.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
}

/**
 * Gestiona el estado de los botones
 */
export function updateControlsState(state) {
    if (!state) return;
    
    // Solo actuamos si el estado específico viene en el objeto, de lo contrario mantenemos el actual
    const lState = state.lstate;
    const sState = state.sstate;
    const aiState = state.aistate;

    // IDs de los inputs que se bloquean cuando el bot está encendido
    const longInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l'];
    
    // CORRECCIÓN: Asegúrate de que estos IDs tengan la "s" al final para el Short
    const shortInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s'];
    
    const aiInputs = ['auamountai-usdt', 'ai-amount-usdt'];

    // Si el estado viene en el mensaje, actualizamos el botón correspondiente
    if (lState) updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    if (sState) updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    
    // Para AI, verificamos tanto aistate como la bandera isRunning
    if (aiState || state.isRunning !== undefined) {
        const actualAiStatus = aiState || (state.isRunning ? 'RUNNING' : 'STOPPED');
        updateButtonState('btn-start-ai', actualAiStatus, 'AI', aiInputs); 
        updateButtonState('austartai-btn', actualAiStatus, 'AI', aiInputs); 
    }
    
    // Mensajería del motor AI
    const engineMsg = document.getElementById('ai-engine-msg');
    if (engineMsg && (aiState || state.isRunning !== undefined)) {
        if (aiState === 'RUNNING' || state.isRunning) {
            engineMsg.textContent = state.aiMessage || "NEURAL CORE ANALYZING...";
            engineMsg.classList.add('animate-pulse', 'text-blue-400');
        } else {
            engineMsg.textContent = "AI CORE IN STANDBY";
            engineMsg.classList.remove('animate-pulse', 'text-blue-400');
        }
    }
}