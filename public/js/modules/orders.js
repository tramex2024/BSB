// public/js/modules/orders.js

import { BACKEND_URL } from '../main.js';

/**
 * Función global para cancelar órdenes (necesaria para el onclick en módulos)
 */
window.cancelOrder = async (orderId) => {
    if (!confirm('¿Confirmar cancelación de la orden?')) return;
    try {
        const response = await fetch(`${BACKEND_URL}/api/orders/cancel/${orderId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (response.ok) {
            alert('Orden enviada a cancelar');
        } else {
            const err = await response.json();
            alert(`Error: ${err.message || 'No se pudo cancelar'}`);
        }
    } catch (error) {
        console.error("Cancel error:", error);
    }
};

/**
 * Crea el HTML de una orden (Card)
 */
function createOrderHtml(order) {
    const side = (order.side || 'buy').toLowerCase();
    const isBuy = side === 'buy';
    const sideTheme = isBuy 
        ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' 
        : 'text-red-400 border-red-500/20 bg-red-500/5';
    
    const icon = isBuy ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
    const state = (order.state || order.status || 'UNKNOWN').toUpperCase();
    const isFilled = state.includes('FILLED');
    const isCancellable = ['NEW', 'PARTIALLY_FILLED', 'OPEN', 'ACTIVE', 'PENDING'].includes(state);
    const timestamp = order.createTime || order.create_time || Date.now();
    
    const date = new Date(Number(timestamp)).toLocaleString('en-GB', { 
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });

    const price = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseFloat(order.price || order.filled_price || 0));
    const quantity = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(parseFloat(order.filled_size || order.size || 0));

    return `
        <div class="bg-gray-900/40 border border-gray-800 p-3 rounded-lg mb-2 flex items-center justify-between hover:bg-gray-800/60 transition-all border-l-4 ${isBuy ? 'border-l-emerald-500' : 'border-l-red-500'}">
            
            <div class="flex items-center gap-4 w-1/4">
                <div class="flex flex-col text-left">
                    <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Side</span>
                    <div class="${sideTheme} py-0.5 px-2 rounded-md w-fit flex items-center gap-1">
                        <i class="fas ${icon} text-[10px]"></i>
                        <span class="font-black text-xs uppercase">${side}</span>
                    </div>
                </div>
            </div>

            <div class="flex-1 grid grid-cols-3 gap-2 border-x border-gray-700/30 px-4">
                <div class="flex flex-col">
                    <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Price</span>
                    <span class="text-gray-100 font-mono font-semibold text-sm">$${price}</span>
                </div>
                <div class="flex flex-col border-x border-gray-700/10 px-2">
                    <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider text-center">Amount</span>
                    <span class="text-gray-300 font-mono text-sm text-center">${quantity}</span>
                </div>
                <div class="flex flex-col items-center">
                    <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Status</span>
                    <span class="px-2 py-0.5 rounded text-[9px] font-bold ${isFilled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}">
                        ${state}
                    </span>
                </div>
            </div>

            <div class="w-1/4 flex flex-col items-end gap-1">
                <p class="text-[10px] text-gray-400 font-medium">${date}</p>
                ${isCancellable ? `
                    <button onclick="window.cancelOrder('${order.orderId || order.order_id}')" 
                            class="mt-1 px-3 py-1 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white text-[9px] font-bold uppercase rounded transition-all border border-red-500/20">
                        Cancel
                    </button>
                ` : `
                    <p class="text-[9px] text-gray-600 font-mono">ID: ${(order.orderId || order.order_id || '').toString().slice(-6)}</p>
                `}
            </div>
        </div>
    `;
}

function displayOrders(orders, orderListElement, filterType) {
    if (!orderListElement) return;

    let filteredOrders = orders;

    if (filterType === 'filled') {
        filteredOrders = orders.filter(o => (o.state || o.status || '').toLowerCase().includes('filled'));
    } else if (filterType === 'cancelled') {
        filteredOrders = orders.filter(o => (o.state || o.status || '').toLowerCase().includes('cancel'));
    } else if (filterType === 'opened') {
        // BitMart usa 'new', 'partially_filled'. Agregamos 'pending' y '8' (que a veces es el código de pending)
    const openStatuses = ['new', 'partially_filled', 'open', 'active', 'pending', 'triggered', '8'];
    filteredOrders = orders.filter(o => {
        const state = (o.state || o.status || '').toString().toLowerCase();
        return openStatuses.includes(state);
    });
}

    if (filteredOrders.length === 0) {
        orderListElement.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-600">
                <i class="fas fa-folder-open text-2xl mb-2 opacity-20"></i>
                <p class="text-[10px] uppercase tracking-widest font-bold">No orders found</p>
            </div>`;
        return;
    }

    orderListElement.innerHTML = filteredOrders.map(order => createOrderHtml(order)).join('');
}

export async function fetchOrders(status, orderListElement) {
    if (!orderListElement) return;

    orderListElement.innerHTML = `
        <div class="py-20 text-center">
            <i class="fas fa-circle-notch fa-spin text-emerald-500 text-xl"></i>
        </div>`;

    try {
        const endpoint = status === 'all' ? 'filled' : status; 
        const response = await fetch(`${BACKEND_URL}/api/orders/${endpoint}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error("Error en API de órdenes");
        const data = await response.json();
        const orders = Array.isArray(data) ? data : (data.orders || []);

        displayOrders(orders, orderListElement, status);
    } catch (error) {
        console.error("Fetch error:", error);
        orderListElement.innerHTML = `<div class="text-center py-10 text-red-500 text-[10px] uppercase font-bold">Error loading history</div>`;
    }
}

export function updateOpenOrdersTable(ordersData, listElementId, activeOrderTab) {
    const orderListElement = document.getElementById(listElementId);
    if (!orderListElement || activeOrderTab !== 'opened') return;

    const orders = Array.isArray(ordersData) ? ordersData : (ordersData?.orders || []);
    
    if (orders.length === 0) {
        orderListElement.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-600">
                <p class="text-[10px] uppercase tracking-widest font-bold">No hay órdenes abiertas</p>
            </div>`;
        return;
    }

    orderListElement.innerHTML = orders.map(order => createOrderHtml(order)).join('');
}