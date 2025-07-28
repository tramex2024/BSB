// public/js/modules/orders.js
import { fetchFromBackend, displayLogMessage } from './auth.js';
import { TRADE_SYMBOL } from '../main.js'; // Asegúrate de importar TRADE_SYMBOL si lo necesitas

// Referencia al contenedor de la lista de órdenes
export let orderListContainer = null;
// Variable para mantener un registro de la pestaña de órdenes activa
let currentActiveOrderTabId = 'tab-opened'; // Estado inicial: 'tab-opened'

document.addEventListener('DOMContentLoaded', () => {
    // Asegúrate de que el contenedor de la lista de órdenes esté asignado aquí
    orderListContainer = document.getElementById('order-list');
    // Los listeners de los botones de las pestañas de órdenes están en main.js
    // por lo que no es necesario asignarlos aquí.
});

/**
 * Establece la pestaña de órdenes activa y actualiza la UI.
 * @param {string} tabId El ID del botón de la pestaña clicado (e.g., 'tab-opened', 'tab-filled').
 */
export function setActiveTab(tabId) {
    // Selecciona todos los botones que están dentro del div con la clase 'autobot-tabs'
    const orderTabButtons = document.querySelectorAll('.autobot-tabs button');

    // Remueve la clase 'active-tab' de todos los botones
    orderTabButtons.forEach(button => {
        button.classList.remove('active-tab');
    });

    // Agrega la clase 'active-tab' al botón de la pestaña seleccionada
    const clickedTabButton = document.getElementById(tabId);
    if (clickedTabButton) {
        clickedTabButton.classList.add('active-tab');
        currentActiveOrderTabId = tabId; // Actualiza la variable de estado
        displayLogMessage(`Viewing ${tabId.replace('tab-', '')} orders.`, 'info');
        fetchOrders(tabId); // Llama a fetchOrders con la pestaña activa
    } else {
        displayLogMessage(`Error: Tab button with ID '${tabId}' not found.`, 'error');
    }
}

/**
 * Obtiene y muestra las órdenes del backend según la pestaña activa.
 * @param {string} tabId La pestaña activa para filtrar las órdenes (e.g., 'tab-opened', 'tab-filled').
 */
export async function fetchOrders(tabId) {
    if (!orderListContainer) {
        displayLogMessage('Order list container not found.', 'error');
        return;
    }

    orderListContainer.innerHTML = '<p class="text-gray-400">Loading orders...</p>'; // Mostrar mensaje de carga
    displayLogMessage(`Loading ${tabId.replace('tab-', '')} orders...`, 'info');

    let endpoint = `/api/orders`; // Endpoint base para todas las órdenes

    try {
        const response = await fetchFromBackend(endpoint, {
            method: 'GET'
        });

        if (response && response.orders) {
            let filteredOrders = response.orders;

            // Filtra las órdenes basadas en la pestaña activa
            if (tabId === 'tab-opened') {
                // Asume que 'Open' y 'Partially Filled' son estados de órdenes abiertas.
                filteredOrders = response.orders.filter(order => order.status === 'Open' || order.status === 'Partially Filled');
            } else if (tabId === 'tab-filled') {
                // Asume que 'Filled' es el estado de una orden completada.
                filteredOrders = response.orders.filter(order => order.status === 'Filled');
            } else if (tabId === 'tab-cancelled') {
                // Asume que 'Canceled' y 'Partially Canceled' son estados de órdenes canceladas.
                filteredOrders = response.orders.filter(order => order.status === 'Canceled' || order.status === 'Partially Canceled');
            }
            // Si tabId es 'tab-all', no se filtra, se muestran todas las órdenes (filteredOrders ya tiene todas las órdenes).

            if (filteredOrders.length === 0) {
                orderListContainer.innerHTML = `<p class="text-gray-400">No orders found for the "${tabId.replace('tab-', '')}" tab.</p>`;
                displayLogMessage(`No orders found for the "${tabId.replace('tab-', '')}" tab.`, 'info');
                return;
            }

            // Limpia el contenedor antes de añadir las nuevas órdenes
            orderListContainer.innerHTML = '';
            displayOrders(filteredOrders); // Muestra las órdenes filtradas
            displayLogMessage(`Successfully loaded ${filteredOrders.length} ${tabId.replace('tab-', '')} orders.`, 'success');

        } else {
            orderListContainer.innerHTML = '<p class="text-red-400">Failed to load orders.</p>';
            displayLogMessage('Failed to load orders from backend.', 'error');
        }
    } catch (error) {
        console.error('Error fetching orders:', error);
        orderListContainer.innerHTML = `<p class="text-red-400">Error loading orders: ${error.message}</p>`;
        displayLogMessage(`Error fetching orders: ${error.message}`, 'error');
    }
}

/**
 * Muestra una lista de órdenes en el contenedor.
 * @param {Array<Object>} orders Un array de objetos de orden.
 */
export function displayOrders(orders) {
    if (!orderListContainer) return; // Asegúrate de que el contenedor existe

    orders.forEach(order => {
        const orderElement = createOrderElement(order);
        orderListContainer.appendChild(orderElement);
    });
}

/**
 * Crea un elemento DOM para una orden individual.
 * @param {Object} order Objeto de la orden.
 * @returns {HTMLElement} El elemento div que representa la orden.
 */
export function createOrderElement(order) {
    const orderDiv = document.createElement('div');
    orderDiv.className = 'bg-gray-700 p-3 rounded-lg flex justify-between items-center text-sm';
    orderDiv.id = `order-${order.orderId}`; // Asigna un ID único a cada orden para futuras actualizaciones

    // Asegúrate de que order.side y order.status tienen los valores esperados del backend.
    // Si tu backend usa 'BUY'/'SELL' en lugar de 'Buy'/'Sell', ajústalo aquí.
    const typeClass = order.side === 'Buy' ? 'text-green-400' : 'text-red-400';
    const statusClass = order.status === 'Filled' ? 'text-green-300' :
                        order.status === 'Canceled' || order.status === 'Partially Canceled' ? 'text-red-300' : 'text-yellow-300'; // 'Open' y 'Partially Filled' serán amarillos

    orderDiv.innerHTML = `
        <div>
            <div class="${typeClass}">${order.side} ${order.symbol.replace('_', '/')}</div>
            <div class="text-gray-300">${new Date(order.orderTime).toLocaleString()}</div>
        </div>
        <div>
            <div>Amount: ${parseFloat(order.notional).toFixed(2)} USDT</div>
            <div>Price: ${parseFloat(order.price).toFixed(2)}</div>
        </div>
        <div class="${statusClass}">${order.status}</div>
    `;
    return orderDiv;
}

/**
 * Actualiza un elemento de orden existente en el DOM.
 * @param {Object} updatedOrder El objeto de la orden actualizada.
 */
export function updateOrderElement(updatedOrder) {
    const existingOrderElement = document.getElementById(`order-${updatedOrder.orderId}`);
    if (existingOrderElement) {
        // Actualiza el contenido HTML del elemento existente
        const typeClass = updatedOrder.side === 'Buy' ? 'text-green-400' : 'text-red-400';
        const statusClass = updatedOrder.status === 'Filled' ? 'text-green-300' :
                            updatedOrder.status === 'Canceled' || updatedOrder.status === 'Partially Canceled' ? 'text-red-300' : 'text-yellow-300';

        existingOrderElement.innerHTML = `
            <div>
                <div class="${typeClass}">${updatedOrder.side} ${updatedOrder.symbol.replace('_', '/')}</div>
                <div class="text-gray-300">${new Date(updatedOrder.orderTime).toLocaleString()}</div>
            </div>
            <div>
                <div>Amount: ${parseFloat(updatedOrder.notional).toFixed(2)} USDT</div>
                <div>Price: ${parseFloat(updatedOrder.price).toFixed(2)}</div>
            </div>
            <div class="${statusClass}">${updatedOrder.status}</div>
        `;
        displayLogMessage(`Order ${updatedOrder.orderId} updated to status: ${updatedOrder.status}`, 'info');

        // Después de actualizar, re-filtrar y re-mostrar para asegurar que la orden esté en la pestaña correcta.
        // Esto es crucial para que una orden 'Open' que se convierte en 'Filled' desaparezca de 'Opened' y aparezca en 'Filled'.
        fetchOrders(currentActiveOrderTabId);

    } else {
        // Si la orden no existe, puede que sea nueva o que estemos en una pestaña diferente.
        // Forzamos un fetch completo para la pestaña actual para asegurar consistencia.
        displayLogMessage(`Order ${updatedOrder.orderId} not found, re-fetching current tab.`, 'info');
        fetchOrders(currentActiveOrderTabId);
    }
}