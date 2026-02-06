// public/js/modules/orders.js

/**
 * orders.js - Gestión y Visualización de Órdenes (Historial de 30 días)
 */
import { BACKEND_URL } from '../main.js';

/**
 * Crea el HTML de una orden (Card)
 * Optimizada para legibilidad rápida y jerarquía de datos
 */
function createOrderHtml(order) {
    const side = (order.side || 'buy').toLowerCase();
    const isBuy = side === 'buy';
    
    const sideTheme = isBuy 
        ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' 
        : 'text-red-400 border-red-500/20 bg-red-500/5';
    
    const icon = isBuy ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
    
    // Mapeo de estados BitMart (Texto o Numérico)
    const rawState = (order.state || order.status || 'UNKNOWN').toString().toUpperCase();
    let stateDisplay = rawState;
    let isFilled = false;

    if (rawState === '1' || rawState.includes('FILLED')) {
        stateDisplay = 'FILLED';
        isFilled = true;
    } else if (rawState === '6' || rawState.includes('CANCELL')) {
        stateDisplay = 'CANCELLED';
    } else if (rawState === '0' || ['NEW', 'PARTIALLY_FILLED', 'OPEN', 'ACTIVE'].includes(rawState)) {
        stateDisplay = 'OPEN';
    }
    
    // Priorizamos updateTime para el historial
    const timestamp = order.updateTime || order.createTime || order.create_time || Date.now();
    
    const date = new Date(Number(timestamp)).toLocaleString('en-GB', { 
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });

    const priceFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const qtyFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });

    const price = priceFormatter.format(parseFloat(order.price || order.filled_price || order.priceAvg || 0));
    const quantity = qtyFormatter.format(parseFloat(order.filled_size || order.size || 0));

    const isCancellable = ['NEW', 'PARTIALLY_FILLED', 'OPEN', 'ACTIVE', 'PENDING', '0'].includes(rawState);
    const fullOrderId = (order.orderId || order.order_id || '').toString();

    return `
    <div class="bg-gray-900/40 border border-gray-800 p-3 rounded-lg mb-2 flex items-center justify-between hover:bg-gray-800/60 transition-all border-l-4 ${isBuy ? 'border-l-emerald-500' : 'border-l-red-500'}">
        <div class="flex items-center gap-4 w-1/4">
            <div class="flex flex-col">
                <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Side</span>
                <div class="${sideTheme} py-0.5 px-2 rounded-md w-fit flex items-center gap-1">
                    <i class="fas ${icon} text-[10px]"></i>
                    <span class="font-black text-xs uppercase">${side}</span>
                </div>
            </div>
        </div>

        <div class="flex-1 grid grid-cols-3 gap-2 border-x border-gray-700/30 px-4">
            <div class="flex flex-col">
                <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider text-center md:text-left">Price</span>
                <span class="text-gray-100 font-mono font-semibold text-sm text-center md:text-left">$${price}</span>
            </div>
            <div class="flex flex-col border-x border-gray-700/10 px-2">
                <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider text-center">Amount</span>
                <span class="text-gray-300 font-mono text-sm text-center">${quantity}</span>
            </div>
            <div class="flex flex-col items-center">
                <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Status</span>
                <span class="px-2 py-0.5 rounded text-[9px] font-bold ${isFilled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}">
                    ${stateDisplay}
                </span>
            </div>
        </div>

        <div class="w-1/4 flex flex-col items-end gap-1">
            <p class="text-[10px] text-gray-400 font-medium">${date}</p>
            ${isCancellable ? `
                <button onclick="cancelOrder('${fullOrderId}')" 
                        class="mt-1 px-3 py-1 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white text-[9px] font-bold uppercase rounded transition-all border border-red-500/20">
                    Cancel
                </button>
            ` : `
                <p class="text-[9px] text-gray-600 font-mono">ID: ${fullOrderId}</p>
            `}
        </div>
    </div>
    `;
}

export function displayOrders(orders, orderListElement, filterType) {
    if (!orderListElement) return;

    let filteredOrders = orders;

    // Lógica de filtrado cliente
    if (filterType === 'filled') {
        filteredOrders = orders.filter(o => {
            const s = (o.state || o.status || '').toString().toLowerCase();
            return s.includes('filled') || s === '1';
        });
    } else if (filterType === 'cancelled') {
        filteredOrders = orders.filter(o => {
            const s = (o.state || o.status || '').toString().toLowerCase();
            return s.includes('cancel') || s === '6';
        });
    } else if (filterType === 'opened') {
        const openStatuses = ['new', 'partially_filled', 'open', 'active', 'pending', '0'];
        filteredOrders = orders.filter(o => openStatuses.includes((o.state || o.status || '').toString().toLowerCase()));
    }

    if (filteredOrders.length === 0) {
        orderListElement.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-600">
                <i class="fas fa-folder-open text-2xl mb-2 opacity-20"></i>
                <p class="text-[10px] uppercase tracking-widest font-bold">No orders found in ${filterType}</p>
            </div>`;
        return;
    }

    // Ordenar por tiempo descendente (más recientes primero)
    filteredOrders.sort((a, b) => {
        const timeA = a.updateTime || a.createTime || 0;
        const timeB = b.updateTime || b.createTime || 0;
        return timeB - timeA;
    });

    orderListElement.innerHTML = filteredOrders.map(order => createOrderHtml(order)).join('');
}

export async function fetchOrders(status, orderListElement) {
    if (!orderListElement) return;

    orderListElement.innerHTML = `<div class="py-20 text-center"><i class="fas fa-circle-notch fa-spin text-emerald-500 text-xl"></i></div>`;

    try {
        const endpoint = (status === 'all') ? 'all' : status; 
        
        // CORRECCIÓN: Solicitamos 30 días exactos al servidor
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        
        const url = new URL(`${BACKEND_URL}/api/orders/${endpoint}`);
        url.searchParams.append('startTime', thirtyDaysAgo); 

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) {
            console.warn(`⚠️ Error en endpoint ${endpoint}, intentando fallback...`);
            return fetchOrdersFallback('filled', orderListElement, status);
        }

        const data = await response.json();
        // Normalización de estructura de datos (v4 devuelve list)
        const orders = Array.isArray(data) ? data : (data.orders || data.list || data.data?.list || []);
        displayOrders(orders, orderListElement, status);

    } catch (error) {
        console.error("Fetch error:", error);
        orderListElement.innerHTML = `<div class="text-center py-10 text-red-500 text-xs font-bold uppercase">Error al cargar historial</div>`;
    }
}

async function fetchOrdersFallback(fallbackEndpoint, orderListElement, originalStatus) {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const url = `${BACKEND_URL}/api/orders/${fallbackEndpoint}?startTime=${thirtyDaysAgo}`;
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        const orders = Array.isArray(data) ? data : (data.orders || data.list || []);
        displayOrders(orders, orderListElement, originalStatus);
    } catch (e) {
        orderListElement.innerHTML = `<div class="text-center py-10 text-gray-500 text-xs font-bold uppercase">No se pudo recuperar historial</div>`;
    }
}