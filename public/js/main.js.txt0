// public/js/main.js (CORREGIDO)

const BACKEND_URL = 'https://bsb-ppex.onrender.com';
const TRADE_SYMBOL = 'BTC_USDT'; // Define el símbolo para las órdenes

// --- Elementos del DOM ---
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const tokenInput = document.getElementById('token');
const authButton = document.getElementById('auth-button');
const authMessage = document.getElementById('auth-message');
const loginLogoutIcon = document.getElementById('login-logout-icon');
const apiKeyIcon = document.getElementById('api-key-icon');

const apiModal = document.getElementById('api-modal');
const closeApiModalButton = apiModal ? apiModal.querySelector('.close-button') : null;
const apiForm = document.getElementById('api-form');
const apiKeyInput = document.getElementById('api-key');
const secretKeyInput = document.getElementById('secret-key');
const apiMemoInput = document.getElementById('api-memo');
const apiStatusMessage = document.getElementById('api-status-message');
const connectionIndicator = document.getElementById('connection-indicator');
const connectionText = document.getElementById('connection-text');


// Inputs de configuración del bot
const purchaseInput = document.getElementById("purchase");
const incrementInput = document.getElementById("increment");
const decrementInput = document.getElementById("decrement");
const triggerInput = document.getElementById("trigger");
const stopAtCycleEndCheckbox = document.getElementById('stop-at-cycle-end');
const botStateDisplay = document.getElementById('bot-state');
const cycleDisplay = document.getElementById('cycle');
const profitDisplay = document.getElementById('profit');
const cycleProfitDisplay = document.getElementById('cycleprofit');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');


// --- Estado de la Aplicación ---
let isLoggedIn = false;
let isRunning = false;
let ultimoCoverageValido = 0.00;
let currentTab = 'opened';
let currentDisplayedOrders = new Map();

// --- FUNCIONES DE AUTENTICACIÓN Y ESTADO DEL USUARIO ---

/**
 * Verifica si el usuario está logueado comprobando un token en localStorage.
 * Actualiza la variable `isLoggedIn` y el icono de login.
 */
function checkLoginStatus() {
    const token = localStorage.getItem('authToken');
    if (token) {
        isLoggedIn = true;
    } else {
        isLoggedIn = false;
    }
    updateLoginIcon();
}

/**
 * Actualiza la apariencia del icono de login/logout y su título
 * basado en el estado `isLoggedIn`.
 */
function updateLoginIcon() {
    if (loginLogoutIcon) {
        if (isLoggedIn) {
            loginLogoutIcon.classList.remove('fa-sign-in-alt');
            loginLogoutIcon.classList.add('fa-sign-out-alt'); // Icono de "logout"
            loginLogoutIcon.title = 'Logout';
        } else {
            loginLogoutIcon.classList.remove('fa-sign-out-alt');
            loginLogoutIcon.classList.add('fa-sign-in-alt'); // Icono de "login"
            loginLogoutIcon.title = 'Login';
        }
    }
}

/**
 * Muestra u oculta el modal de autenticación (login/registro).
 * @param {boolean} show - `true` para mostrar el modal, `false` para ocultarlo.
 */
function toggleAuthModal(show) {
    if (authModal) {
        if (show) {
            authModal.style.display = 'flex'; // Usar 'flex' para centrado CSS
            authMessage.textContent = '';
            emailInput.value = '';
            tokenInput.value = '';
            tokenInput.style.display = 'none';
            emailInput.disabled = false;
            authButton.textContent = 'Continue';
        } else {
            authModal.style.display = 'none';
        }
    }
}

/**
 * Muestra u oculta el modal de configuración de API.
 * @param {boolean} show - `true` para mostrar el modal, `false` para ocultarlo.
 */
function toggleApiModal(show) {
    if (apiModal) {
        if (show) {
            apiModal.style.display = 'flex'; // Usar 'flex' para centrado CSS
            apiStatusMessage.textContent = '';
            // Reset connection indicator to gray/not connected when opening
            connectionIndicator.classList.remove('bg-green-500', 'bg-red-500', 'bg-yellow-500');
            connectionIndicator.classList.add('bg-gray-500');
            connectionText.textContent = 'Not Connected';
            // Secret key input should always be cleared for security reasons
            secretKeyInput.value = '';
        } else {
            apiModal.style.display = 'none';
        }
    }
}

/**
 * Maneja el proceso de deslogueo del usuario.
 * Borra el token local y notifica al backend.
 */
async function handleLogout() {
    console.log('[FRONTEND] Intentando desloguear...');
    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (response.ok) {
            console.log('[FRONTEND] Deslogueo en backend exitoso:', data.message);
        } else {
            console.error('[FRONTEND] Error en deslogueo de backend:', data.message || 'Error desconocido');
        }
    } catch (error) {
        console.error('[FRONTEND] Falló la llamada al backend para deslogueo:', error);
    } finally {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        isLoggedIn = false;
        updateLoginIcon();
        toggleAuthModal(false);
        alert('Has cerrado sesión exitosamente.');
        window.location.reload();
    }
}

// --- Helper Function for API Calls (Maneja tokens y rutas dinámicas) ---
async function fetchFromBackend(url, options = {}) {
    try {
        const token = localStorage.getItem('authToken');
        if (token) {
            options.headers = {
                ...options.headers,
                'Authorization': `Bearer ${token}`
            };
        }

        const res = await fetch(`${BACKEND_URL}${url}`, options);

        if (!res.ok) {
            let errorDetails = `HTTP error! status: ${res.status}`;
            try {
                const errorData = await res.json();
                errorDetails = errorData.error || errorData.message || JSON.stringify(errorData);
            } catch (jsonError) {
                errorDetails = await res.text() || `HTTP error! status: ${res.status} (non-JSON response or empty)`;
            }

            if (res.status === 401 || res.status === 403) {
                console.warn("Token inválido o expirado. Iniciando deslogueo automático.");
                alert("Tu sesión ha expirado o no es válida. Por favor, inicia sesión de nuevo.");
                handleLogout(); // Llama a la función de deslogueo
            }
            throw new Error(errorDetails);
        }
        return await res.json();
    } catch (error) {
        console.error(`Error fetching from ${url}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error || "Unknown error occurred.");
        if (document.getElementById('order-list')) {
            document.getElementById('order-list').innerHTML = `<p class="text-red-400">Error: ${errorMessage}</p>`;
        }
        return null; // Ensure null is returned on error
    }
}


// --- Funciones de Display para Órdenes ---
function createOrderElement(order) {
    const orderDiv = document.createElement('div');
    orderDiv.className = 'bg-gray-700 p-3 rounded-md border border-gray-600';
    orderDiv.id = `order-${order.orderId}`;
    orderDiv.dataset.orderId = order.orderId;
    return orderDiv;
}

function updateOrderElement(orderDiv, order) {
    // Determine the state string and color based on BitMart's 'state' field (corrected from 'status')
    const orderStatus = order.state ? String(order.state).toLowerCase() : (currentTab === 'opened' ? 'open' : 'unknown');
    let stateText = orderStatus.toUpperCase(); // Default to uppercase of actual state
    let stateColorClass = 'text-gray-400'; // Default neutral color

    if (orderStatus === 'filled') { // Exact match from API response
        stateText = 'FILLED';
        stateColorClass = 'text-green-400';
    } else if (orderStatus === 'partially_canceled') { // Exact match from API response
        stateText = 'PARTIALLY CANCELED';
        stateColorClass = 'text-red-400';
    } else if (orderStatus === 'canceled') { // Possible state for fully canceled (verify with API if needed)
        stateText = 'CANCELED';
        stateColorClass = 'text-red-400';
    } else if (orderStatus === 'new' || orderStatus === 'partiallyfilled' || orderStatus === 'pendingcancel' || orderStatus === 'open') {
        stateText = orderStatus.toUpperCase(); // Display actual status from BitMart (e.g., 'NEW', 'PARTIALLYFILLED')
        stateColorClass = 'text-yellow-400';
    } else if (orderStatus === 'rejected') {
        stateText = 'REJECTED';
        stateColorClass = 'text-red-600';
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

function displayOrders(newOrders, tab) {
    const orderListDiv = document.getElementById('order-list');
    if (!orderListDiv) return;

    // Check if newOrders is actually an array before mapping
    if (!Array.isArray(newOrders)) {
        console.error("displayOrders received non-array data:", newOrders);
        orderListDiv.innerHTML = `<p class="text-red-400">Error: Failed to display orders. Data format incorrect.</p>`;
        currentDisplayedOrders.clear();
        return;
    }

    // Clear existing orders only if the tab changed or no new orders are provided
    if (newOrders.length === 0) {
        if (currentDisplayedOrders.size === 0 || currentTab !== tab) {
            orderListDiv.innerHTML = `<p class="text-gray-400">No orders found for the "${tab}" tab.</p>`;
        }
        currentDisplayedOrders.clear();
        return;
    }

    const incomingOrderIds = new Set(newOrders.map(order => order.orderId));
    const ordersToRemove = [];

    currentDisplayedOrders.forEach((orderElement, orderId) => {
        if (!incomingOrderIds.has(orderId)) {
            ordersToRemove.push(orderElement);
        }
    });

    ordersToRemove.forEach(orderElement => {
        orderListDiv.removeChild(orderElement);
        currentDisplayedOrders.delete(orderElement.dataset.orderId);
    });

    newOrders.forEach(order => {
        let orderElement = document.getElementById(`order-${order.orderId}`);
        if (orderElement) {
            updateOrderElement(orderElement, order);
        } else {
            orderElement = createOrderElement(order);
            updateOrderElement(orderElement, order);
            orderListDiv.appendChild(orderElement);
        }
        currentDisplayedOrders.set(order.orderId, orderElement);
    });

    // Ensure message if no orders are found after update
    if (currentDisplayedOrders.size === 0 && newOrders.length === 0) {
        orderListDiv.innerHTML = `<p class="text-gray-400">No orders found for the "${tab}" tab.</p>`;
    }
}


// --- Funciones para Obtener Datos de BitMart (Ajustadas para usar ruta /api/user/...) ---

async function getBalances() {
    if (!isLoggedIn) {
        if (document.getElementById('balance')) {
            document.getElementById('balance').textContent = 'Login to see';
        }
        return;
    }
    try {
        const walletData = await fetchFromBackend('/api/user/bitmart/balance');
        if (walletData && Array.isArray(walletData)) {
            const usdt = walletData.find(w => w.currency === "USDT");
            const balance = usdt ? parseFloat(usdt.available).toFixed(2) : '0.00';
            if (document.getElementById('balance')) {
                document.getElementById('balance').textContent = balance;
                actualizarCalculos();
            }
        } else {
            if (document.getElementById('balance')) {
                document.getElementById('balance').textContent = 'Error fetching balances.';
            }
            console.error('getBalances: Respuesta inesperada del backend:', walletData);
        }
    } catch (error) {
        console.error('Error al cargar balances:', error);
        if (document.getElementById('balance')) {
            document.getElementById('balance').textContent = 'Error';
        }
    }
}

async function fetchOpenOrdersData() {
    if (!isLoggedIn) {
        return [];
    }
    try {
        const response = await fetchFromBackend(`/api/user/bitmart/open-orders?symbol=${TRADE_SYMBOL}`);
        // Ensure response is valid before accessing .orders
        if (!response || !response.orders) {
            console.warn("fetchOpenOrdersData: Backend response was null/undefined or missing 'orders'.");
            return [];
        }
        // BitMart V4 open orders do not have a 'status' field in the same way historical orders do.
        // We'll implicitly consider them 'open' or 'new'.
        // The backend returns { success: true, orders: [...] }
        const openOrders = response.orders || [];
        return openOrders;
    } catch (error) {
        console.error("Error fetching open orders data:", error);
        return [];
    }
}

async function fetchHistoryOrdersData(tab) {
    if (!isLoggedIn) {
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
            limit: 200 // BitMart V4 historical orders default limit is 200
        }).toString();

        const response = await fetchFromBackend(`/api/user/history-orders?${queryParams}`);
        // Ensure response is valid before accessing .orders
        if (!response || !response.orders) {
            console.warn("fetchHistoryOrdersData: Backend response was null/undefined or missing 'orders'.");
            return [];
        }
        return response.orders || [];
    } catch (error) {
        console.error("Error fetching historical orders data:", error);
        return [];
    }
}

async function fetchOrders(tab) {
    const orderListDiv = document.getElementById('order-list');
    if (!orderListDiv) return;

    if (!isLoggedIn) {
        orderListDiv.innerHTML = `<p class="text-gray-400">Please login to view order history.</p>`;
        currentDisplayedOrders.clear();
        return;
    }

    if (currentDisplayedOrders.size === 0 || currentTab !== tab) {
        orderListDiv.innerHTML = '<p class="text-gray-400">Loading orders...</p>';
        currentDisplayedOrders.clear();
    }

    let orders = []; // Always initialize as an array

    try {
        if (tab === 'opened') {
            const fetchedOrders = await fetchOpenOrdersData();
            // Ensure fetchedOrders is an array before assigning
            orders = Array.isArray(fetchedOrders) ? fetchedOrders : [];
        } else {
            const historyOrdersRaw = await fetchHistoryOrdersData(tab);
            // Ensure historyOrdersRaw is an array before processing
            const historyOrders = Array.isArray(historyOrdersRaw) ? historyOrdersRaw : [];

            if (tab === 'filled') {
                // CORRECTED: Use 'order.state' and the exact 'filled' string from your API response
                orders = historyOrders.filter(order => order.state === 'filled');
            } else if (tab === 'cancelled') {
                // CORRECTED: Use 'order.state' and the exact 'partially_canceled' string.
                // Added 'canceled' as a possibility for fully canceled orders.
                orders = historyOrders.filter(order => order.state === 'partially_canceled' || order.state === 'canceled');
            } else if (tab === 'all') {
                orders = historyOrders;
            }
        }
    } catch (error) {
        console.error(`Failed to fetch orders for tab ${tab}:`, error);
        orderListDiv.innerHTML = `<p class="text-red-400">Failed to load orders for this tab. Please check console for details.</p>`;
        // Crucial: Set orders to an empty array on error to prevent subsequent map error
        orders = [];
    }

    // Now, 'orders' is guaranteed to be an array (even if empty)
    displayOrders(orders, tab);
}

// --- Otras Funciones del Bot ---

async function cargarPrecioEnVivo() {
    try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const data = await res.json();
        const price = parseFloat(data.price).toFixed(2);
        if (document.getElementById('price')) {
            document.getElementById('price').textContent = price + ' USDT';
            actualizarCalculos();
        }
    }
    catch (error) {
        console.error('Error al cargar precio en vivo:', error);
        if (document.getElementById('price')) {
            document.getElementById('price').textContent = 'Error';
        }
    }
}

async function checkConnection() {
    try {
        const response = await fetchFromBackend('/ping');
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');

        if (dot && text) {
            if (response && response.status === 'ok') {
                dot.classList.replace('bg-red-500', 'bg-green-500');
                text.textContent = 'Connected';
            } else {
                throw new Error('Backend did not return OK status');
            }
        }
    } catch (error) {
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        if (dot && text) {
            dot.classList.replace('bg-green-500', 'bg-red-500');
            text.textContent = 'Disconnected';
        }
        console.error('Connection check failed:', error);
    }
}

function calcularORQ(purchase, increment, balance) {
    let total = 0;
    let n = 0;
    while (true) {
        const nextOrder = purchase * Math.pow(increment / 100, n);
        if (total + nextOrder <= balance) {
            total += nextOrder;
            n++;
        } else break;
    }
    return n;
}

function calcularCoverage(orq, price, decrement) {
    if (orq === 0) return 0;
    return price * Math.pow(1 - decrement / 100, orq - 1);
}

function actualizarCalculos() {
    if (!purchaseInput || !incrementInput || !decrementInput || !document.getElementById("price") || !document.getElementById("balance") || !document.getElementById("orq") || !document.getElementById("coverage")) {
        console.warn("Faltan elementos DOM para actualizar cálculos.");
        return;
    }

    const purchase = parseFloat(purchaseInput.value) || 0;
    const increment = parseFloat(incrementInput.value) || 100;
    const decrement = parseFloat(decrementInput.value) || 1;
    const priceText = document.getElementById("price").textContent;
    const price = parseFloat(priceText.replace(' USDT', '')) || 0;
    const balanceText = document.getElementById("balance").textContent;
    const balance = balanceText === 'Login to see' ? 0 : parseFloat(balanceText) || 0;

    const orq = calcularORQ(purchase, increment, balance);
    const coverage = calcularCoverage(orq, price, decrement);

    document.getElementById("orq").textContent = orq;
    document.getElementById("coverage").textContent = coverage.toFixed(2);
    ultimoCoverageValido = coverage;
}

/**
 * Carga la configuración y el estado del bot del usuario desde el backend
 * y actualiza los elementos de la UI.
 */
async function loadBotConfigAndState() {
    if (!isLoggedIn) {
        console.log('[FRONTEND] No logueado, no se carga la configuración del bot.');
        if (botStateDisplay) botStateDisplay.textContent = 'STOPPED';
        if (botStateDisplay) botStateDisplay.className = 'text-yellow-400';
        if (startBtn) startBtn.textContent = 'START';
        if (resetBtn) resetBtn.disabled = false;
        if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.disabled = false;
        if (cycleDisplay) cycleDisplay.textContent = '0';
        if (profitDisplay) profitDisplay.textContent = '0.00';
        if (cycleProfitDisplay) cycleProfitDisplay.textContent = '0.00';
        return;
    }

    console.log('[FRONTEND] Cargando configuración y estado del bot...');
    try {
        const botData = await fetchFromBackend('/api/user/bot-config-and-state');
        if (botData) {
            console.log('[FRONTEND] Datos del bot cargados:', botData);

            if (purchaseInput) purchaseInput.value = botData.purchase || 5.00;
            if (incrementInput) incrementInput.value = botData.increment || 100;
            if (decrementInput) decrementInput.value = botData.decrement || 1.0;
            if (triggerInput) triggerInput.value = botData.trigger || 1.5;
            if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.checked = botData.stopAtCycleEnd || false;

            isRunning = (botData.state === 'RUNNING');
            if (botStateDisplay) {
                botStateDisplay.textContent = botData.state;
                botStateDisplay.className = isRunning ? 'text-green-400' : 'text-yellow-400';
            }
            if (startBtn) startBtn.textContent = isRunning ? 'STOP' : 'START';
            if (resetBtn) resetBtn.disabled = isRunning;
            if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.disabled = isRunning;

            if (cycleDisplay) cycleDisplay.textContent = botData.cycle || 0;
            if (profitDisplay) profitDisplay.textContent = (botData.profit || 0).toFixed(2);
            if (cycleProfitDisplay) cycleProfitDisplay.textContent = (botData.cycleProfit || 0).toFixed(2);

            actualizarCalculos();

        } else {
            console.warn('[FRONTEND] No se pudieron cargar los datos del bot. Usando valores predeterminados de la UI.');
            actualizarCalculos();
        }
    } catch (error) {
        console.error('Error al cargar la configuración y estado del bot:', error);
        actualizarCalculos();
    }
}

async function toggleBotState() {
    if (!isLoggedIn) {
        alert("Please login first to control the bot.");
        return;
    }
    if (!startBtn || !resetBtn || !botStateDisplay || !stopAtCycleEndCheckbox) {
        console.warn("Faltan elementos DOM para controlar el estado del bot.");
        return;
    }

    const purchase = parseFloat(purchaseInput.value);
    const increment = parseFloat(incrementInput.value);
    const decrement = parseFloat(decrementInput.value);
    const trigger = parseFloat(triggerInput.value);
    const stopAtCycleEnd = stopAtCycleEndCheckbox.checked;

    const action = startBtn.textContent === 'START' ? 'start' : 'stop';

    try {
        const response = await fetchFromBackend('/api/user/toggle-bot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, params: { purchase, increment, decrement, trigger, stopAtCycleEnd } })
        });

        if (response && response.success) {
            const newBotState = response.botState.state;
            isRunning = (newBotState === 'RUNNING');

            botStateDisplay.textContent = newBotState;
            botStateDisplay.className = isRunning ? 'text-green-400' : 'text-yellow-400';
            startBtn.textContent = isRunning ? 'STOP' : 'START';
            resetBtn.disabled = isRunning;
            stopAtCycleEndCheckbox.disabled = isRunning;

            cycleDisplay.textContent = response.botState.cycle || 0;
            profitDisplay.textContent = (response.botState.profit || 0).toFixed(2);
            cycleProfitDisplay.textContent = (response.botState.cycleProfit || 0).toFixed(2);

            console.log(`Bot state updated: ${newBotState}`);
            actualizarCalculos();
        } else {
            throw new Error(response.message || 'Failed to toggle bot state.');
        }
    } catch (error) {
        console.error('Error toggling bot state:', error);
        alert(`Error: ${error.message}`);
        const previousIsRunning = isRunning;
        isRunning = previousIsRunning;
        if (botStateDisplay) {
            botStateDisplay.textContent = previousIsRunning ? 'RUNNING' : 'STOPPED';
            botStateDisplay.className = previousIsRunning ? 'text-green-400' : 'text-yellow-400';
        }
        if (startBtn) startBtn.textContent = previousIsRunning ? 'STOP' : 'START';
        if (resetBtn) resetBtn.disabled = previousIsRunning;
        if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.disabled = previousIsRunning;
    }
}

function resetBot() {
    if (purchaseInput) purchaseInput.value = 5.00;
    if (incrementInput) incrementInput.value = 100;
    if (decrementInput) decrementInput.value = 1.0;
    if (triggerInput) triggerInput.value = 1.5;
    if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.checked = false;
    actualizarCalculos();
}

// --- Lógica de Cambio de Pestañas (Dashboard, Testbot, Autobot, Aibot) ---
function setupNavTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    navTabs.forEach(tab => {
        tab.addEventListener('click', function(event) {
            event.preventDefault();
            const targetId = this.dataset.tab + '-section';

            navTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            tabContents.forEach(content => {
                if (content.id === targetId) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });
}

// --- Lógica de Cambio de Pestañas de Órdenes (Opened, Filled, Cancelled, All) ---
function setActiveTab(tabId) {
    document.querySelectorAll('#autobot-section .border-b-2').forEach(button => {
        button.classList.remove('active-tab', 'border-white');
        button.classList.add('border-transparent');
    });
    const activeButton = document.getElementById(tabId);
    if (activeButton) {
        activeButton.classList.add('active-tab', 'border-white');
        activeButton.classList.remove('border-transparent');
        currentTab = tabId.replace('tab-', '');
        fetchOrders(currentTab);
    }
}

// --- Event Listeners del DOMContentLoaded (punto de entrada principal) ---
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar la verificación del estado de login al cargar la página
    checkLoginStatus();

    // Setup de los tabs principales de navegación
    setupNavTabs();

    // Cargar la configuración y estado del bot si el usuario está logueado
    loadBotConfigAndState();

    // Inicializar los cálculos y el estado de conexión del bot (si los elementos existen)
    if (document.getElementById('balance')) getBalances();
    if (document.getElementById('price')) cargarPrecioEnVivo();
    if (document.getElementById('status-dot')) checkConnection();
    if (document.getElementById('tab-opened')) setActiveTab('tab-opened');

    // Configurar intervalos de actualización
    setInterval(getBalances, 10000);
    setInterval(cargarPrecioEnVivo, 250);
    setInterval(checkConnection, 10000);
    setInterval(() => fetchOrders(currentTab), 15000);

    // Event listeners para los botones del bot
    if (startBtn) startBtn.addEventListener('click', toggleBotState);
    if (resetBtn) resetBtn.addEventListener('click', resetBot);

    // Event listeners para las pestañas de órdenes
    const tabOpened = document.getElementById('tab-opened');
    const tabFilled = document.getElementById('tab-filled');
    const tabCancelled = document.getElementById('tab-cancelled');
    const tabAll = document.getElementById('tab-all');

    if (tabOpened) tabOpened.addEventListener('click', () => setActiveTab('tab-opened'));
    if (tabFilled) tabFilled.addEventListener('click', () => setActiveTab('tab-filled'));
    if (tabCancelled) tabCancelled.addEventListener('click', () => setActiveTab('tab-cancelled'));
    if (tabAll) tabAll.addEventListener('click', () => setActiveTab('tab-all'));

    // Event listeners para los inputs de cálculos del bot
    if (purchaseInput) purchaseInput.addEventListener('input', actualizarCalculos);
    if (incrementInput) incrementInput.addEventListener('input', actualizarCalculos);
    if (decrementInput) decrementInput.addEventListener('input', actualizarCalculos);
    if (triggerInput) triggerInput.addEventListener('input', actualizarCalculos);


    // --- Lógica para el modal de Autenticación (Login/Registro) ---

    // Manejador del Click en el Icono de Login/Logout
    if (loginLogoutIcon) {
        loginLogoutIcon.addEventListener('click', () => {
            if (isLoggedIn) {
                handleLogout();
            } else {
                toggleAuthModal(true);
            }
        });
    }

    // Manejador del submit del formulario de autenticación
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailInput.value;
            const token = tokenInput.value;

            authMessage.textContent = 'Processing...';
            authMessage.style.color = 'yellow';

            try {
                let response;
                let data;

                if (tokenInput.style.display === 'none') { // Primera etapa: enviar email para obtener token
                    response = await fetch(`${BACKEND_URL}/api/auth/request-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    data = await response.json();

                    if (response.ok) {
                        authMessage.textContent = data.message;
                        authMessage.style.color = 'green';
                        emailInput.disabled = true;
                        tokenInput.style.display = 'block';
                        authButton.textContent = 'Verify';
                    } else {
                        authMessage.textContent = data.error || 'Server error. Please try again later.';
                        authMessage.style.color = 'red';
                    }
                } else { // Segunda etapa: verificar token
                    response = await fetch(`${BACKEND_URL}/api/auth/verify-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, token })
                    });
                    data = await response.json();

                    if (response.ok) {
                        localStorage.setItem('authToken', data.token);
                        localStorage.setItem('userEmail', email);
                        isLoggedIn = true;
                        updateLoginIcon();
                        authMessage.textContent = data.message;
                        authMessage.style.color = 'green';
                        setTimeout(async () => {
                            toggleAuthModal(false);
                            await loadBotConfigAndState();
                            await getBalances();
                            await fetchOrders(currentTab);
                        }, 1500);
                    } else {
                        authMessage.textContent = data.error || 'Invalid token or email.';
                        authMessage.style.color = 'red';
                    }
                }
            } catch (error) {
                console.error('Authentication error:', error);
                authMessage.textContent = 'Network error or server unavailable. Please try again later.';
                authMessage.style.color = 'red';
            }
        });
    }

    // --- Lógica para el modal de API ---
    if (apiKeyIcon) {
        apiKeyIcon.addEventListener('click', () => {
            if (!isLoggedIn) {
                alert("Please login first to configure API keys.");
                toggleAuthModal(true);
                return;
            }
            toggleApiModal(true);
        });
    }

    // Manejador del submit del formulario de API
    if (apiForm) {
        apiForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const apiKey = apiKeyInput.value.trim();
            const secretKey = secretKeyInput.value.trim();
            const apiMemo = apiMemoInput.value.trim();

            if (!apiKey || !secretKey) {
                apiStatusMessage.textContent = 'API Key and Secret Key are required.';
                apiStatusMessage.style.color = 'red';
                return;
            }

            apiStatusMessage.textContent = 'Validating API keys...';
            apiStatusMessage.style.color = 'yellow';
            connectionIndicator.classList.remove('bg-green-500', 'bg-red-500', 'bg-gray-500');
            connectionIndicator.classList.add('bg-yellow-500');
            connectionText.textContent = 'Connecting...';

            try {
                const response = await fetchFromBackend('/api/user/save-api-keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey, secretKey, apiMemo })
                });

                if (response && response.connected) {
                    apiStatusMessage.textContent = response.message || 'API keys validated and saved!';
                    apiStatusMessage.style.color = 'green';
                    connectionIndicator.classList.remove('bg-yellow-500', 'bg-red-500');
                    connectionIndicator.classList.add('bg-green-500');
                    connectionText.textContent = 'Connected';
                    getBalances();
                    fetchOrders(currentTab);
                } else {
                    const errorMessage = response.message || 'Failed to validate or save API keys.';
                    apiStatusMessage.textContent = errorMessage;
                    apiStatusMessage.style.color = 'red';
                    connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
                    connectionIndicator.classList.add('bg-red-500');
                    connectionText.textContent = 'Disconnected';
                }
            } catch (error) {
                console.error('Error submitting API keys:', error);
                apiStatusMessage.textContent = `Error: ${error.message}`;
                apiStatusMessage.style.color = 'red';
                connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
                connectionIndicator.classList.add('bg-red-500');
                connectionText.textContent = 'Disconnected';
            }
        });
    }

    // NEW: Click handler for the close button of the API modal
    if (closeApiModalButton) {
        closeApiModalButton.addEventListener('click', () => {
            toggleApiModal(false);
        });
    }
});