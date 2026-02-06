// public/js/modules/uiManager.js

/**
 * uiManager.js - Orquestador Atómico
 * Ajuste: Dirección a contenedores específicos para evitar parpadeo.
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
    
    // 1. Precio de Mercado
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
        'aulprofit-val': 'lprofit',   
        'aulbalance': 'lbalance',     
        'aulcycle': 'lcycle',         
        'aulsprice': 'lpc',            
        'aultprice': 'ltprice',       
        'aultppc': 'lppc',            
        'aulcoverage': 'lcoverage',   
        'aulnorder': 'lnorder',      
        'ausprofit-val': 'sprofit',   
        'ausbalance': 'sbalance',     
        'auscycle': 'scycle',         
        'ausbprice': 'spc',            
        'austprice': 'stprice',       
        'austppc': 'sppc',            
        'auscoverage': 'scoverage',   
        'ausnorder': 'snorder',
        'ai-virtual-balance': 'aibalance', 
        'ai-adx-val': 'lai',                
        'ai-stoch-val': 'lac',              
        'aubot-aistate': 'aistate', 
        'aubot-lstate': 'lstate',
        'aubot-sstate': 'sstate',
        'ai-mode-status': 'aistate' 
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        let val = state[key] ?? state.stats?.[key] ?? 0;

        if (id.includes('state') || id.includes('status')) {
            const currentStatus = (val || 'STOPPED').toString().toUpperCase().trim();
            el.textContent = currentStatus;
            el.style.color = STATUS_COLORS[currentStatus] || '#9ca3af'; 
            el.className = "font-bold font-mono uppercase";
            return;
        }

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
    
    const aiDashBtn = document.getElementById('austartai-btn');
    if (aiDashBtn) updateButtonState('austartai-btn', aiState, 'AI', aiInputs);
}

/**
 * Renderiza las órdenes ACTIVAS en el contenedor dedicado
 * Cambio clave: ID au-active-orders-list para evitar sobreescritura
 */
export function renderAutobotOpenOrders(orders) {
    const container = document.getElementById('au-active-orders-list');
    if (!container) return;

    const ordersList = Array.isArray(orders) ? orders : [];

    if (ordersList.length === 0) {
        container.innerHTML = `<p class="text-gray-600 text-[9px] italic ml-4 uppercase tracking-tighter">No active orders</p>`;
        return;
    }

    container.innerHTML = ordersList.map(order => {
        const side = (order.side || 'BUY').toUpperCase();
        const isBuy = side === 'BUY';
        const rawPrice = parseFloat(order.price || 0);
        const rawAmount = parseFloat(order.size || order.amount || 0);
        const total = order.notional ? parseFloat(order.notional).toFixed(2) : (rawPrice * rawAmount).toFixed(2);
        
        return `
            <div class="bg-gray-900/60 border-l-2 ${isBuy ? 'border-emerald-500' : 'border-rose-500'} p-2 rounded-r-lg flex justify-between items-center group hover:bg-gray-700/30 transition-all">
                <div class="flex flex-col">
                    <div class="flex items-center gap-2">
                        <span class="${isBuy ? 'text-emerald-400' : 'text-rose-400'} font-bold text-[10px]">${side}</span>
                        <span class="text-white font-mono text-[10px]">$${rawPrice.toLocaleString()}</span>
                    </div>
                    <span class="text-[7px] text-gray-500 uppercase">ID: ${order.orderId?.toString().slice(-6)}</span>
                </div>
                <div class="text-right flex items-center gap-3">
                    <div class="flex flex-col font-mono leading-tight">
                        <span class="text-gray-300 text-[9px]">${rawAmount} BTC</span>
                        <span class="text-[7px] text-gray-500">$${total}</span>
                    </div>
                    <button onclick="cancelOrder('${order.orderId}')" class="text-gray-600 hover:text-rose-500 transition-colors">
                        <i class="fas fa-times-circle text-[11px]"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}