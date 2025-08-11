// public/js/modules/orders.js

import { displayLogMessage } from './auth.js';
import { fetchFromBackend } from './api.js';
import { TRADE_SYMBOL_BITMART } from '../main.js';

export function setActiveTab(tabId) {
    // La lógica de la interfaz de usuario para las pestañas de órdenes
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

export async function fetchOrders(tabId) {
    const cleanedTabId = tabId.replace('tab-', '');
    displayLogMessage(`Fetching ${cleanedTabId} orders for ${TRADE_SYMBOL_BITMART}...`, 'info');
    const orderList = document.getElementById('order-list');
    if (!orderList) return;

    try {
        const data = await fetchFromBackend(`/orders/${cleanedTabId}`);
        if (data.success) {
            displayOrders(data.orders, cleanedTabId);
            displayLogMessage(`Successfully fetched ${data.orders.length} orders.`, 'success');
        } else {
            displayLogMessage(`Failed to fetch orders: ${data.message || 'Unknown error'}`, 'error');
            orderList.innerHTML = `<p class="text-red-500">Failed to load orders: ${data.message}</p>`;
        }
    } catch (error) {
        orderList.innerHTML = `<p class="text-red-500">Could not fetch orders.</p>`;
    }
}

export function displayOrders(orders, type) {
    const orderList = document.getElementById('order-list');
    if (!orderList) return;

    if (orders.length === 0) {
        orderList.innerHTML = `<p class="text-gray-400">No ${type} orders found.</p>`;
        return;
    }

    orderList.innerHTML = orders.map(order => createOrderElement(order)).join('');
}

export function createOrderElement(order) {
    const orderTypeClass = order.side === 'buy' ? 'text-green-400' : 'text-red-400';
    return `
        <div class="bg-gray-700 p-3 rounded-lg flex justify-between items-center text-sm">
            <div>
                <span class="font-bold ${orderTypeClass}">${order.side.toUpperCase()} ${order.symbol}</span>
                <p class="text-gray-400">Price: $${parseFloat(order.price).toFixed(2)} | Qty: ${parseFloat(order.amount).toFixed(4)}</p>
                <p class="text-gray-400">Status: ${order.status}</p>
            </div>
            <div class="text-right">
                <p class="text-gray-400">${new Date(order.timestamp).toLocaleString()}</p>
                <p class="text-xs text-gray-500">ID: ${order.orderId}</p>
            </div>
        </div>
    `;
}