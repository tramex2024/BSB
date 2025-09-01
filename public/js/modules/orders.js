// public/js/modules/orders.js

import { displayLogMessage } from './auth.js';
import { fetchFromBackend } from './api.js';
import { TRADE_SYMBOL_BITMART } from '../main.js';

export function setActiveTab(tabId) {
    document.querySelectorAll('#autobot-section .border-b-2').forEach(button => {
        button.classList.remove('active-tab', 'border-white');
        button.classList.add('border-transparent');
    });
    const activeButton = document.getElementById(tabId);
    if (activeButton) {
        activeButton.classList.add('active-tab', 'border-white');
        activeButton.classList.remove('border-transparent');
    }
}

export async function fetchOrders(tabId, orderListElement) {
    if (!orderListElement) {
        console.error("No se proporcionó un elemento de lista de órdenes.");
        return;
    }

    orderListElement.innerHTML = '<p class="text-center text-gray-400">Cargando...</p>';
    let endpoint = '';
    
    switch (tabId) {
        case 'opened':
            endpoint = `/api/orders/opened?symbol=${TRADE_SYMBOL_BITMART}`;
            displayLogMessage(`Fetching open orders for ${TRADE_SYMBOL_BITMART}...`, 'info');
            break;
        case 'filled':
            endpoint = `/api/orders/filled?symbol=${TRADE_SYMBOL_BITMART}`;
            displayLogMessage(`Fetching filled orders for ${TRADE_SYMBOL_BITMART}...`, 'info');
            break;
        case 'cancelled':
            endpoint = `/api/orders/cancelled?symbol=${TRADE_SYMBOL_BITMART}`;
            displayLogMessage(`Fetching cancelled orders for ${TRADE_SYMBOL_BITMART}...`, 'info');
            break;
        case 'all':
            endpoint = `/api/orders/all?symbol=${TRADE_SYMBOL_BITMART}`;
            displayLogMessage(`Fetching all orders for ${TRADE_SYMBOL_BITMART}...`, 'info');
            break;
        default:
            console.warn(`Tab ID desconocido: ${tabId}`);
            orderListElement.innerHTML = '<p class="text-center text-gray-500">Estado de orden desconocido.</p>';
            return;
    }

    try {
        const result = await fetchFromBackend(endpoint);
        let orders = result.orders || [];

        orderListElement.innerHTML = '';
        if (orders.length > 0) {
            orders.forEach(order => {
                const li = document.createElement('li');
                li.className = 'bg-gray-700 p-2 rounded-lg mb-2 flex flex-col md:flex-row justify-between items-start md:items-center text-sm';
                li.innerHTML = `
                    <div class="flex-grow">
                        <p class="font-bold text-gray-100">${order.symbol}</p>
                        <p class="text-xs text-gray-400">ID: ${order.order_id}</p>
                    </div>
                    <div class="mt-2 md:mt-0 md:text-right">
                        <p class="font-semibold text-${order.side === 'buy' ? 'green' : 'red'}-400">${order.side.toUpperCase()}</p>
                        <p class="text-gray-300">Tipo: ${order.type.toUpperCase()}</p>
                        <p class="text-gray-300">Tamaño: ${parseFloat(order.size).toFixed(8)}</p>
                        <p class="text-gray-300">Precio: ${parseFloat(order.price).toFixed(2)}</p>
                        <p class="text-gray-300">Estado: ${order.state.toUpperCase()}</p>
                    </div>
                `;
                orderListElement.appendChild(li);
            });
            displayLogMessage(`Se han obtenido ${orders.length} órdenes para ${tabId}.`, 'success');
        } else {
            orderListElement.innerHTML = `<p class="text-center text-gray-500">No se encontraron órdenes en ${tabId}.</p>`;
            displayLogMessage(`No se encontraron órdenes para ${tabId}.`, 'info');
        }
    } catch (error) {
        orderListElement.innerHTML = `<p class="text-center text-red-400">Error: ${error.message}</p>`;
        displayLogMessage(`Error al obtener órdenes: ${error.message}`, 'error');
        console.error('Error fetching orders:', error);
    }
}
