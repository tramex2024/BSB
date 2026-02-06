// public/js/modules/orders.js (VERSIÓN FINAL CON SOPORTE WS)

import { fetchFromBackend } from './api.js';

// URL base de tu backend en Render
const RENDER_BACKEND_URL = 'https://bsb-ppex.onrender.com';

/**
 * Función para crear un elemento HTML para una sola orden.
 * @param {object} order La orden a renderizar.
 * @param {string} orderType El tipo de orden ('opened', 'filled', 'cancelled', 'all').
 * @returns {string} El HTML para la orden.
 */
function createOrderHtml(order, orderType) {
    const isBuy = order.side.toLowerCase() === 'buy';
    const sideClass = isBuy ? 'text-green-500' : 'text-red-500';
    
    // CORRECCIÓN CLAVE 1: Mostrar el estado real de la orden (NEW, PENDING, FILLED, etc.).
    const actualStatus = order.state || order.status || orderType;
    const statusText = actualStatus.replace(/_/g, ' ').toUpperCase(); // Muestra PENDING, NEW, PARTIALLY FILLED, etc.
    
    // CORRECCIÓN: Usar 'order_id' o 'orderId' para mayor compatibilidad
    const orderId = order.orderId || order.order_id || 'N/A';
    
    // CORRECCIÓN: Usar 'create_time' o 'createTime'
    const date = new Date(order.createTime || order.create_time).toLocaleString();
    
    // Convertir el precio y la cantidad a números para un formato limpio.
    const price = parseFloat(order.price || order.filled_price).toFixed(2);
    // Usar 'size' para órdenes abiertas y 'filledSize' para el historial
    const quantity = parseFloat(order.filled_size || order.size).toFixed(8);
    const symbol = order.symbol;

    return `
        <div class="bg-gray-800 p-4 rounded-lg shadow-lg mb-2 flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div class="flex-1 mb-2 sm:mb-0 text-center flex flex-col items-center">
                <span class="font-semibold text-sm sm:text-base mb-1 ${sideClass}">${order.side.toUpperCase()}</span>
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
                <p>ID: ${orderId}</p>
                <p>${date}</p>
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
            // Pasamos 'opened' como tipo para que se muestre el status "Opened"
            // Ahora createOrderHtml toma el estado real si está disponible.
            const orderHtml = createOrderHtml(order, orderType); 
            orderListElement.innerHTML += orderHtml;
        });
    } else {
        orderListElement.innerHTML = `<p class="text-gray-500 text-center py-4">No hay órdenes de tipo "${orderType}" para mostrar.</p>`;
    }
}

/**
 * Obtiene las órdenes del backend y las muestra (USADO SOLO PARA HISTORIAL: filled, cancelled, all).
 * La pestaña 'opened' ahora usa WebSockets.
 * @param {string} status El estado de la orden a buscar ('opened', 'filled', 'cancelled', 'all').
 * @param {HTMLElement} orderListElement El elemento HTML donde mostrar las órdenes.
 */
export async function fetchOrders(status, orderListElement) {
    // 🛑 Para la pestaña 'opened', no hacemos nada ya que esperamos el WS.
    if (status === 'opened') {
        console.log("Petición REST para órdenes abiertas ignorada. Usando WebSockets.");
        // Opcional: mostrar un spinner mientras se esperan los datos del socket
        orderListElement.innerHTML = `<p class="text-gray-500 text-center py-4">Cargando órdenes abiertas en tiempo real...</p>`;
        return;
    }
    
    const authToken = localStorage.getItem('token');
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
        
        let ordersToDisplay = [];

        // CORRECCIÓN: Unificar el formato de los datos (el backend a veces los envuelve en un objeto 'orders')
        if (orders && orders.orders) {
            ordersToDisplay = orders.orders;
        } else if (Array.isArray(orders)) {
            ordersToDisplay = orders;
        }

        // 🛑 FILTRO DEFENSIVO: Filtro del lado del cliente para asegurar que solo se muestren 
        // las órdenes del estado seleccionado ('filled' o 'cancelled'), en caso de que 
        // el backend devuelva un historial completo sin filtrar.
        if (status !== 'all' && ordersToDisplay.length > 0) {
            const targetStatus = status.toLowerCase(); // 'filled' o 'cancelled'

            ordersToDisplay = ordersToDisplay.filter(order => {
                // Buscamos una propiedad de estado que contenga la palabra clave del target.
                // Usamos 'state' o 'status' para verificar el estado de la orden histórica.
                const orderState = String(order.state || order.status || '').toLowerCase();
                
                if (targetStatus === 'filled') {
                    // Estado 'FILLED' (llena) o si la cantidad llenada coincide con la cantidad total (orden completamente llena)
                    return orderState.includes('fill') || (parseFloat(order.filled_size) > 0 && parseFloat(order.filled_size) === parseFloat(order.size));
                }
                
                if (targetStatus === 'cancelled') {
                    // Estado 'CANCELED' (cancelada)
                    return orderState.includes('cancel');
                }
                
                return false; // No mostrar si no coincide con 'filled' o 'cancelled' y el status no es 'all'
            });
        }

        displayOrders(ordersToDisplay, orderListElement, status);

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
    // Asume que los tabs de las órdenes son globales o los busca dentro de la sección activa.
    const tabs = document.querySelectorAll('[id^="tab-"]'); 
    tabs.forEach(tab => tab.classList.remove('active-tab'));
    
    const activeTab = document.getElementById(tabId);
    if (activeTab) {
        activeTab.classList.add('active-tab');
    }
}

/**
 * Función para recibir órdenes abiertas desde el WebSocket y mostrarlas.
 * Esta función es llamada desde main.js cuando se recibe el evento 'open-orders-update'.
 * 🛑 MODIFICACIÓN: Ahora recibe explícitamente el ID del contenedor de órdenes
 * y la pestaña activa del módulo llamador para evitar el error de DOM no encontrado.
 * @param {object | Array<object>} ordersData Las órdenes abiertas recibidas del backend via WS.
 * @param {string} listElementId El ID del elemento HTML donde se deben mostrar las órdenes (ej. 'au-order-list').
 * @param {string} activeOrderTab El estado de la pestaña activa del módulo llamador (ej. 'opened', 'filled').
 */
export function updateOpenOrdersTable(ordersData, listElementId, activeOrderTab) {
    // 🛑 Modificación: Obtener el elemento usando el ID pasado como argumento.
    const orderListElement = document.getElementById(listElementId);

    // 🛑 CORRECCIÓN CLAVE 2: Extraer el array y establecer un filtro defensivo.
    let openOrders = ordersData;
    if (ordersData && ordersData.orders && Array.isArray(ordersData.orders)) {
        openOrders = ordersData.orders;
    } else if (!Array.isArray(ordersData)) {
        openOrders = [];
    }

    // 🛑 FILTRO CLAVE: Aseguramos que solo se muestren los estados que consideramos "abiertos".
    const validOpenStatuses = ['new', 'partially_filled', 'open', 'pending'];
    
    openOrders = openOrders.filter(order => {
        // Usamos 'state' o 'status' para verificar el estado de la orden.
        const orderState = String(order.state || order.status || '').toLowerCase().replace(/_/g, ' ');

        // Verificamos si el estado contiene alguna palabra clave de orden abierta.
        return validOpenStatuses.some(status => orderState.includes(status));
    });

    // 🛑 CORRECCIÓN CRÍTICA DE FLUJO: Solo actualizar si la pestaña 'opened' está activa y si el elemento existe.
    if (activeOrderTab === 'opened') {
        if (orderListElement) {
            // El elemento de la lista ahora es el que se pasó por argumento.
            displayOrders(openOrders, orderListElement, 'opened');
        } else {
            // Muestra el error con el ID faltante
             console.error(`Error de DOM: El contenedor con ID "${listElementId}" no fue encontrado al actualizar órdenes abiertas.`);
        }
    }
}