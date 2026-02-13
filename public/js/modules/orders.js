// public/js/modules/orders.js

import { fetchFromBackend } from './api.js';

function createOrderHtml(order) {
    const side = (order.side || 'buy').toLowerCase();
    const isBuy = side === 'buy';
    const sideTheme = isBuy ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-red-400 border-red-500/20 bg-red-500/5';
    
    const rawState = (order.state || order.status || 'UNKNOWN').toUpperCase();
    const isFilled = rawState.includes('FILLED');
    
    // --- CORRECCIÓN DE FECHA AQUÍ ---
    let finalDate = "---";
    try {
        // Intentamos obtener la fecha de varias fuentes posibles en el objeto
        const rawTime = order.orderTime || order.createdAt || order.createTime;
        
        if (rawTime) {
            let dateObj;
            // Si es el formato de MongoDB con $date
            if (rawTime.$date) {
                dateObj = new Date(rawTime.$date);
            } 
            // Si ya es un objeto Date o un string ISO
            else if (isNaN(rawTime) && new Date(rawTime) !== "Invalid Date") {
                dateObj = new Date(rawTime);
            }
            // Si es un timestamp numérico
            else {
                dateObj = new Date(Number(rawTime));
            }

            if (!isNaN(dateObj.getTime())) {
                finalDate = dateObj.toLocaleString('en-GB', { 
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                });
            }
        }
    } catch (e) {
        console.warn("Error parsing date for order:", order.orderId);
    }
    // --------------------------------

    const price = parseFloat(order.price || 0).toFixed(2);
    const quantity = parseFloat(order.size || order.amount || 0).toFixed(4);
    const fullOrderId = (order.orderId || '').toString();

    const isCancellable = ['NEW', 'PARTIALLY_FILLED', 'OPEN', 'ACTIVE', 'PENDING'].includes(rawState);

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
            <p class="text-[10px] text-gray-400">${finalDate}</p>
            ${isCancellable ? `
                <button onclick="window.cancelOrder('${fullOrderId}')" 
                        class="mt-1 px-3 py-1 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white text-[9px] font-bold uppercase rounded transition-all">
                    Cancel
                </button>
            ` : `<p class="text-[8px] text-gray-500 font-mono break-all text-right">ID: ${fullOrderId}</p>`}
        </div>
    </div>`;
}

/**
 * FETCH ORDERS SEGMENTADO
 */
export async function fetchOrders(strategy, status, orderListElement) {
    if (!orderListElement || !strategy || !status || typeof strategy !== 'string') return;
    
    orderListElement.innerHTML = `<div class="py-10 text-center"><i class="fas fa-circle-notch fa-spin text-emerald-500"></i></div>`;

    try {
        const data = await fetchFromBackend(`/api/orders/${strategy}/${status}`);
        const ordersArray = Array.isArray(data) ? data : [];
        
        if (ordersArray.length === 0) {
            orderListElement.innerHTML = `<div class="py-10 text-center text-gray-500 text-xs uppercase tracking-widest">No ${status} orders in ${strategy}</div>`;
            return;
        }

        orderListElement.innerHTML = ordersArray.map(order => createOrderHtml(order)).join('');
    } catch (error) {
        console.error("Fetch Orders Error:", error);
        orderListElement.innerHTML = `<div class="text-center py-10 text-red-500 text-[10px] font-bold">ERROR LOADING</div>`;
    }
}

/**
 * BRIDGE GLOBAL PARA CANCELAR
 */
window.cancelOrder = async (orderId) => {
    if (!confirm(`Cancel order ${orderId}?`)) return;

    try {
        const data = await fetchFromBackend(`/api/users/bitmart/cancel-order`, {
            method: 'POST',
            body: JSON.stringify({ orderId, symbol: 'BTC_USDT' })
        });
        
        if (data.success) {
            const auContainer = document.getElementById('au-order-list');
            const aiContainer = document.getElementById('ai-order-list');
            if (auContainer) fetchOrders('autobot', 'all', auContainer);
            if (aiContainer) fetchOrders('aibot', 'all', aiContainer);
        } else {
            alert(`Error: ${data.message || 'Could not cancel'}`);
        }
    } catch (error) {
        console.error("Cancel Error:", error);
    }
};