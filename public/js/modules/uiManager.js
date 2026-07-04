/**
 * uiManager.js - Orquestador Atómico (Sincronizado & Blindado 2026)
 * Etapa 1: Protección Total contra parpadeo y reseteo de estados - AUDITADO & INTEGRADO
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
// 🛡️ INTEGRACIÓN: Importamos el validador determinista de datos
import { isSavingConfig, checkConfigAcknowledgment } from './apiService.js';
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

// Lista de IDs de inputs numéricos críticos expuestos al parpadeo por WebSockets
const CRITICAL_INPUTS = [
    'auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l',
    'auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s',
    'auamountai-usdt', 'ai-amount-usdt'
];

/**
 * 🛡️ CAPA DE SANEAMIENTO PREVENTIVO
 * Valida y limpia el valor del input antes de su procesamiento/envío
 */
export function getSanitizedValue(id) {
    const el = document.getElementById(id);
    if (!el) return undefined;
    const val = el.value.trim();
    if (val === "") return undefined;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? undefined : parsed;
}

// Escuchador global pasivo para registrar interacciones del usuario y evitar el snap-back cooperativo
window.addEventListener('input', (e) => {
    if (CRITICAL_INPUTS.includes(e.target.id)) {
        e.target.dataset.lastUserMutation = Date.now();
    }
}, true);

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

        // AI ENGINE (Fallbacks de persistencia estática)
        'ai-virtual-balance': 'aibalance', 
        'aubot-aistate': 'aistate', 
        'ai-trend-label': 'trend',     
        'ai-engine-msg': 'aiMessage',  

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

        // --- Renderizado de Números ---
        if (id.includes('profit')) {
            formatProfit(el, val);
        } else if (id.includes('btc') || id === 'aubalance-btc') {
            const btcVal = parseFloat(val).toFixed(6);
            if (el.textContent !== btcVal) el.textContent = btcVal;
        } else if (id.includes('cycle') || id.includes('norder')) {
            const cycleVal = Math.floor(val).toString();
            if (el.textContent !== cycleVal) el.textContent = cycleVal;
        } else if (id.includes('coverage')) {
            el.textContent = parseFloat(val).toLocaleString(); 
        } else {
            formatValue(el, val, false, false);
        }
    });

    // --- 3. Renderizado defensivo de métricas (Con mapeo cruzado/fallbacks) ---
    const pulseMetrics = [
        { id: 'ai-adx-val', key: 'lai', fallbackKey: 'aiAdx', barId: 'ai-adx-bar' },
        { id: 'ai-stoch-val', key: 'lac', fallbackKey: 'aiStochK', barId: 'ai-stoch-bar' },
        { id: 'ai-rsi-val', key: 'aiRsi', fallbackKey: 'rsi', barId: null },
        { id: 'ai-macd-val', key: 'aiMacd', fallbackKey: 'macd', barId: null }
    ];

    pulseMetrics.forEach(metric => {
        const el = document.getElementById(metric.id);
        if (!el) return;

        const val = state[metric.key] !== undefined ? state[metric.key] : state[metric.fallbackKey]; 

        if (val !== undefined && val !== null) {
            const floatVal = parseFloat(val);
            el.textContent = metric.id.includes('macd') ? floatVal.toFixed(4) : floatVal.toFixed(1);
            
            if (metric.barId) {
                updatePulseBars(metric.id, floatVal);
            }
        }
    });

    // 4. Barras de Confianza AI
    if (state.aiConfidence !== undefined) {
        const bar = document.getElementById('ai-confidence-fill');
        if (bar) bar.style.width = `${Math.min(Math.max(state.aiConfidence, 0), 100)}%`;
    }

    // =========================================================================
    // 5. [BLINDAJE INTERACTIVO DOBLE CAPA] Sincronización Avanzada
    // =========================================================================
    if (state.config) {
        // 🔄 CAPA 1: Procesamos el paquete entrante en el motor determinista de red
        checkConfigAcknowledgment(state.config);

        // Si no hay transacciones de guardado pendientes (o acaban de liberarse), evaluamos la UI
        if (!isSavingConfig) {
            const activeLocks = {};

            // 🛡️ CAPA 2: Escudo de Edición Activa Local (Previene sobreescrituras en caliente)
            CRITICAL_INPUTS.forEach(id => {
                const inputEl = document.getElementById(id);
                if (!inputEl) return;

                const isFocused = inputEl === document.activeElement;
                const lastMutation = parseInt(inputEl.dataset.lastUserMutation || 0);
                const isInsideGracePeriod = (Date.now() - lastMutation) < 2500; // 2.5s inmunidad post-escritura

                if (isFocused || isInsideGracePeriod) {
                    activeLocks[id] = inputEl.value; // Snapshot de la voluntad del usuario
                }
            });

            // Sincronización base del config limpio del WebSocket
            syncInputsFromConfig(state.config);

            // Capa de Restauración Inmediata: Imponemos la edición activa sobre los datos del WS
            Object.entries(activeLocks).forEach(([id, preservedValue]) => {
                const inputEl = document.getElementById(id);
                if (inputEl && inputEl.value !== preservedValue) {
                    inputEl.value = preservedValue;
                }
            });
        } else {
            console.log("🛡️ [WS LOCK]: Bloqueo de consistencia activo. Evitando snap-back por retraso del WebSocket.");
        }
    }

    // 6. Control de Botones
    const hasStateData = state.lstate !== undefined || 
                         state.sstate !== undefined || 
                         state.aistate !== undefined || 
                         state.isRunning !== undefined;

    if (hasStateData) {
        updateControlsState(state);
    }

    // =========================================================================
    // 7. Sincronización del Dashboard y Gráfico Donut de Distribución
    // =========================================================================
    try {
        const dashboard = await import('./dashboard.js');
        if (dashboard) {
            const lProfit = parseFloat(state.lprofit ?? state.stats?.lprofit ?? 0);
            const sProfit = parseFloat(state.sprofit ?? state.stats?.sprofit ?? 0);
            const aiProfit = parseFloat(state.aiprofit ?? state.stats?.aiprofit ?? 0);

            if (typeof dashboard.updatePnLBar === 'function') {
                dashboard.updatePnLBar('long', lProfit);
                dashboard.updatePnLBar('short', sProfit);
                dashboard.updatePnLBar('ai', aiProfit);
            }
            
            if (typeof dashboard.updateDistributionWidget === 'function') {
                dashboard.updateDistributionWidget(state);
            }

            const totalProfit = parseFloat(state.total_profit ?? (lProfit + sProfit + aiProfit));
            const totalEl = document.getElementById('auprofit');
            if (totalEl) formatProfit(totalEl, totalProfit);
        }
    } catch (err) {
        console.error("⚠️ Falló el enlace de actualización cruzada con dashboard.js:", err);
    }

    // Sincronizamos las métricas analíticas intermedias con el nuevo payload
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
    const aiInputs = ['auamountai-usdt', 'ai-amount-usdt']; 

    if (lState !== undefined) {
        updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    }
    
    if (sState !== undefined) {
        updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    }
    
    if (aiState !== undefined || state.isRunning !== undefined) {
        const btnAi = document.getElementById('btn-start-ai') || document.getElementById('austartai-btn');
        const actualAiStatus = aiState || (state.isRunning ? 'RUNNING' : 'STOPPED');

        if (btnAi) {
            updateButtonState(btnAi.id, actualAiStatus, 'AI', aiInputs); 
        }
        
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