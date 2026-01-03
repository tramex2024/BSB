import { BACKEND_URL } from '../main.js';

/**
 * Crea el HTML de una orden con diseño de "Card" Emerald-Style
 */
function createOrderHtml(order, orderType) {
    const side = (order.side || 'buy').toLowerCase();
    const isBuy = side === 'buy';
    
    // Colores y flechas según el tipo de orden
    const sideClass = isBuy 
        ? 'text-emerald-400 bg-emerald-500/10' 
        : 'text-red-400 bg-red-500/10';
    const icon = isBuy ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
    
    const actualStatus = (order.state || order.status || orderType || 'N/A').replace(/_/g, ' ').toUpperCase();
    const orderId = order.orderId || order.order_id || '---';
    const timestamp = order.createTime || order.create_time || Date.now();
    const date = new Date(Number(timestamp)).toLocaleString();
    
    const price = parseFloat(order.price || order.filled_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
    const quantity = parseFloat(order.filled_size || order.size || 0).toFixed(6);
    const symbol = (order.symbol || 'BTC_USDT').replace('_', '/');

    return `
        <div class="bg-gray-900/40 border border-gray-700/50 p-4 rounded-2xl mb-3 flex flex-wrap md:flex-nowrap justify-between items-center hover:border-emerald-500/30 transition-all animate-fadeIn">
            <div class="w-full md:w-auto flex items-center gap-4 mb-3 md:mb-0">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center ${sideClass}">
                    <i class="fas ${icon} text-lg"></i>
                </div>
                <div>
                    <p class="text-white font-bold text-sm tracking-tight">${symbol}</p>
                    <p class="text-[10px] ${isBuy ? 'text-emerald-500' : 'text-red-500'} font-bold uppercase tracking-widest">${side}</p>
                </div>
            </div>

            <div class="flex-1 grid grid-cols-2 md:grid-cols-3 gap-6 px-0 md:px-10">
                <div>
                    <p class="text-gray-500 text-[9px] uppercase font-bold mb-0.5">Precio</p>
                    <p class="text-gray-200 font-mono text-sm font-bold">${price} <span class="text-[10px] text-gray-500 font-normal">USDT</span></p>
                </div>
                <div>
                    <p class="text-gray-500 text-[9px] uppercase font-bold mb-0.5">Cantidad</p>
                    <p class="text-gray-200 font-mono text-sm font-bold">${quantity} <span class="text-[10px] text-gray-500 font-normal">BTC</span></p>
                </div>
                <div class="hidden md:block">
                    <p class="text-gray-500 text-[9px] uppercase font-bold mb-0.5">Estado</p>
                    <p class="text-blue-400 font-bold text-xs">${actualStatus}</p>
                </div>
            </div>

            <div class="w-full md:w-auto mt-3 md:mt-0 text-right border-t md:border-t-0 border-gray-800 pt-2 md:pt-0">
                <p class="text-gray-500 text-[10px] font-mono mb-1 leading-none">#${orderId.slice(-8)}</p>
                <p class="text-gray-500 text-[9px] font-medium italic">${date}</p>
            </div>
        </div>
    `;
}

/**
 * Renderiza la lista en el contenedor especificado
 */
function displayOrders(orders, orderListElement, orderType) {
    if (!orderListElement) return;

    if (!orders || orders.length === 0) {
        orderListElement.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 opacity-30">
                <i class="fas fa-folder-open text-4xl mb-3"></i>
                <p class="text-xs uppercase tracking-widest font-bold">Sin órdenes ${orderType}</p>
            </div>`;
        return;
    }

    orderListElement.innerHTML = orders.map(order => createOrderHtml(order, orderType)).join('');
}

/**
 * Obtiene historial desde el Backend (Filled/Cancelled)
 */
export async function fetchOrders(status, orderListElement) {
    if (!orderListElement) return;

    // Mostrar Loading State
    orderListElement.innerHTML = `
        <div class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-500"></div>
            <span class="ml-3 text-xs text-gray-500 font-bold uppercase tracking-widest">Consultando API...</span>
        </div>`;

    const authToken = localStorage.getItem('token');
    if (!authToken) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/v1/bot-state/orders/${status}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error(`Status: ${response.status}`);

        const data = await response.json();
        let ordersToDisplay = Array.isArray(data) ? data : (data.data?.orders || data.orders || []);

        displayOrders(ordersToDisplay, orderListElement, status);
    } catch (error) {
        console.error('Error fetchOrders:', error);
        orderListElement.innerHTML = `
            <div class="text-center py-10">
                <p class="text-red-500 text-xs font-bold uppercase tracking-widest mb-1">Error de Conexión</p>
                <p class="text-gray-600 text-[10px]">No se pudo obtener el historial de Bitmart.</p>
            </div>`;
    }
}

/**
 * Actualiza órdenes abiertas (Generalmente usado con WebSockets)
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

    displayOrders(openOrders, orderListElement, 'activas');
}

/**
 * Manejo visual de botones de pestañas
 */
export function setActiveTab(tabId) {
    const tabs = document.querySelectorAll('.autobot-tabs button'); 
    tabs.forEach(tab => {
        tab.classList.remove('text-emerald-500', 'bg-gray-800');
        tab.classList.add('text-gray-500');
    });
    
    const activeTab = document.getElementById(tabId);
    if (activeTab) {
        activeTab.classList.add('text-emerald-500', 'bg-gray-800');
        activeTab.classList.remove('text-gray-500');
    }
}