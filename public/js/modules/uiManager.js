// public/js/modules/uiManager.js

/**
 * uiManager.js - Orquestador Atómico con Memoria Selectiva
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
import { isSavingConfig } from './apiService.js';

export { displayMessage } from './ui/notifications.js';

let lastPrice = 0;
// Memoria para evitar parpadeo en valores financieros estables
const lastValues = {};

const STATUS_COLORS = {
    'RUNNING': '#10b981',      
    'STOPPED': '#ef4444',      
    'BUYING': '#60a5fa',        
    'SELLING': '#fbbf24',      
    'PAUSED': '#fb923c',      
};

export function updateBotUI(state) {
    if (!state) return;
    
    // 1. Precio de Mercado (Persistencia constante: NO se monitorea)
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

        // --- LÓGICA DE MONITOREO SELECTIVO ---
        // Solo aplicamos a Profit y Balance para evitar parpadeo innecesario
        if (id.includes('profit') || id.includes('balance')) {
            if (lastValues[id] === val) return; // Si el valor no ha cambiado, saltamos el render
            lastValues[id] = val; // Actualizamos memoria
        }
        // -------------------------------------

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

    // 4. Sincronización de Inputs (PROTEGIDA durante el guardado)
    if (state.config && !isSavingConfig) { 
        syncInputsFromConfig(state.config); 
    }

    updateControlsState(state);
}

// ... (Resto de funciones: updatePulseBars, updateControlsState y renderAutobotOpenOrders permanecen igual)

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

export function renderAutobotOpenOrders(orders) {
    const container = document.getElementById('au-order-list');
    if (!container) return;

    const ordersList = Array.isArray(orders) ? orders : [];

    if (ordersList.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-[10px] italic text-center py-5 tracking-widest uppercase">No hay órdenes activas</p>`;
        return;
    }

    container.innerHTML = ordersList.map(order => {
        const side = (order.side || 'BUY').toUpperCase();
        const isBuy = side === 'BUY';
        
        const rawPrice = parseFloat(order.price || 0);
        const rawAmount = parseFloat(order.size || order.amount || 0);
        const price = rawPrice.toLocaleString();
        const amount = rawAmount;
        const total = order.notional ? parseFloat(order.notional).toFixed(2) : (rawPrice * rawAmount).toFixed(2);
        
        return `
            <div class="bg-gray-900/40 border-l-2 ${isBuy ? 'border-emerald-500' : 'border-rose-500'} p-2 rounded-r-lg flex justify-between items-center group hover:bg-gray-700/30 transition-all">
                <div class="flex flex-col">
                    <div class="flex items-center gap-2">
                        <span class="${isBuy ? 'text-emerald-400' : 'text-rose-400'} font-bold text-[11px]">${side}</span>
                        <span class="text-white font-mono text-[11px]">$${price}</span>
                    </div>
                    <span class="text-[8px] text-gray-500 tracking-tighter">${order.symbol || 'BTC_USDT'} | ID: ${order.orderId?.toString().slice(-6)}</span>
                </div>
                <div class="text-right flex items-center gap-3">
                    <div class="flex flex-col font-mono">
                        <span class="text-gray-300 text-[10px]">${amount} BTC</span>
                        <span class="text-[8px] text-gray-500">$${total} USDT</span>
                    </div>
                    <button onclick="cancelOrder('${order.orderId}')" class="text-gray-600 hover:text-rose-500 transition-colors px-1">
                        <i class="fas fa-times-circle text-[12px]"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}