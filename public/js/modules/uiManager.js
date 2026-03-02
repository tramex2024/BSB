/**
 * uiManager.js - Orquestador Atómico (Sincronizado 2026)
 * Etapa 1: Protección Total contra parpadeo y reseteo de estados.
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
    
    // 1. Actualización de Precio (Con suavizado)
    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // 2. MAPEO MAESTRO (Sincronizado con IDs de HTML)
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
        'ai-trend-label': 'trend',     // El badge que dice NEUTRAL/BULLISH
        'ai-engine-msg': 'aiMessage',  // El mensaje de "Neural Core Analyzing..."

        // ESTADOS DE TEXTO
        'aubot-lstate': 'lstate',
        'aubot-sstate': 'sstate',
        'ai-mode-status': 'aistate' 
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        // Buscamos el valor en el nivel raíz o dentro de .stats
        let val = state[key] !== undefined ? state[key] : (state.stats ? state.stats[key] : undefined);

        // BLOQUE DE PROTECCIÓN: Si el valor es undefined, no tocamos el DOM.
        // Esto evita que los "15 ciclos" desaparezcan si el socket envía un mensaje parcial.
        if (val === undefined || val === null) return;

       // --- Renderizado de Estados (Dirty Checking) ---
        if (id.includes('state') || id.includes('status')) {
            const currentStatus = val.toString().toUpperCase().trim();
            if (el.textContent !== currentStatus) {
                el.textContent = currentStatus;
                
                // Si es el bot de AI, usamos índigo, si no, usamos el mapa normal
                if (id.includes('aistate')) {
                    el.style.color = currentStatus === 'RUNNING' ? '#818cf8' : '#ef4444';
                } else {
                    el.style.color = STATUS_COLORS[currentStatus] || '#9ca3af'; 
                }
            }
            return;
        }

        // --- Renderizado de Números ---
        if (id.includes('profit')) {
            formatProfit(el, val);
        } else if (id.includes('btc') || id === 'aubalance-btc') {
            const btcVal = parseFloat(val).toFixed(6);
            if (el.textContent !== btcVal) el.textContent = btcVal;
        } else if (id.includes('cycle') || id.includes('norder')) {
            const cycleVal = Math.floor(val).toString();
            // Evitamos parpadeo: Solo actualizamos si el número cambió
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

    // 3. Barras de Confianza AI
    if (state.aiConfidence !== undefined) {
        const bar = document.getElementById('ai-confidence-fill');
        if (bar) bar.style.width = `${state.aiConfidence}%`;
    }

    // 4. Sincronización de Inputs (Solo si no estamos guardando)
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

    // 6. Actualización de Barras de PnL (Integración con Dashboard)
    // Usamos un bloque try/catch y carga dinámica para evitar errores si el Dashboard no está listo
    try {
        const dashboard = await import('./dashboard.js');
        if (dashboard && typeof dashboard.updatePnLBar === 'function') {
            if (state.lprofit !== undefined) dashboard.updatePnLBar('long', state.lprofit);
            if (state.sprofit !== undefined) dashboard.updatePnLBar('short', state.sprofit);
            if (state.aiprofit !== undefined) dashboard.updatePnLBar('ai', state.aiprofit);
        }
    } catch (err) {
        // Silenciamos el error si dashboard.js aún no carga, es normal al inicio
    }
} 

function updatePulseBars(id, value) {
    const barId = id.replace('-val', '-bar');
    const bar = document.getElementById(barId);
    if (!bar) return;
    let percent = id.includes('adx') ? (value / 50) * 100 : value; 
    bar.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
}

/**
 * Gestiona el estado de los botones (ETAPA 1: PROTECCIÓN DE RESETEO)
 */
export function updateControlsState(state) {
    if (!state) return;
    
    // Capturamos estados. Si no vienen en este mensaje, NO los declaramos como undefined para evitar el flash
    const lState = state.lstate;
    const sState = state.sstate;
    const aiState = state.aistate;

    const longInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l'];
    const shortInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s'];
    const aiInputs = ['auamountai-usdt', 'ai-amount-usdt'];

    // Solo llamamos a updateButtonState si el dato específico está presente
    // Esto evita que el botón vuelva a su estado original del HTML por falta de datos
    if (lState !== undefined) {
        updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    }
    
    if (sState !== undefined) {
        updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    }
    
    if (aiState !== undefined || state.isRunning !== undefined) {
        const actualAiStatus = aiState || (state.isRunning ? 'RUNNING' : 'STOPPED');
        updateButtonState('btn-start-ai', actualAiStatus, 'AI', aiInputs); 
        updateButtonState('austartai-btn', actualAiStatus, 'AI', aiInputs); 
        
        // Mensajería del motor AI blindada
        const engineMsg = document.getElementById('ai-engine-msg');
        if (engineMsg) {
            if (actualAiStatus === 'RUNNING') {
                engineMsg.textContent = state.aiMessage || "NEURAL CORE ANALYZING...";
                engineMsg.classList.add('animate-pulse', 'text-blue-400');
            } else {
                engineMsg.textContent = "AI CORE IN STANDBY";
                engineMsg.classList.remove('animate-pulse', 'text-blue-400');
            }
        }
    }
}