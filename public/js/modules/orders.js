// public/js/modules/orders.js

import { BACKEND_URL } from '../main.js';

/**
 * Crea el HTML de una orden (Card)
 * Optimizada para legibilidad rápida y jerarquía de datos
 */
function createOrderHtml(order) {
    const side = (order.side || 'buy').toLowerCase();
    const isBuy = side === 'buy';
    
    // Colores basados en el sentimiento del mercado
    const sideTheme = isBuy 
        ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' 
        : 'text-red-400 border-red-500/20 bg-red-500/5';
    
    const icon = isBuy ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
    
    const state = (order.state || order.status || 'UNKNOWN').toUpperCase();
    const isFilled = state.includes('FILLED');
    const timestamp = order.createTime || order.create_time || Date.now();
    
    // Fecha simplificada para trading (la hora es más importante que el año)
    const date = new Date(Number(timestamp)).toLocaleString('en-GB', { 
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });

    const priceFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const qtyFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });

    const price = priceFormatter.format(parseFloat(order.price || order.filled_price || 0));
    const quantity = qtyFormatter.format(parseFloat(order.filled_size || order.size || 0));

    return `
        <div class="bg-gray-900/40 border border-gray-800 p-3 rounded-lg mb-2 flex items-center justify-between hover:bg-gray-800/60 transition-all border-l-4 ${isBuy ? 'border-l-emerald-500' : 'border-l-red-500'}">
            
            <div class="flex items-center gap-4 w-1/4">
                <div class="flex flex-col">
                    <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Type</span>
                    <div class="flex items-center gap-1.5 ${sideTheme} py-0.5 px-2 rounded-md w-fit">
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
                <div class="flex flex-col">
                    <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Amount</span>
                    <span class="text-gray-300 font-mono text-sm">${quantity}</span>
                </div>
                <div class="flex flex-col items-center">
                    <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Status</span>
                    <span class="px-2 py-0.5 rounded text-[9px] font-bold ${isFilled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}">
                        ${state}
                    </span>
                </div>
            </div>

            <div class="w-1/4 text-right pl-4">
                <p class="text-[10px] text-gray-400 font-medium">${date}</p>
                <p class="text-[9px] text-gray-600 font-mono mt-1">
                    ID: <span class="group-hover:text-gray-400 transition-colors">${(order.orderId || order.order_id || '').toString().slice(-6)}...</span>
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
        filteredOrders = orders.filter(o => (o.state || o.status || '').toLowerCase().includes('filled'));
    } else if (filterType === 'cancelled') {
        filteredOrders = orders.filter(o => (o.state || o.status || '').toLowerCase().includes('cancel'));
    } else if (filterType === 'opened') {
        const openStatuses = ['new', 'partially_filled', 'open', 'active', 'pending'];
        filteredOrders = orders.filter(o => openStatuses.includes((o.state || o.status || '').toLowerCase()));
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

    // En la pestaña "All" priorizamos el historial completo cargado por fetchOrders
    if (activeOrderTab === 'all') return; 

    // Solo actualizamos si el usuario está mirando las órdenes abiertas
    if (activeOrderTab !== 'opened') return;

    const orders = Array.isArray(ordersData) ? ordersData : (ordersData?.orders || []);
    
    if (orders.length === 0) {
        orderListElement.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-600">
                <i class="fas fa-check-circle text-2xl mb-2 opacity-20"></i>
                <p class="text-[10px] uppercase tracking-widest font-bold">No hay órdenes abiertas</p>
            </div>`;
        return;
    }

    orderListElement.innerHTML = orders.map(order => createOrderHtml(order)).join('');
}