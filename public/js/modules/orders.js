import { BACKEND_URL } from '../main.js';

/**
 * Crea el HTML de una orden (Card)
 */
function createOrderHtml(order) {
    const side = (order.side || 'buy').toLowerCase();
    const isBuy = side === 'buy';
    const sideClass = isBuy ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10';
    const icon = isBuy ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
    
    // Normalización de estados para visualización
    const state = (order.state || order.status || 'UNKNOWN').toUpperCase();
    const timestamp = order.createTime || order.create_time || Date.now();
    const date = new Date(Number(timestamp)).toLocaleString();
    const price = parseFloat(order.price || order.filled_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
    const quantity = parseFloat(order.filled_size || order.size || 0).toFixed(6);

    return `
        <div class="bg-gray-800/50 border border-gray-700 p-4 rounded-xl mb-3 flex flex-wrap md:flex-nowrap justify-between items-center hover:border-gray-600 transition-colors animate-fadeIn">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center ${sideClass}">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <p class="text-gray-500 text-[10px] uppercase font-bold">Side</p>
                    <p class="text-white font-bold text-xs uppercase">${side}</p>                    
                </div>
            </div>
            <div class="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 px-6">
                <div>
                    <p class="text-gray-500 text-[10px] uppercase font-bold">Price</p>
                    <p class="text-gray-200 font-mono text-sm">${price}</p>
                </div>
                <div>
                    <p class="text-gray-500 text-[10px] uppercase font-bold">Amount</p>
                    <p class="text-gray-200 font-mono text-sm">${quantity}</p>
                </div>
                <div>
                    <p class="text-gray-500 text-[10px] uppercase font-bold">Status</p>
                    <p class="${state.includes('FILLED') ? 'text-emerald-400' : 'text-orange-400'} font-bold text-[10px]">${state}</p>
                </div>
            </div>
            <div class="text-right text-[10px] text-gray-500">
                <p>${date}</p>
                <p class="font-mono">${order.orderId || order.order_id || ''}</p>
            </div>
        </div>
    `;
}

/**
 * Renderiza y FILTRA las órdenes. 
 * CAMBIO: Añadimos 'append' para no borrar si es necesario, 
 * pero la clave es manejar el contenedor correctamente.
 */
function displayOrders(orders, orderListElement, filterType) {
    if (!orderListElement) return;

    let filteredOrders = orders;

    if (filterType === 'filled') {
        filteredOrders = orders.filter(o => (o.state || o.status || '').toLowerCase().includes('filled'));
    } else if (filterType === 'cancelled') {
        filteredOrders = orders.filter(o => (o.state || o.status || '').toLowerCase().includes('cancel'));
    } else if (filterType === 'opened') {
        const openStatuses = ['new', 'partially_filled', 'open', 'active', 'pending'];
        filteredOrders = orders.filter(o => openStatuses.includes((o.state || o.status || '').toLowerCase()));
    }
    // En 'all', no filtramos, mostramos lo que llega.

    if (filteredOrders.length === 0) {
        // Solo mostramos "No orders" si no hay nada de nada en el contenedor previo
        if (orderListElement.children.length === 0) {
            orderListElement.innerHTML = `<p class="text-center py-10 text-gray-500 text-[10px] uppercase tracking-widest font-bold">No orders found in ${filterType}</p>`;
        }
        return;
    }

    // Renderizamos todo el bloque
    orderListElement.innerHTML = filteredOrders.map(order => createOrderHtml(order)).join('');
}

/**
 * Obtiene órdenes del backend
 */
export async function fetchOrders(status, orderListElement) {
    if (!orderListElement) return;

    // Mostrar loader
    orderListElement.innerHTML = '<div class="py-10 text-center"><i class="fas fa-spinner fa-spin text-emerald-500"></i></div>';

    try {
        // Para 'all', 'filled' y 'cancelled', consultamos el endpoint de historial
        // Nota: Si tu backend no tiene un endpoint /all, pedimos 'filled' como base o lo que soporte
        const endpoint = status === 'all' ? 'filled' : status; 
        
        const response = await fetch(`${BACKEND_URL}/api/orders/${endpoint}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) throw new Error("Error en API");
        const data = await response.json();
        const orders = Array.isArray(data) ? data : (data.orders || []);

        displayOrders(orders, orderListElement, status);
    } catch (error) {
        console.error("Fetch error:", error);
        orderListElement.innerHTML = `<p class="text-center text-red-500 py-10 text-xs">Error loading ${status} history</p>`;
    }
}

/**
 * ACTUALIZACIÓN CRÍTICA PARA "ALL":
 * Evita que el WebSocket borre el historial de la pestaña ALL
 */
export function updateOpenOrdersTable(ordersData, listElementId, activeOrderTab) {
    const orderListElement = document.getElementById(listElementId);
    if (!orderListElement) return;

    // Si estamos en "All", no queremos que el WebSocket de 'Abiertas' 
    // sobrescriba el historial que cargamos por API.
    // Lo ideal en "All" es recargar el historial completo para ver todo.
    if (activeOrderTab === 'all') {
        // Opcional: Podrías llamar a fetchOrders('all') cada cierto tiempo 
        // o simplemente ignorar el update de sockets para no 'limpiar' la lista.
        return; 
    }

    if (activeOrderTab !== 'opened') return;

    const orders = Array.isArray(ordersData) ? ordersData : (ordersData?.orders || []);
    displayOrders(orders, orderListElement, 'opened');
}