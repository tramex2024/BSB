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

export async function fetchOrders(tabId, orderListElement) { // <-- ¡Nuevo argumento!
    let endpoint = '';
    
    // Ya no es necesario buscar el elemento aquí, ya lo tenemos.
    if (!orderListElement) {
        console.error("No se proporcionó un elemento de lista de órdenes.");
        return;
    }

    if (tabId === 'opened') {
        endpoint = `/api/orders/opened?symbol=${TRADE_SYMBOL_BITMART}`;
        displayLogMessage(`Fetching open orders for ${TRADE_SYMBOL_BITMART}...`, 'info');
    } else if (tabId === 'history') {
        endpoint = `/api/orders/all?symbol=${TRADE_SYMBOL_BITMART}`;
        displayLogMessage(`Fetching history orders for ${TRADE_SYMBOL_BITMART}...`, 'info');
    } else {
        endpoint = `/api/orders/opened?symbol=${TRADE_SYMBOL_BITMART}`;
        displayLogMessage(`Fetching default orders for ${TRADE_SYMBOL_BITMART}...`, 'info');
    }

    try {
        const data = await fetchFromBackend(endpoint);
        let orders = [];

        if (Array.isArray(data)) {
            orders = data;
        } else if (data && Array.isArray(data.orders)) {
            orders = data.orders;
        } else {
            displayLogMessage(`No se encontraron órdenes en la respuesta.`, 'info');
            orders = [];
        }

        displayOrders(orders, tabId, orderListElement); // <-- Pasa el elemento al renderizado
        displayLogMessage(`Se han obtenido ${orders.length} órdenes.`, 'success');

    } catch (error) {
        displayLogMessage(`Error al obtener órdenes: ${error.message}`, 'error');
        orderListElement.innerHTML = `<p class="text-red-500">No se pudieron cargar las órdenes. Error: ${error.message}</p>`;
    }
}

// Actualiza displayOrders para que también reciba el elemento
export function displayOrders(orders, type, orderListElement) {
    if (!orderListElement) return;

    if (!orders || orders.length === 0) {
        orderListElement.innerHTML = `<p class="text-gray-400">No ${type} orders found.</p>`;
        return;
    }

    orderListElement.innerHTML = orders.map(order => createOrderElement(order)).join('');
}

export function createOrderElement(order) {
    const orderTypeClass = order.side === 'buy' ? 'text-green-400' : 'text-red-400';
    const amount = order.size || order.notional / order.priceAvg;
    
    return `
        <div class="bg-gray-700 p-3 rounded-lg flex justify-between items-center text-sm">
            <div>
                <span class="font-bold ${orderTypeClass}">${order.side.toUpperCase()} ${order.symbol}</span>
                <p class="text-gray-400">Price: $${parseFloat(order.price).toFixed(2)} | Qty: ${parseFloat(amount).toFixed(4)}</p>
                <p class="text-gray-400">Status: ${order.state}</p>
            </div>
            <div class="text-right">
                <p class="text-gray-400">${new Date(order.createTime).toLocaleString()}</p>
                <p class="text-xs text-gray-500">ID: ${order.orderId}</p>
            </div>
        </div>
    `;
}