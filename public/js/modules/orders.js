// public/js/modules/orders.js

import { fetchFromBackend } from './api.js';

// URL base de tu backend en Render
const RENDER_BACKEND_URL = 'https://bsb-ppex.onrender.com';

/**
 * Función para crear un elemento HTML para una sola orden.
 * @param {object} order La orden a renderizar.
 * @param {string} orderType El tipo de orden ('opened', 'filled', 'cancelled').
 * @returns {string} El HTML para la orden.
 */
function createOrderHtml(order, orderType) {
    const isBuy = order.side.toLowerCase() === 'buy';
    const sideClass = isBuy ? 'text-green-500' : 'text-red-500';
    const statusText = orderType.charAt(0).toUpperCase() + orderType.slice(1);
    const date = new Date(order.createTime).toLocaleString();
    const orderId = order.orderId;
    
    // Convertir el precio y la cantidad a números para un formato limpio.
    const price = parseFloat(order.price).toFixed(2);
    const quantity = parseFloat(order.filledSize || order.size).toFixed(8);
    const symbol = order.symbol;

    return `
        <div class="bg-gray-800 p-4 rounded-lg shadow-lg mb-2 flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div class="flex-1 mb-2 sm:mb-0">
                <span class="font-semibold text-sm sm:text-base mr-2 ${sideClass}">${order.side.toUpperCase()}</span>
                <span class="text-xs sm:text-sm text-gray-400">${symbol}</span>
            </div>
            <div class="flex-1 text-left sm:text-center mb-2 sm:mb-0">
                <p class="text-gray-400 text-xs sm:text-sm">Precio</p>
                <span class="text-sm sm:text-base">${price} USDT</span>
            </div>
            <div class="flex-1 text-left sm:text-center mb-2 sm:mb-0">
                <p class="text-gray-400 text-xs sm:text-sm">Cantidad</p>
                <span class="text-sm sm:text-base">${quantity} BTC</span>
            </div>
            <div class="flex-1 text-left sm:text-center mb-2 sm:mb-0">
                <p class="text-gray-400 text-xs sm:text-sm">Estado</p>
                <span class="text-sm sm:text-base">${statusText}</span>
            </div>
            <div class="flex-1 text-right sm:text-center text-xs sm:text-sm text-gray-500">
                ${date}
            </div>
        </div>
    `;
}

/**
 * Muestra las órdenes en el contenedor del DOM.
 * @param {Array<object>} orders Las órdenes a mostrar.
 * @param {HTMLElement} orderListElement El elemento HTML para mostrar la lista.
 * @param {string} orderType El tipo de orden ('opened', 'filled', 'cancelled').
 */
function displayOrders(orders, orderListElement, orderType) {
    if (!orderListElement) {
        console.error("No se proporcionó un elemento de lista de órdenes.");
        return;
    }

    orderListElement.innerHTML = ''; // Limpiar la lista actual

    if (orders && orders.length > 0) {
        orders.forEach(order => {
            const orderHtml = createOrderHtml(order, orderType);
            orderListElement.innerHTML += orderHtml;
        });
    } else {
        orderListElement.innerHTML = `<p class="text-gray-500 text-center py-4">No hay órdenes de tipo "${orderType}" para mostrar.</p>`;
    }
}

export async function fetchOrders(status, orderListElement) {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        console.error('Error al obtener órdenes: Token de autenticación no encontrado.');
        orderListElement.innerHTML = `<p class="text-red-500">Error: Not authenticated. Please log in.</p>`;
        return;
    }

    try {
        const response = await fetch(`${RENDER_BACKEND_URL}/api/orders/${status}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Details: ${errorText}`);
        }

        const orders = await response.json();
        
        // CORRECCIÓN: Llamar a la función existente 'displayOrders'
        displayOrders(orders.orders || orders, orderListElement, status);

    } catch (error) {
        console.error('Error al obtener órdenes:', error);
        orderListElement.innerHTML = `<p class="text-red-500">Error: Failed to fetch orders. Please try again.</p>`;
    }
}

/**
 * Establece la pestaña de órdenes activa.
 * @param {string} tabId El ID de la pestaña activa.
 */
export function setActiveTab(tabId) {
    const tabs = document.querySelectorAll('.autobot-tabs button');
    tabs.forEach(tab => tab.classList.remove('active-tab'));
    
    const activeTab = document.getElementById(tabId);
    if (activeTab) {
        activeTab.classList.add('active-tab');
    }
}