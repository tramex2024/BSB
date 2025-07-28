// public/js/modules/orders.js
import { isLoggedIn, fetchFromBackend, displayLogMessage } from './auth.js'; // Importa isLoggedIn y fetchFromBackend
import { TRADE_SYMBOL } from '../main.js'; // Importa TRADE_SYMBOL

export let currentTab = 'opened'; // Este estado es específico de las órdenes
export const currentDisplayedOrders = new Map(); // El Map para seguir las órdenes mostradas

export function createOrderElement(order) {
    const orderDiv = document.createElement('div');
    orderDiv.className = 'bg-gray-700 p-3 rounded-md border border-gray-600';
    orderDiv.id = `order-${order.orderId}`;
    orderDiv.dataset.orderId = order.orderId;
    return orderDiv;
}

export function updateOrderElement(orderDiv, order) {
    // Determine the state string and color based on BitMart's 'state' field (corrected from 'status')
    const orderStatus = order.state ? String(order.state).toLowerCase() : (currentTab === 'opened' ? 'open' : 'unknown');
    let stateText = orderStatus.toUpperCase();
    let stateColorClass = 'text-gray-400';

    if (orderStatus === 'filled') {
        stateText = 'FILLED';
        stateColorClass = 'text-green-400';
    } else if (orderStatus === 'partially_canceled') {
        stateText = 'PARTIALLY CANCELED';
        stateColorClass = 'text-red-400';
    } else if (orderStatus === 'canceled') {
        stateText = 'CANCELED';
        stateColorClass = 'text-red-400';
    } else if (orderStatus === 'new' || orderStatus === 'partiallyfilled' || orderStatus === 'pendingcancel') {
        stateText = orderStatus.toUpperCase();
        stateColorClass = 'text-yellow-400';
    } else if (orderStatus === 'rejected') {
        stateText = 'REJECTED';
        stateColorClass = 'text-red-600';
    } else if (currentTab === 'opened') {
        stateText = 'OPEN';
        stateColorClass = 'text-yellow-400';
    } else {
        stateText = 'UNKNOWN';
        stateColorClass = 'text-gray-500';
    }

    orderDiv.innerHTML = `
        <div class="flex justify-between items-center mb-1">
            <span class="font-bold">${order.symbol || 'N/A'}</span>
            <span class="${order.side && order.side.toLowerCase() === 'buy' ? 'text-green-400' : 'text-red-400'}">${(order.side || 'N/A').toUpperCase()}</span>
            <span>${(order.type || 'N/A').toUpperCase()}</span>
        </div>
        <div class="flex justify-between text-xs text-gray-300">
            <span>Price: ${parseFloat(order.price || '0').toFixed(8)}</span>
            <span>Size: ${parseFloat(order.size || '0').toFixed(8)}</span>
            <span>Filled: ${parseFloat(order.filledSize || '0').toFixed(8)}</span>
            <span>State: <span class="${stateColorClass}">${stateText}</span></span>
        </div>
        <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>Order ID: ${order.orderId || 'N/A'}</span>
            <span>Time: ${order.createTime ? new Date(parseInt(order.createTime)).toLocaleString() : 'N/A'}</span>
        </div>
    `;
}

// **[IMPORTANTE]** Aquí va la versión mejorada de displayOrders
export function displayOrders(newOrders, tab) {
    const orderListDiv = document.getElementById('order-list');
    if (!orderListDiv) {
        console.error("displayOrders: Target element #order-list not found.");
        return;
    }

    if (!Array.isArray(newOrders)) {
        console.error("displayOrders received non-array data:", newOrders);
        orderListDiv.innerHTML = `<p class="text-red-400">Error: Failed to display orders. Data format incorrect.</p>`;
        currentDisplayedOrders.clear();
        displayLogMessage("Error: Failed to display orders. Invalid data format.", "error");
        return;
    }

    const incomingOrderIds = new Set(newOrders.map(order => order.orderId));
    const tempElementsToRemove = [];

    currentDisplayedOrders.forEach((orderElement, orderId) => {
        if (!incomingOrderIds.has(orderId) || !orderListDiv.contains(orderElement)) {
            tempElementsToRemove.push(orderElement);
        }
    });

    tempElementsToRemove.forEach(orderElement => {
        if (orderElement.parentNode === orderListDiv) {
            orderListDiv.removeChild(orderElement);
        }
        currentDisplayedOrders.delete(orderElement.dataset.orderId);
    });

    newOrders.forEach(order => {
        let orderElement = currentDisplayedOrders.get(order.orderId);

        if (orderElement) {
            updateOrderElement(orderElement, order);
            if (!orderListDiv.contains(orderElement)) {
                orderListDiv.appendChild(orderElement);
                console.warn(`Re-attached existing order element ${order.orderId}.`);
            }
        } else {
            orderElement = createOrderElement(order);
            updateOrderElement(orderElement, order);
            orderListDiv.appendChild(orderElement);
        }
        currentDisplayedOrders.set(order.orderId, orderElement);
        orderElement.dataset.orderId = order.orderId;
    });

    if (newOrders.length === 0) {
        if (!orderListDiv.innerHTML.includes('No orders found')) {
            orderListDiv.innerHTML = `<p class="text-gray-400">No orders found for the "${tab}" tab.</p>`;
        }
        displayLogMessage(`No orders found for the "${tab}" tab.`, "info");
    } else {
        const currentContent = orderListDiv.innerHTML.trim();
        const hasSpecificMessages = currentContent.includes('Loading orders') || currentContent.includes('No orders found');

        const hasOnlyPlaceholders = orderListDiv.children.length === 1 &&
                                    (orderListDiv.firstElementChild.classList.contains('text-gray-400') ||
                                     orderListDiv.firstElementChild.classList.contains('text-red-400') ||
                                     orderListDiv.firstElementChild.textContent.includes('Loading orders') ||
                                     orderListDiv.firstElementChild.textContent.includes('No orders found'));

        if (hasSpecificMessages || hasOnlyPlaceholders) {
            orderListDiv.innerHTML = '';
        }
        displayLogMessage(`Successfully loaded ${newOrders.length} ${tab} orders.`, "success");
    }
}

export async function fetchOpenOrdersData() {
    if (!isLoggedIn) {
        displayLogMessage("Login required to fetch open orders.", "warning");
        return [];
    }
    try {
        const response = await fetchFromBackend(`/api/user/bitmart/open-orders?symbol=${TRADE_SYMBOL}`);
        if (response && Array.isArray(response.orders)) {
            const openOrdersData = response.orders;
            displayOrders(openOrdersData, 'opened');
            if (openOrdersData.length === 0) {
                displayLogMessage('No open orders found for ' + TRADE_SYMBOL + '.', 'info');
            } else {
                displayLogMessage('Open orders loaded successfully for ' + TRADE_SYMBOL + '.', 'success');
            }
        } else {
            console.warn('fetchOpenOrdersData: Backend response was null/undefined or did not contain an array of orders as expected.', response);
            displayOrders([], 'opened');
            displayLogMessage('No open orders found or unexpected response from backend.', 'warning');
        }
    } catch (error) {
        console.error('Error fetching open orders:', error);
        displayLogMessage('Error fetching open orders: ' + error.message, 'error');
        displayOrders([], 'opened');
    }
}

export async function fetchHistoryOrdersData(tab) {
    if (!isLoggedIn) {
        displayLogMessage("Login required to fetch historical orders.", "warning");
        return [];
    }
    try {
        const now = Date.now();
        const defaultEndTime = now;
        const defaultStartTime = now - (90 * 24 * 60 * 60 * 1000); // 90 días en milisegundos

        const queryParams = new URLSearchParams({
            symbol: TRADE_SYMBOL,
            orderMode: 'spot',
            startTime: defaultStartTime,
            endTime: defaultEndTime,
            limit: 200
        }).toString();

        const response = await fetchFromBackend(`/api/user/bitmart/history-orders?${queryParams}`);
        if (!response || !Array.isArray(response)) {
            console.warn("fetchHistoryOrdersData: Backend response was null/undefined or not an array for history.");
            displayLogMessage("No historical orders found or unexpected response.", "info");
            return [];
        }
        return response || [];
    } catch (error) {
        console.error("Error fetching historical orders data:", error);
        displayLogMessage(`Error fetching historical orders: ${error.message}`, "error");
        return [];
    }
}

export async function fetchOrders(tab) {
    const orderListDiv = document.getElementById('order-list');
    if (!orderListDiv) return;

    if (!isLoggedIn) {
        orderListDiv.innerHTML = `<p class="text-gray-400">Please login to view order history.</p>`;
        currentDisplayedOrders.clear();
        displayLogMessage("Please login to view order history.", "info");
        return;
    }

    const shouldFullRefresh = (currentTab !== tab) || (currentDisplayedOrders.size === 0 && orderListDiv.children.length === 0);

    if (shouldFullRefresh) {
        orderListDiv.innerHTML = '<p class="text-gray-400">Loading orders...</p>';
        currentDisplayedOrders.clear();
        displayLogMessage(`Loading ${tab} orders...`, "info");
    }

    currentTab = tab; // Update currentTab for this module

    let orders = [];

    try {
        if (tab === 'opened') {
            const response = await fetchFromBackend(`/api/user/bitmart/open-orders?symbol=${TRADE_SYMBOL}`);
            orders = (response && Array.isArray(response.orders)) ? response.orders : [];
        } else {
            const historyOrdersRaw = await fetchHistoryOrdersData(tab);
            const historyOrders = Array.isArray(historyOrdersRaw) ? historyOrdersRaw : [];

            if (tab === 'filled') {
                orders = historyOrders.filter(order => order.state === 'filled');
            } else if (tab === 'cancelled') {
                orders = historyOrders.filter(order => order.state === 'partially_canceled' || order.state === 'canceled');
            } else if (tab === 'all') {
                orders = historyOrders;
            }
        }
    } catch (error) {
        console.error(`Failed to fetch orders for tab ${tab}:`, error);
        orderListDiv.innerHTML = `<p class="text-red-400">Failed to load orders for this tab. Please check console for details.</p>`;
        displayLogMessage(`Failed to load orders for "${tab}" tab.`, "error");
        orders = [];
    }

    displayOrders(orders, tab);
}

export function setActiveTab(tabId) {
    document.querySelectorAll('#autobot-section .border-b-2').forEach(button => {
        button.classList.remove('active-tab', 'border-white');
        button.classList.add('border-transparent');
    });
    const activeButton = document.getElementById(tabId);
    if (activeButton) {
        activeButton.classList.add('active-tab', 'border-white');
        activeButton.classList.remove('border-transparent');
        currentTab = tabId.replace('tab-', ''); // Actualiza el currentTab exportado
        fetchOrders(currentTab);
        displayLogMessage(`Viewing ${currentTab} orders.`, 'info');
    }
}