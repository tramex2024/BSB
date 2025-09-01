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
    let endpoint = '';
    const orderList = document.getElementById('order-list');
    if (!orderList) return;

    // Lógica para determinar el endpoint basado en la pestaña activa
    if (tabId === 'opened') {
        endpoint = `/api/orders/opened?symbol=${TRADE_SYMBOL_BITMART}`;
        displayLogMessage(`Fetching open orders for ${TRADE_SYMBOL_BITMART}...`, 'info');
    } else if (tabId === 'history') {
        // Corregido: Ahora llama al endpoint de historial que maneja todos los estados
        endpoint = `/api/orders/all?symbol=${TRADE_SYMBOL_BITMART}`;
        displayLogMessage(`Fetching history orders for ${TRADE_SYMBOL_BITMART}...`, 'info');
    } else {
        // En caso de una pestaña no reconocida, por ejemplo, en la vista del dashboard
        endpoint = `/api/orders/opened?symbol=${TRADE_SYMBOL_BITMART}`;
        displayLogMessage(`Fetching default orders for ${TRADE_SYMBOL_BITMART}...`, 'info');
    }

    try {
        const data = await fetchFromBackend(endpoint);
        let orders = [];

        // --- CÓDIGO CORREGIDO ---
        if (Array.isArray(data)) {
            // Caso 1: El backend devuelve un array directamente
            orders = data;
        } else if (data && Array.isArray(data.orders)) {
            // Caso 2: El backend devuelve un objeto con un array de órdenes
            orders = data.orders;
        } else {
            // Si el formato no es el esperado, asumimos un array vacío para evitar errores
            displayLogMessage(`No se encontraron órdenes en la respuesta.`, 'info');
            orders = [];
        }

        displayOrders(orders, tabId);
        displayLogMessage(`Se han obtenido ${orders.length} órdenes.`, 'success');

    } catch (error) {
        // Esta sección ahora solo se ejecutará si hay un error real de la API o de la red.
        displayLogMessage(`Error al obtener órdenes: ${error.message}`, 'error');
        orderList.innerHTML = `<p class="text-red-500">No se pudieron cargar las órdenes. Error: ${error.message}</p>`;
    }
}

export function displayOrders(orders, type) {
    const orderList = document.getElementById('order-list');
    if (!orderList) return;

    if (!orders || orders.length === 0) {
        orderList.innerHTML = `<p class="text-gray-400">No ${type} orders found.</p>`;
        return;
    }

    orderList.innerHTML = orders.map(order => createOrderElement(order)).join('');
}

export function createOrderElement(order) {
    const orderTypeClass = order.side === 'buy' ? 'text-green-400' : 'text-red-400';
    
    // Asegúrate de que los campos del objeto 'order' coincidan con los de la respuesta de BitMart V4
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