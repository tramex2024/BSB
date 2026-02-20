import { fetchFromBackend } from './api.js';

/**
 * Renders the HTML for a single order row - Optimized for Full Width
 */
function createOrderHtml(order) {
    const side = (order.side || 'buy').toLowerCase();
    const isBuy = side === 'buy';
    const sideTheme = isBuy ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-red-400 border-red-500/20 bg-red-500/5';
    
    const rawState = (order.state || order.status || 'UNKNOWN').toUpperCase();
    const isFilled = rawState.includes('FILLED');
    
    // --- DATE PROCESSING ---
    let finalDate = "---";
    try {
        const rawTime = order.orderTime || order.createdAt || order.createTime;
        if (rawTime) {
            let dateObj;
            if (rawTime.$date) {
                dateObj = new Date(rawTime.$date);
            } else if (isNaN(rawTime) && !isNaN(Date.parse(rawTime))) {
                dateObj = new Date(rawTime);
            } else {
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

    const price = parseFloat(order.price || 0).toFixed(2);
    const quantity = parseFloat(order.size || order.amount || 0).toFixed(4);
    const fullOrderId = (order.orderId || order.order_id || '').toString();

    const isCancellable = ['NEW', 'PARTIALLY_FILLED', 'OPEN', 'ACTIVE', 'PENDING'].includes(rawState);

    // CAMBIO CLAVE: Se eliminan los w-1/4 restrictivos y se usa w-full con flex-grow
    return `
    <div class="w-full bg-gray-900/40 border border-gray-800 p-4 rounded-xl mb-3 flex items-center border-l-4 ${isBuy ? 'border-l-emerald-500' : 'border-l-red-500'} transition-all hover:bg-gray-800/60 shadow-md">
        
        <div class="flex flex-col min-w-[80px]">
            <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1">Side</span>
            <div class="${sideTheme} py-1 px-3 rounded-lg border w-fit">
                <span class="font-black text-xs uppercase">${side}</span>
            </div>
        </div>

        <div class="flex-1 grid grid-cols-3 gap-4 border-x border-gray-700/30 px-6 mx-4">
            <div class="flex flex-col">
                <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest">Entry Price</span>
                <span class="text-gray-100 font-mono text-sm font-bold">$${price}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest">Amount</span>
                <span class="text-gray-300 font-mono text-sm">${quantity}</span>
            </div>
            <div class="flex flex-col items-center justify-center">
                <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1">Status</span>
                <span class="px-3 py-0.5 rounded-full text-[9px] font-black tracking-tighter ${isFilled ? 'bg-emerald-400/10 text-emerald-400' : 'bg-orange-500/10 text-orange-400'}">
                    ${rawState}
                </span>
            </div>
        </div>

        <div class="flex flex-col items-end min-w-[120px]">
            <span class="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1">Execution</span>
            <p class="text-[10px] text-gray-300 font-mono font-bold">${finalDate}</p>
            ${isCancellable ? `
                <button onclick="window.cancelOrder('${fullOrderId}')" 
                        class="mt-2 px-4 py-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white text-[9px] font-black uppercase rounded-lg transition-all border border-red-500/20 shadow-lg shadow-red-900/20 active:scale-95">
                    Cancel Order
                </button>
            ` : `<p class="text-[8px] text-gray-500 font-mono mt-2 opacity-40">REF: ${fullOrderId.slice(-8)}</p>`}
        </div>
    </div>`;
}

/**
 * FETCH ORDERS CON FILTRO DE ESTRATEGIA
 */
export async function fetchOrders(strategyType, orderListElement, silent = false) {
    if (!orderListElement || !strategyType) return;
    
    if (!silent) {
        orderListElement.innerHTML = `
            <div class="py-20 text-center w-full">
                <i class="fas fa-brain fa-spin text-blue-500 text-3xl mb-4 opacity-50"></i>
                <p class="text-[10px] text-blue-400 font-mono uppercase tracking-[0.3em]">Neural Fetching...</p>
            </div>`;
    }

    try {
        const data = await fetchFromBackend(`/api/orders/autobot/filter?strategy=${strategyType}`);
        const ordersArray = Array.isArray(data) ? data : [];
        
        if (ordersArray.length === 0) {
            orderListElement.innerHTML = `
                <div class="py-20 text-center w-full bg-gray-800/20 rounded-3xl border-2 border-dashed border-gray-700">
                    <p class="text-gray-500 text-[10px] uppercase tracking-widest font-black">No neural activity detected</p>
                    <p class="text-[8px] text-gray-600 font-mono mt-1">Strategy: ${strategyType.toUpperCase()}</p>
                </div>`;
            return;
        }

        // Inyectamos las órdenes
        orderListElement.innerHTML = ordersArray.map(order => createOrderHtml(order)).join('');
        
    } catch (error) {
        console.error("Fetch Orders Error:", error);
        if (!silent) {
            orderListElement.innerHTML = `<div class="text-center py-10 text-red-500 text-[10px] font-bold uppercase">Critical link failure: Orders inaccessible</div>`;
        }
    }
}

/**
 * GLOBAL BRIDGE FOR CANCELLATION
 */
window.cancelOrder = async (orderId) => {
    if (!confirm(`Confirm deactivation of order ${orderId}?`)) return;

    try {
        const data = await fetchFromBackend(`/api/users/bitmart/cancel-order`, {
            method: 'POST',
            body: JSON.stringify({ orderId, symbol: 'BTC_USDT' })
        });
        
        if (data.success) {
            // Refrescar el panel de IA específicamente si estamos ahí
            const aiContainer = document.getElementById('ai-order-list');
            if (aiContainer) {
                // Buscamos si el tab de historial o activas está marcado
                const isHistory = document.getElementById('ai-tab-all')?.classList.contains('active-tab-style');
                fetchOrders(isHistory ? 'ai-history' : 'ai', aiContainer);
            }
        } else {
            alert(`Abort Failure: ${data.message || 'Check connection'}`);
        }
    } catch (error) {
        console.error("Cancel Error:", error);
    }
};