import { BACKEND_URL } from '../main.js';

/**
 * Crea el HTML de una orden con diseño de "Card" optimizado
 */
function createOrderHtml(order, orderType) {
    const side = (order.side || 'buy').toLowerCase();
    const isBuy = side === 'buy';
    
    const sideClass = isBuy 
        ? 'text-emerald-400 bg-emerald-500/10' 
        : 'text-red-400 bg-red-500/10';
    
    const icon = isBuy ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
    
    // Normalización de datos
    const actualStatus = (order.state || order.status || orderType || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();
    const orderId = order.orderId || order.order_id || 'N/A';
    const timestamp = order.createTime || order.create_time || Date.now();
    const date = new Date(Number(timestamp)).toLocaleString();
    
    const price = parseFloat(order.price || order.filled_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
    const quantity = parseFloat(order.filled_size || order.size || 0).toFixed(6);
    const symbol = (order.symbol || 'BTC_USDT').replace('_', '/');

    return `
        <div class="bg-gray-800/50 border border-gray-700 p-4 rounded-xl mb-3 flex flex-wrap md:flex-nowrap justify-between items-center hover:border-gray-600 transition-colors animate-fadeIn">
            <div class="w-full md:w-auto flex items-center gap-3 mb-3 md:mb-0">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs ${sideClass}">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <p class="text-gray-500 text-[10px] uppercase font-bold">Currency</p>
                    <p class="text-white font-medium text-sm">${symbol}</p>                    
                </div>
            </div>

            <div class="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 px-0 md:px-6">
                <div>
                    <p class="text-gray-500 text-[10px] uppercase font-bold">Price</p>
                    <p class="text-gray-200 font-mono text-sm">${price} <span class="text-[10px] text-gray-500">USDT</span></p>
                </div>
                <div>
                    <p class="text-gray-500 text-[10px] uppercase font-bold">Amount</p>
                    <p class="text-gray-200 font-mono text-sm">${quantity} <span class="text-[10px] text-gray-500">BTC</span></p>
                </div>
                <div class="hidden md:block">
                    <p class="text-gray-500 text-[10px] uppercase font-bold">Status</p>
                    <p class="text-blue-400 font-medium text-sm">${actualStatus}</p>
                </div>
            </div>

            <div class="w-full md:w-auto mt-3 md:mt-0 text-right">
                <p class="text-gray-500 text-[10px] uppercase tracking-wider">Date: ${date}</p>
                <p class="text-gray-500 text-[10px] font-mono">ID: ${orderId}</p>                
                <div class="md:hidden mt-1 px-2 py-0.5 inline-block rounded bg-gray-700 text-blue-300 text-[10px]">
                    ${actualStatus}
                </div>
            </div>
        </div>
    `;
}

/**
 * Renderiza la lista en el DOM
 */
function displayOrders(orders, orderListElement, orderType) {
    if (!orderListElement) return;

    if (!orders || orders.length === 0) {
        orderListElement.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 opacity-40">
                <svg class="w-12 h-12 mb-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                </svg>
                <p class="text-sm">Without orders ${orderType}</p>
            </div>`;
        return;
    }

    orderListElement.innerHTML = orders.map(order => createOrderHtml(order, orderType)).join('');
}

/**
 * Fetch para historial utilizando la RUTA ORIGINAL que funciona en tu backend
 */
export async function fetchOrders(status, orderListElement) {
    if (!orderListElement) return;

    // Si es 'opened', limpiamos y esperamos al WebSocket
    if (status === 'opened') {
        orderListElement.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 opacity-40">
                <i class="fas fa-sync fa-spin mb-2 text-emerald-500"></i>
                <p class="text-sm uppercase tracking-widest font-bold">Waiting real-time orders...</p>
            </div>`;
        return;
    }
    
    const authToken = localStorage.getItem('token');
    if (!authToken) return;

    try {
        // RUTA ORIGINAL RESTAURADA: /api/orders/${status}
        const response = await fetch(`${BACKEND_URL}/api/orders/${status}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error(`Error: ${response.status}`);

        const data = await response.json();
        let ordersToDisplay = Array.isArray(data) ? data : (data.orders || []);

        displayOrders(ordersToDisplay, orderListElement, status);
    } catch (error) {
        console.error('Error fetchOrders:', error);
        orderListElement.innerHTML = `<p class="text-red-500 text-center py-4 text-xs font-bold uppercase tracking-widest">Disconnected from history</p>`;
    }
}

/**
 * Actualiza la tabla de órdenes abiertas vía WebSocket
 */
export function updateOpenOrdersTable(ordersData, listElementId, activeOrderTab) {
    const orderListElement = document.getElementById(listElementId);
    if (!orderListElement || activeOrderTab !== 'opened') return;

    let openOrders = Array.isArray(ordersData) ? ordersData : (ordersData?.orders || []);

    const validOpenStatuses = ['new', 'partially_filled', 'open', 'pending', 'active'];
    openOrders = openOrders.filter(order => {
        const orderState = String(order.state || order.status || '').toLowerCase();
        return validOpenStatuses.some(status => orderState.includes(status));
    });

    displayOrders(openOrders, orderListElement, 'abiertas');
}

export function setActiveTab(tabId) {
    const tabs = document.querySelectorAll('[id^="tab-"]'); 
    tabs.forEach(tab => tab.classList.remove('active-tab'));
    document.getElementById(tabId)?.classList.add('active-tab');
}