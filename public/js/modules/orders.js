// public/js/modules/orders.js

import { fetchFromBackend } from './api.js';

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

/**
 * Obtiene y muestra las órdenes de un tipo específico desde el backend.
 * @param {string} orderType El tipo de orden a obtener ('opened', 'filled', 'cancelled', 'all').
 * @param {HTMLElement} orderListElement El elemento del DOM donde se mostrarán las órdenes.
 */
export async function fetchOrders(orderType, orderListElement) {
    if (!orderListElement) {
        console.error("fetchOrders: El elemento orderListElement no está definido.");
        return;
    }

    console.log(`Intentando obtener órdenes de tipo: ${orderType}`);

    try {
        const response = await fetchFromBackend(`/api/orders?type=${orderType}`);
        
        if (response.success && response.data) {
            console.log("Órdenes recibidas desde el backend:", response.data);
            let ordersToShow = response.data;
            if (orderType !== 'all') {
                ordersToShow = response.data.filter(order => order.state === orderType);
            }
            displayOrders(ordersToShow, orderListElement, orderType);
        } else {
            console.error(`Error al obtener órdenes: ${response.message}`);
            displayOrders([], orderListElement, orderType);
        }
    } catch (error) {
        console.error("Error de red al obtener órdenes:", error);
        displayOrders([], orderListElement, orderType);
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