// public/js/modules/orders.js

import { BACKEND_URL } from '../main.js';

/**
 * Crea el HTML de una orden (Card)
 */
function createOrderHtml(order) {
    const side = (order.side || 'buy').toLowerCase();
    const isBuy = side === 'buy';
    const sideClass = isBuy ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10';
    const icon = isBuy ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
    
    const rawState = (order.state || order.status || 'UNKNOWN').toString();
    const state = rawState.toUpperCase();
    const timestamp = order.createTime || order.create_time || Date.now();
    
    const date = new Date(Number(timestamp)).toLocaleString('en-GB', { 
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });

    const priceFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const qtyFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 });

    const price = priceFormatter.format(parseFloat(order.price || order.filled_price || 0));
    const quantity = qtyFormatter.format(parseFloat(order.filled_size || order.size || 0));

    return `
        <div class="bg-gray-800/50 border border-gray-700 p-4 rounded-xl mb-3 flex flex-wrap md:flex-nowrap justify-between items-center hover:border-gray-600 transition-colors">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center ${sideClass}">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <p class="text-gray-500 text-[10px] uppercase font-bold tracking-tighter">Side</p>
                    <p class="text-white font-bold text-xs uppercase">${side}</p>                     
                </div>
            </div>
            <div class="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 px-6">
                <div>
                    <p class="text-gray-500 text-[10px] uppercase font-bold tracking-tighter">Price</p>
                    <p class="text-gray-200 font-mono text-sm">$${price}</p>
                </div>
                <div>
                    <p class="text-gray-500 text-[10px] uppercase font-bold tracking-tighter">Amount</p>
                    <p class="text-gray-200 font-mono text-sm">${quantity}</p>
                </div>
                <div>
                    <p class="text-gray-500 text-[10px] uppercase font-bold tracking-tighter">Status</p>
                    <p class="${state.includes('FILLED') ? 'text-emerald-400' : 'text-orange-400'} font-bold text-[10px]">${state}</p>
                </div>
            </div>
            <div class="text-right text-[9px] text-gray-500 leading-tight">
                <p class="mb-1">${date}</p>
                <p class="font-mono opacity-40">ID: ${order.orderId || order.order_id || ''}</p>
            </div>
        </div>
    `;
}

/**
 * Renderiza y filtra las órdenes
 */
function displayOrders(orders, orderListElement, filterType) {
    if (!orderListElement) return;

    let filteredOrders = orders;

    if (filterType === 'filled') {
        filteredOrders = orders.filter(o => {
            const s = (o.state || o.status || '').toString().toLowerCase();
            return s.includes('filled') || s.includes('completed') || s === '1';
        });
    } else if (filterType === 'cancelled') {
        filteredOrders = orders.filter(o => {
            const s = (o.state || o.status || '').toString().toLowerCase();
            return s.includes('cancel') || s === '6';
        });
    } else if (filterType === 'opened') {
        const openStatuses = ['new', 'partially_filled', 'open', 'active', '8', 'triggered', '6'];
        filteredOrders = orders.filter(o => {
            const s = (o.state || o.status || '').toString().toLowerCase();
            return openStatuses.includes(s) || (!s.includes('filled') && !s.includes('cancel'));
        });
    }

    if (filteredOrders.length === 0) {
        orderListElement.innerHTML = `<p class="text-center py-10 text-gray-600 text-xs uppercase tracking-widest">No orders found</p>`;
        return;
    }

    orderListElement.innerHTML = filteredOrders.map(order => createOrderHtml(order)).join('');
}

/**
 * Obtiene historial vía API
 */
export async function fetchOrders(status, orderListElement) {
    if (!orderListElement) return;
    
    // Mostramos un loader visual
    orderListElement.innerHTML = `<p class="text-center py-10 text-gray-500 animate-pulse text-[10px] uppercase tracking-widest">Fetching ${status} orders...</p>`;

    try {
        const token = localStorage.getItem('token');
        // IMPORTANTE: Verifica si tu backend usa /api/orders o /api/v1/orders
        const response = await fetch(`${BACKEND_URL}/api/orders/${status}`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        console.log(`[DEBUG] Datos recibidos para ${status}:`, data);

        // El controlador envía el array directamente: res.json(result)
        // Por lo tanto, 'data' ya es el array.
        const ordersArray = Array.isArray(data) ? data : (data.orders || []);
        
        displayOrders(ordersArray, orderListElement, status);
    } catch (error) {
        console.error("❌ Error al cargar órdenes:", error);
        orderListElement.innerHTML = `<p class="text-center py-10 text-red-400 text-[10px] uppercase font-bold">Error loading orders</p>`;
    }
}

/**
 * Actualiza órdenes abiertas vía Socket
 */
export function updateOpenOrdersTable(ordersData, listElementId, activeOrderTab) {
    // IMPORTANTE: Aquí usamos el 'listElementId' que viene de autobot.js ('au-order-list')
    const orderListElement = document.getElementById(listElementId);
    
    // Si no encuentra el elemento o la pestaña no es la correcta, salimos
    if (!orderListElement || (activeOrderTab !== 'opened' && activeOrderTab !== 'all')) return;

    const orders = Array.isArray(ordersData) ? ordersData : (ordersData.orders || ordersData.data || []);
    
    // Filtramos para mostrar solo lo que está activo (lógica de trading viva)
    const onlyOpen = orders.filter(o => {
        const s = (o.state || o.status || '').toString().toLowerCase();
        // Incluimos estados de BitMart: 'new', 'partially_filled', '8' (prio), etc.
        return ['new', 'partially_filled', '8', 'open', 'active'].includes(s) || 
               (!s.includes('filled') && !s.includes('cancel'));
    });

    if (onlyOpen.length > 0) {
        orderListElement.innerHTML = onlyOpen.map(order => createOrderHtml(order)).join('');
    } else {
        orderListElement.innerHTML = `<p class="text-center py-10 text-gray-600 text-[10px] uppercase tracking-widest font-bold">No active orders</p>`;
    }
}