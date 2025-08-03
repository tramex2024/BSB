// public/js/modules/orders.js
import { displayLogMessage } from './auth.js';
import { fetchFromBackend } from './api.js'; // Importación corregida
import { TRADE_SYMBOL } from '../main.js';

let activeTab = 'tab-opened'; // Estado inicial de la pestaña activa

export function setActiveTab(tabId) {
    activeTab = tabId;
    const tabButtons = document.querySelectorAll('.autobot-tabs button');
    tabButtons.forEach(button => {
        if (button.id === tabId) {
            button.classList.add('active-tab');
        } else {
            button.classList.remove('active-tab');
        }
    });
}

export async function fetchOrders(tabId = activeTab) {
    displayLogMessage(`Fetching ${tabId.replace('tab-', '')} orders for ${TRADE_SYMBOL}...`, 'info');
    const orderList = document.getElementById('order-list');
    if (!orderList) return;

    try {
        const data = await fetchFromBackend(`/orders/${tabId.replace('tab-', '')}`);
        if (data.success) {
            displayOrders(data.orders, tabId.replace('tab-', ''));
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

export function updateOrderElement(order) {
    // La lógica de actualización de órdenes iría aquí si fuera necesario
}