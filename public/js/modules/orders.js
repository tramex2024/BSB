// public/js/modules/orders.js

// public/js/modules/orders.js

import { BACKEND_URL } from '../main.js';

function createOrderHtml(order) {
    const side = (order.side || 'buy').toLowerCase();
    const isBuy = side === 'buy';
    const sideTheme = isBuy ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-red-400 border-red-500/20 bg-red-500/5';
    
    const rawState = (order.state || order.status || 'UNKNOWN').toUpperCase();
    const isFilled = rawState.includes('FILLED');
    
    const timestamp = order.orderTime || order.createTime || Date.now();
    const date = new Date(Number(timestamp)).toLocaleString('en-GB', { 
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
    });

    const price = parseFloat(order.price || 0).toFixed(2);
    const quantity = parseFloat(order.size || order.amount || 0).toFixed(4);
    
    // RESTAURADO: ID completo de la orden
    const fullOrderId = (order.orderId || '').toString();

    // Sincronizado con estados de BitMart v4
    const isCancellable = ['NEW', 'PARTIALLY_FILLED', 'OPEN', 'ACTIVE'].includes(rawState);

    return `
    <div class="bg-gray-900/40 border border-gray-800 p-3 rounded-lg mb-2 flex items-center justify-between border-l-4 ${isBuy ? 'border-l-emerald-500' : 'border-l-red-500'}">
        <div class="flex items-center gap-4 w-1/4">
            <div class="flex flex-col">
                <span class="text-[9px] text-gray-500 font-bold uppercase">Side</span>
                <div class="${sideTheme} py-0.5 px-2 rounded-md w-fit flex items-center gap-1">
                    <span class="font-black text-xs uppercase">${side}</span>
                </div>
            </div>
        </div>

        <div class="flex-1 grid grid-cols-3 gap-2 border-x border-gray-700/30 px-4">
            <div class="flex flex-col">
                <span class="text-[9px] text-gray-500 font-bold uppercase">Price</span>
                <span class="text-gray-100 font-mono text-sm">$${price}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-[9px] text-gray-500 font-bold uppercase">Amount</span>
                <span class="text-gray-300 font-mono text-sm">${quantity}</span>
            </div>
            <div class="flex flex-col items-center">
                <span class="text-[9px] text-gray-500 font-bold uppercase">Status</span>
                <span class="px-2 py-0.5 rounded text-[9px] font-bold ${isFilled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}">
                    ${rawState}
                </span>
            </div>
        </div>

        <div class="w-1/4 flex flex-col items-end gap-1">
            <p class="text-[10px] text-gray-400">${date}</p>
            ${isCancellable ? `
                <button onclick="window.cancelOrder('${fullOrderId}')" 
                        class="mt-1 px-3 py-1 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white text-[9px] font-bold uppercase rounded transition-all">
                    Cancel
                </button>
            ` : `<p class="text-[8px] text-gray-500 font-mono break-all text-right">ID: ${fullOrderId}</p>`}
        </div>
    </div>`;
}

export async function fetchOrders(status, orderListElement) {
    if (!orderListElement) return;
    orderListElement.innerHTML = `<div class="py-10 text-center"><i class="fas fa-circle-notch fa-spin text-emerald-500"></i></div>`;

    try {
        const response = await fetch(`${BACKEND_URL}/api/orders/${status}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const result = await response.json();
        const ordersArray = Array.isArray(result) ? result : (result.data || []);
        
        if (ordersArray.length === 0) {
            orderListElement.innerHTML = `<div class="py-10 text-center text-gray-500 text-xs uppercase tracking-widest">No ${status} orders</div>`;
            return;
        }

        orderListElement.innerHTML = ordersArray.map(order => createOrderHtml(order)).join('');
    } catch (error) {
        orderListElement.innerHTML = `<div class="text-center py-10 text-red-500 text-[10px] font-bold">ERROR LOADING</div>`;
    }
}

/**
 * BRIDGE GLOBAL: Expone la función de cancelación para los atributos 'onclick'
 */
window.cancelOrder = async (orderId) => {
    if (!confirm(`Cancel order ${orderId}?`)) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/orders/cancel`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ orderId })
        });
        
        const data = await response.json();
        if (data.success) {
            // Refrescar automáticamente la vista actual (generalmente 'all' o 'opened')
            const activeContainer = document.getElementById('au-order-list');
            if (activeContainer) fetchOrders('all', activeContainer);
        } else {
            alert(`Error: ${data.message || 'Could not cancel'}`);
        }
    } catch (error) {
        console.error("Cancel Error:", error);
    }
};