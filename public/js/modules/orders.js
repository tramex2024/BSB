// public/js/modules/orders.js

import { BACKEND_URL } from '../main.js';

/**
 * Crea el HTML de una orden (Card)
 * Formateado con estándares de trading internacional (US)
 */
function createOrderHtml(order) {
    const side = (order.side || 'buy').toLowerCase();
    const isBuy = side === 'buy';
    const sideClass = isBuy ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10';
    const icon = isBuy ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
    
    // Normalización de estados y tiempos
    const rawState = (order.state || order.status || 'UNKNOWN').toString();
    const state = rawState.toUpperCase();
    const timestamp = order.createTime || order.create_time || Date.now();
    
    // Formato de fecha: DD/MM/YYYY HH:MM:SS
    const date = new Date(Number(timestamp)).toLocaleString('en-GB', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });

    // FORMATO UNIFICADO: Americano (Comas para miles, punto para decimales)
    const priceFormatter = new Intl.NumberFormat('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    });

    const qtyFormatter = new Intl.NumberFormat('en-US', { 
        minimumFractionDigits: 6,
        maximumFractionDigits: 8
    });

    const price = priceFormatter.format(parseFloat(order.price || order.filled_price || 0));
    const quantity = qtyFormatter.format(parseFloat(order.filled_size || order.size || 0));

    return `
        <div class="bg-gray-800/50 border border-gray-700 p-4 rounded-xl mb-3 flex flex-wrap md:flex-nowrap justify-between items-center hover:border-gray-600 transition-colors animate-fadeIn">
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
                <p class="font-mono opacity-40 hover:opacity-100 transition-opacity">
                    ID: ${order.orderId || order.order_id || ''}
                </p>
            </div>
        </div>
    `;
}

/**
 * Renderiza y filtra las órdenes en el contenedor
 */
function displayOrders(orders, orderListElement, filterType) {
    if (!orderListElement) return;

    let filteredOrders = orders;

    if (filterType === 'filled') {
        filteredOrders = orders.filter(o => {
            const s = (o.state || o.status || '').toString().toLowerCase();
            return s.includes('filled') || s.includes('completed');
        });
    } else if (filterType === 'cancelled') {
        filteredOrders = orders.filter(o => {
            const s = (o.state || o.status || '').toString().toLowerCase();
            return s.includes('cancel');
        });
    } else if (filterType === 'opened') {
        // Incluimos estados numéricos de BitMart (8 = New) y estados activos comunes
        const openStatuses = ['new', 'partially_filled', 'open', 'active', 'pending', '8', 'triggered', '6'];
        
        filteredOrders = orders.filter(o => {
            const s = (o.state || o.status || '').toString().toLowerCase();
            // Si el estado está en la lista O no es un estado final, se considera abierta
            return openStatuses.includes(s) || (!s.includes('filled') && !s.includes('cancel') && !s.includes('completed'));
        });
    }

    if (filteredOrders.length === 0) {
        orderListElement.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-600">
                <i class="fas fa-folder-open text-2xl mb-2 opacity-20"></i>
                <p class="text-[10px] uppercase tracking-widest font-bold">No orders found in ${filterType}</p>
            </div>`;
        return;
    }

    orderListElement.innerHTML = filteredOrders.map(order => createOrderHtml(order)).join('');
}

/**
 * Obtiene historial de órdenes del backend vía API
 */
export async function fetchOrders(status, orderListElement) {
    if (!orderListElement) return;

    // Loader animado
    orderListElement.innerHTML = `
        <div class="py-20 text-center">
            <i class="fas fa-circle-notch fa-spin text-emerald-500 text-xl"></i>
            <p class="text-[10px] text-gray-500 mt-2 uppercase font-bold tracking-widest">Consultando Historial...</p>
        </div>`;

    try {
        // Si pedimos 'all', el backend suele devolver las ejecutadas (filled)
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
        orderListElement.innerHTML = `
            <div class="text-center py-10">
                <p class="text-red-500 text-xs font-bold uppercase">Error al cargar historial</p>
                <p class="text-gray-600 text-[10px] mt-1">${error.message}</p>
            </div>`;
    }
}

/**
 * Actualiza la tabla de órdenes abiertas en tiempo real vía Socket
 */
export function updateOpenOrdersTable(ordersData, listElementId, activeOrderTab) {
    const orderListElement = document.getElementById(listElementId);
    if (!orderListElement) return;

    // Permitimos actualizaciones si estamos en la pestaña 'all' o 'opened'
    if (activeOrderTab !== 'opened' && activeOrderTab !== 'all') return;

    const orders = Array.isArray(ordersData) ? ordersData : (ordersData?.orders || []);
    
    // Filtrar solo las que realmente están abiertas para no ensuciar la pestaña Opened
    const onlyOpen = orders.filter(o => {
        const s = (o.state || o.status || '').toString().toLowerCase();
        const openStatuses = ['new', 'partially_filled', 'open', 'active', '8', 'triggered', '6'];
        return openStatuses.includes(s) || (!s.includes('filled') && !s.includes('cancel'));
    });

    if (onlyOpen.length === 0 && activeOrderTab === 'opened') {
        orderListElement.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-600">
                <i class="fas fa-check-circle text-2xl mb-2 opacity-20"></i>
                <p class="text-[10px] uppercase tracking-widest font-bold">No hay órdenes abiertas</p>
            </div>`;
        return;
    }

    if (onlyOpen.length > 0) {
        orderListElement.innerHTML = onlyOpen.map(order => createOrderHtml(order)).join('');
    }
}