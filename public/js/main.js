// public/js/main.js

const BACKEND_URL = 'https://bsb-ppex.onrender.com';
const TRADE_SYMBOL = 'BTC_USDT'; // Define el símbolo para las órdenes

// --- Elementos del DOM ---
const appSection = document.getElementById('app-section'); // Contenedor principal de la app
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
const apiForm = document.getElementById('api-form'); // Formulario dentro del modal API
const apiKeyInput = document.getElementById('api-key'); // Input API Key dentro del modal
const secretKeyInput = document.getElementById('secret-key'); // Input Secret Key dentro del modal
const apiMemoInput = document.getElementById('api-memo'); // Input API Memo dentro del modal
const apiStatusMessageModal = document.getElementById('api-status-message'); // Mensaje de estado API en el modal
const connectionIndicatorModal = document.getElementById('connection-indicator'); // Círculo indicador API en el modal
const connectionTextModal = document.getElementById('connection-text'); // Texto indicador API en el modal


// Autobot Section Specific Elements (from index.html)
const profitText = document.getElementById('profit-text');
const botStatusText = document.getElementById('bot-status-text');
const currentPriceText = document.getElementById('current-price-text');
const cycleProfitText = document.getElementById('cycle-profit-text');
const balanceBTCText = document.getElementById('balance-btc');
const cycleText = document.getElementById('cycle-text');
const balanceUSDTText = document.getElementById('balance-usdt');
const orqText = document.getElementById('orq-text');

const purchaseAmountInput = document.getElementById('purchase-amount');
const incrementPercentageInput = document.getElementById('increment-percentage');
const decrementPercentageInput = document.getElementById('decrement-percentage');
const triggerPercentageInput = document.getElementById('trigger-percentage');
const stopOnCycleEndCheckbox = document.getElementById('stop-on-cycle-end');
const startBotBtn = document.getElementById('start-bot-btn');
const stopBotBtn = document.getElementById('stop-bot-btn');

// Connection status elements within the Autobot section's API status box
const apiStatusMessagePanel = document.getElementById('api-status-message'); // This ID is duplicated, using the one in the main autobot section
const connectionIndicatorPanel = document.querySelector('#autobot-section #connection-status #status-dot'); // Specific selector for panel
const connectionTextPanel = document.querySelector('#autobot-section #connection-status #status-text'); // Specific selector for panel


// Order Tabs
const tabOpened = document.getElementById('tab-opened');
const tabFilled = document.getElementById('tab-filled');
const tabCancelled = document.getElementById('tab-cancelled');
const tabAll = document.getElementById('tab-all');
const orderListDiv = document.getElementById('order-list');


// --- Estado de la Aplicación ---
let isLoggedIn = false;
let socket; // Declarar socket aquí para accesibilidad global
let currentTab = 'opened'; // Pestaña de órdenes activa
let currentDisplayedOrders = new Map(); // Para gestionar órdenes en la lista

// Variables para intervalos de actualización
let balanceIntervalId = null;
let orderHistoryIntervalId = null;

// --- FUNCIONES DE AUTENTICACIÓN Y ESTADO DEL USUARIO ---

/**
 * Verifica si el usuario está logueado comprobando un token en localStorage.
 * Actualiza la variable `isLoggedIn`.
 */
function checkLoginStatus() {
    const token = localStorage.getItem('authToken');
    isLoggedIn = !!token; // `!!` convierte el valor a booleano
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
 * Muestra u oculta el modal de autenticación (login/registro) y la sección principal de la app.
 * También gestiona la conexión/desconexión de Socket.IO.
 * @param {boolean} showLoginModal - `true` para mostrar el modal de login, `false` para ocultarlo.
 */
function updateAuthUI(showLoginModal) {
    if (showLoginModal) {
        if (authModal) authModal.style.display = 'flex'; // Muestra el modal de login
        if (appSection) appSection.classList.add('hidden'); // Oculta la sección principal de la app
        
        // Limpiar campos y estado del modal
        if (authMessage) authMessage.textContent = '';
        if (emailInput) emailInput.value = '';
        if (tokenInput) tokenInput.value = '';
        if (tokenInput) tokenInput.style.display = 'none';
        if (emailInput) emailInput.disabled = false;
        if (authButton) authButton.textContent = 'Continue';

        // Desconectar Socket.IO y detener intervalos si el usuario no está logueado
        if (socket && socket.connected) {
            socket.disconnect();
            console.log('Socket.IO desconectado.');
        }
        clearIntervals();
        console.log('Todos los intervalos de actualización detenidos.');

    } else {
        if (authModal) authModal.style.display = 'none'; // Oculta el modal de login
        if (appSection) appSection.classList.remove('hidden'); // Muestra la sección principal de la app
        
        // Conectar Socket.IO e iniciar intervalos cuando el usuario está autenticado
        connectSocketIO();
        startIntervals();
        console.log('Socket.IO conectado e intervalos de actualización iniciados.');
    }
    updateLoginIcon(); // Siempre actualiza el icono de login/logout
}

/**
 * Maneja el proceso de deslogueo del usuario.
 * Borra el token local y notifica al backend.
 */
async function handleLogout() {
    console.log('[FRONTEND] Intentando desloguear...');
    try {
        // Podrías tener una ruta /api/auth/logout si necesitas limpiar sesiones en el backend
        // await fetchFromBackend('/api/auth/logout', { method: 'POST' }); 
        console.log('[FRONTEND] Deslogueo local completado.');
    } catch (error) {
        console.error('[FRONTEND] Falló la llamada al backend para deslogueo (puede ser opcional):', error);
    } finally {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail'); // También eliminar el email guardado
        isLoggedIn = false;
        updateAuthUI(true); // Muestra el modal de login
        if (authMessage) {
            authMessage.textContent = 'Has cerrado sesión exitosamente.';
            authMessage.style.color = 'green';
        }
        // No es necesario recargar la página, `updateAuthUI` gestiona la visibilidad.
        // window.location.reload(); 
    }
}

// --- Helper Function for API Calls (Maneja tokens y rutas dinámicas) ---
async function fetchFromBackend(url, options = {}) {
    const token = localStorage.getItem('authToken');
    if (token) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
    }

    try {
        const res = await fetch(`${BACKEND_URL}${url}`, options);

        if (res.status === 401 || res.status === 403) {
            console.warn("Token inválido o expirado. Iniciando deslogueo automático.");
            // Actualizar el mensaje en el modal de autenticación
            if (authMessage) {
                authMessage.textContent = "Tu sesión ha expirado o no es válida. Por favor, inicia sesión de nuevo.";
                authMessage.style.color = 'red';
            }
            handleLogout(); // Llama a la función de deslogueo
            throw new Error("No autorizado o Prohibido"); // Lanza un error para detener la ejecución
        }

        if (!res.ok) {
            let errorDetails = `HTTP error! status: ${res.status}`;
            try {
                const errorData = await res.json();
                errorDetails = errorData.error || errorData.message || JSON.stringify(errorData);
            } catch (jsonError) {
                errorDetails = await res.text() || `HTTP error! status: ${res.status} (non-JSON response or empty)`;
            }
            throw new Error(errorDetails);
        }
        return await res.json();
    } catch (error) {
        console.error(`Error fetching from ${url}:`, error);
        // Si el error no es de autenticación (ya manejado arriba), muestra un mensaje general
        const errorMessage = error instanceof Error ? error.message : String(error || "Unknown error occurred.");
        if (orderListDiv) { // Mostrar error en la lista de órdenes
             orderListDiv.innerHTML = `<p class="text-red-400">Error: ${errorMessage}</p>`;
        }
        return null; // Devuelve null para que el llamador pueda manejarlo
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
    orderDiv.innerHTML = `
        <div class="flex justify-between items-center mb-1">
            <span class="font-bold">${order.symbol || 'N/A'}</span>
            <span class="${order.side === 'BUY' ? 'text-green-400' : 'text-red-400'}">${(order.side || 'N/A').toUpperCase()}</span>
            <span>${(order.type || 'N/A').toUpperCase()}</span>
        </div>
        <div class="flex justify-between text-xs text-gray-300">
            <span>Price: ${parseFloat(order.price || '0').toFixed(2)}</span>
            <span>Size: ${parseFloat(order.size || '0').toFixed(5)}</span>
            <span>Filled: ${parseFloat(order.filledSize || '0').toFixed(5)}</span>
            <span>State: <span class="${order.state === 'filled' || order.state === 'fully_filled' ? 'text-green-400' : order.state === 'cancelled' ? 'text-red-400' : 'text-yellow-400'}">${(order.state || 'N/A').toUpperCase()}</span></span>
        </div>
        <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>Order ID: ${order.orderId || 'N/A'}</span>
            <span>Time: ${order.createTime ? new Date(parseInt(order.createTime)).toLocaleString() : 'N/A'}</span>
        </div>
    `;
}

function displayOrders(newOrders, tab) {
    if (!orderListDiv) return;

    if (!newOrders || newOrders.length === 0) {
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

    if (currentDisplayedOrders.size === 0 && newOrders.length === 0) {
        orderListDiv.innerHTML = `<p class="text-gray-400">No orders found for the "${tab}" tab.</p>`;
    }
}


// --- Funciones para Obtener Datos de BitMart (Ajustadas para usar ruta /api/user/bitmart/...) ---

async function getBalances() {
    if (!isLoggedIn) {
        if (balanceUSDTText) balanceUSDTText.textContent = 'Login to see';
        if (balanceBTCText) balanceBTCText.textContent = 'Login to see';
        return;
    }
    try {
        const walletData = await fetchFromBackend('/api/user/bitmart/balance');
        if (walletData && Array.isArray(walletData)) {
            const usdt = walletData.find(w => w.currency === "USDT");
            const btc = walletData.find(w => w.currency === "BTC");
            
            if (balanceUSDTText) balanceUSDTText.textContent = usdt ? parseFloat(usdt.available).toFixed(2) : '0.00';
            if (balanceBTCText) balanceBTCText.textContent = btc ? parseFloat(btc.available).toFixed(5) : '0.00000';
            actualizarCalculos(); // Recalculate based on updated balances
        } else {
            if (balanceUSDTText) balanceUSDTText.textContent = 'Error fetching balances.';
            if (balanceBTCText) balanceBTCText.textContent = 'Error fetching balances.';
            console.error('getBalances: Respuesta inesperada del backend:', walletData);
        }
    } catch (error) {
        console.error('Error al cargar balances:', error);
        if (balanceUSDTText) balanceUSDTText.textContent = 'Error';
        if (balanceBTCText) balanceBTCText.textContent = 'Error';
    }
}

async function fetchOpenOrdersData() {
    if (!isLoggedIn) {
        return [];
    }
    try {
        const orders = await fetchFromBackend(`/api/user/bitmart/open-orders?symbol=${TRADE_SYMBOL}`);
        // Normalizar la estructura de las órdenes si es necesario
        // Ejemplo: si order.order_id es lo que usas como orderId en el frontend
        return orders.map(order => ({
            orderId: order.order_id,
            symbol: order.symbol,
            side: order.side,
            type: order.order_type,
            price: order.price,
            size: order.size,
            filledSize: order.filled_size, // Asegúrate de que el backend devuelve esto
            state: order.state,
            createTime: order.create_time // Asegúrate de que el backend devuelve esto
        })) || [];
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
        // Esta funcionalidad debería implementarse en el backend para filtrar por estado
        // Ejemplo: const historyOrders = await fetchFromBackend(`/api/user/bitmart/history-orders?symbol=${TRADE_SYMBOL}&state=${tab}`);
        console.warn(`Funcionalidad para ${tab} de historial aún no implementada en el backend. Devolviendo vacío.`);
        return [];
    } catch (error) {
        console.error("Error fetching historical orders data:", error);
        return [];
    }
}

async function fetchOrders(tab) {
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

    let orders = [];

    try {
        if (tab === 'opened') {
            orders = await fetchOpenOrdersData();
        } else {
            const historyOrders = await fetchHistoryOrdersData(tab);
            if (historyOrders) {
                if (tab === 'filled') {
                    orders = historyOrders.filter(order => order.state === 'filled' || order.state === 'fully_filled');
                } else if (tab === 'cancelled') {
                    orders = historyOrders.filter(order => order.state === 'cancelled');
                } else if (tab === 'all') {
                    orders = historyOrders;
                }
            }
        }
    } catch (error) {
        console.error(`Failed to fetch orders for tab ${tab}:`, error);
        orderListDiv.innerHTML = `<p class="text-red-400">Failed to load orders for this tab. Please check console for details.</p>`;
        return;
    }

    displayOrders(orders, tab);
}

// --- Otras Funciones del Bot ---

async function cargarPrecioEnVivo() {
    // Esta función no requiere autenticación de usuario ya que es una API pública de Binance
    try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const data = await res.json();
        const price = parseFloat(data.price).toFixed(2);
        if (currentPriceText) {
            currentPriceText.textContent = price;
            actualizarCalculos();
        }
    } catch (error) {
        console.error('Error al cargar precio en vivo:', error);
        if (currentPriceText) {
            currentPriceText.textContent = 'Error';
        }
    }
}

async function checkConnection() {
    // Esta función chequea la conexión con TU backend, no con BitMart.
    // No necesita token para /ping, pero usamos fetch para consistencia en el manejo de errores.
    try {
        const response = await fetch(`${BACKEND_URL}/ping`); // Direct fetch, no needs token
        const data = await response.json();

        if (connectionIndicatorPanel && connectionTextPanel) {
            if (response.ok && data && data.status === 'ok') {
                connectionIndicatorPanel.classList.replace('bg-red-500', 'bg-green-500');
                connectionTextPanel.textContent = 'Connected';
            } else {
                throw new Error('Backend did not return OK status or response not OK');
            }
        }
    } catch (error) {
        if (connectionIndicatorPanel && connectionTextPanel) {
            connectionIndicatorPanel.classList.replace('bg-green-500', 'bg-red-500');
            connectionTextPanel.textContent = 'Disconnected';
        }
        console.error('Connection check failed:', error);
    }
}

function calcularORQ(purchase, increment, balance) {
    let total = 0;
    let n = 0;
    while (true) {
        // Evitar un bucle infinito si increment es 0 o muy pequeño
        if (increment === 0 && n > 0) break;
        const nextOrder = purchase * Math.pow((100 + increment) / 100, n); // Incremento compuesto
        if (total + nextOrder <= balance) {
            total += nextOrder;
            n++;
        } else {
            break;
        }
    }
    return n;
}

function calcularCoverage(orq, price, decrement) {
    if (orq === 0) return 0;
    // La fórmula de cobertura debe ser sobre el último precio de compra (price)
    // y decrementar ese precio para calcular la siguiente orden de cobertura.
    return price * Math.pow(1 - decrement / 100, orq - 1);
}

function actualizarCalculos() {
    const purchase = parseFloat(purchaseAmountInput.value) || 0;
    const increment = parseFloat(incrementPercentageInput.value) || 0;
    const decrement = parseFloat(decrementPercentageInput.value) || 0;
    // const trigger = parseFloat(triggerPercentageInput.value) || 0; // Not used in ORQ/Coverage calc

    const price = parseFloat(currentPriceText.textContent) || 0;
    const balance = parseFloat(balanceUSDTText.textContent) || 0;

    const orq = calcularORQ(purchase, increment, balance);
    const coverage = calcularCoverage(orq, price, decrement);

    if (orqText) orqText.textContent = orq;
    // No hay un elemento específico para 'coverage' en el HTML del panel principal
    // Asumiendo que 'BTC AC' (balance-btc) es lo que se usaría para mostrar alguna métrica de "cobertura"
    // o que 'coverage' es una variable interna del bot, no un display directo en la UI.
    // Por ahora, solo se calcula internamente.
    // if (coverageElement) coverageElement.textContent = coverage.toFixed(2);
    // ultimoCoverageValido = coverage; // Mantener esto si se usa para otras lógicas
}

/**
 * Actualiza la UI del bot con el estado recibido del backend/Socket.IO.
 * @param {object} state - El objeto de estado del bot.
 */
function updateBotStateUI(state) {
    if (botStatusText) botStatusText.textContent = state.state;
    if (cycleText) cycleText.textContent = state.cycle;
    if (profitText) profitText.textContent = `${state.profit ? state.profit.toFixed(2) : '0.00'}`; // No "USDT" aquí, ya está en el label
    if (cycleProfitText) cycleProfitText.textContent = `${state.cycleProfit ? state.cycleProfit.toFixed(2) : '0.00'}`; // No "USDT" aquí
    if (currentPriceText) currentPriceText.textContent = `${state.currentPrice ? state.currentPrice.toFixed(2) : '0.00'}`;

    // Actualizar campos de configuración del bot
    if (purchaseAmountInput) purchaseAmountInput.value = state.purchaseAmount || '';
    if (incrementPercentageInput) incrementPercentageInput.value = state.incrementPercentage || '';
    if (decrementPercentageInput) decrementPercentageInput.value = state.decrementPercentage || '';
    if (triggerPercentageInput) triggerPercentageInput.value = state.triggerPercentage || '';
    if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.checked = state.stopOnCycleEnd || false;
        
    // Habilitar/deshabilitar controles y campos de configuración
    const isDisabled = !(state.state === 'STOPPED' || state.state === 'ERROR' || state.state === 'NO_COVERAGE');
    
    if (purchaseAmountInput) purchaseAmountInput.disabled = isDisabled;
    if (incrementPercentageInput) incrementPercentageInput.disabled = isDisabled;
    if (decrementPercentageInput) decrementPercentageInput.disabled = isDisabled;
    if (triggerPercentageInput) triggerPercentageInput.disabled = isDisabled;
    if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.disabled = isDisabled;
    
    if (startBotBtn) startBotBtn.disabled = isDisabled;
    if (stopBotBtn) stopBotBtn.disabled = !isDisabled; // El botón de STOP está habilitado si el bot NO está parado
}

async function toggleBotState() {
    if (!isLoggedIn) {
        if (authMessage) {
            authMessage.textContent = "Please login first to control the bot.";
            authMessage.style.color = 'red';
        }
        updateAuthUI(true); // Muestra modal de login
        return;
    }

    const action = (startBotBtn && startBotBtn.disabled === false) ? 'start' : 'stop'; // Determinar acción basada en estado del botón START

    const params = {
        purchase: parseFloat(purchaseAmountInput.value),
        increment: parseFloat(incrementPercentageInput.value),
        decrement: parseFloat(decrementPercentageInput.value),
        trigger: parseFloat(triggerPercentageInput.value),
        stopOnCycleEnd: stopOnCycleEndCheckbox.checked
    };

    if (isNaN(params.purchase) || isNaN(params.increment) || isNaN(params.decrement) || isNaN(params.trigger)) {
        if (authMessage) { // O usar un mensaje específico para el bot
            authMessage.textContent = 'Por favor, introduce valores numéricos válidos en todos los campos de configuración del bot.';
            authMessage.style.color = 'red';
        }
        return;
    }

    // Deshabilitar botones mientras se procesa la solicitud
    if (startBotBtn) startBotBtn.disabled = true;
    if (stopBotBtn) stopBotBtn.disabled = true;

    try {
        const response = await fetchFromBackend('/api/toggle-bot', {
            method: 'POST',
            body: JSON.stringify({ action, params })
        });

        if (response && response.success) {
            console.log(response.message);
            // La UI se actualizará vía Socket.IO (botStateUpdate)
        } else {
            throw new Error(response.message || 'Failed to toggle bot state.');
        }
    } catch (error) {
        console.error('Error toggling bot state:', error);
        // Re-habilitar botones si falla
        updateBotStateUI(await fetchFromBackend('/api/bot-state')); // Cargar estado actual para restaurar UI
        if (authMessage) { // O usar un mensaje específico para el bot
            authMessage.textContent = `Error al ${action === 'start' ? 'iniciar' : 'detener'} el bot: ${error.message}`;
            authMessage.style.color = 'red';
        }
    }
}


// --- Lógica de Cambio de Pestañas (Dashboard, Testbot, Autobot, Aibot) ---
function setupNavTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    navTabs.forEach(tab => {
        tab.addEventListener('click', async function(event) {
            event.preventDefault();
            const targetId = this.dataset.tab; // e.g., 'dashboard', 'autobot'
            const targetSectionId = targetId + '-section'; // e.g., 'dashboard-section'

            // Solo permitir cambiar de pestaña si está autenticado o si es el dashboard
            if (!isLoggedIn && targetId !== 'dashboard') {
                updateAuthUI(true); // Muestra el modal de login
                if (authMessage) {
                    authMessage.textContent = "Please login to access this section.";
                    authMessage.style.color = 'blue';
                }
                return; // Detiene la navegación
            }

            // Eliminar 'active' de todas las pestañas de navegación y contenidos
            navTabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Añadir 'active' a la pestaña de navegación y al contenido correctos
            this.classList.add('active');
            const activeContent = document.getElementById(targetSectionId);
            if (activeContent) {
                activeContent.classList.add('active');
            }

            // Cargar datos específicos cuando se navega a la pestaña autobot, SOLO si está autenticado
            if (targetId === 'autobot' && isLoggedIn) {
                await checkApiConnection(); // Verificar conexión API
                await getBalances(); // Cargar balances
                await cargarPrecioEnVivo(); // Cargar precio en vivo
                await loadBotState(); // Cargar estado del bot
                await fetchOrders(currentTab); // Cargar órdenes de la pestaña activa
            }
        });
    });

    // Activar la pestaña inicial al cargar la página
    // Prioridad: 1. Hash de la URL, 2. Pestaña con clase 'active' en HTML, 3. 'dashboard' por defecto
    const initialHashTab = window.location.hash.substring(1); // Eliminar '#'
    let initialTabToActivate = 'dashboard'; // Por defecto

    if (initialHashTab && document.querySelector(`.nav-tab[data-tab="${initialHashTab}"]`)) {
        if (isLoggedIn || initialHashTab === 'dashboard') {
            initialTabToActivate = initialHashTab;
        } else {
            // Si hay un hash pero el usuario no está logueado y no es el dashboard, lo mandamos al dashboard
            window.location.hash = '#dashboard';
        }
    } else {
        const activeTabInMarkup = document.querySelector('.nav-tab.active');
        if (activeTabInMarkup) {
            initialTabToActivate = activeTabInMarkup.dataset.tab;
        }
    }

    // Simular click en la pestaña inicial para activar su lógica y mostrar contenido
    const initialNavTabElement = document.querySelector(`.nav-tab[data-tab="${initialTabToActivate}"]`);
    if (initialNavTabElement) {
        initialNavTabElement.click();
    }
}


// --- Lógica de Cambio de Pestañas de Órdenes (Opened, Filled, Cancelled, All) ---
function setupOrderTabs() {
    const orderTabButtons = document.querySelectorAll('#autobot-section .border-b-2'); // Botones de las pestañas de órdenes

    orderTabButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remover 'active-tab' y 'border-white' de todos los botones
            orderTabButtons.forEach(btn => {
                btn.classList.remove('active-tab', 'border-white');
                btn.classList.add('border-transparent');
            });
            // Añadir 'active-tab' y 'border-white' al botón clickeado
            this.classList.add('active-tab', 'border-white');
            this.classList.remove('border-transparent');

            currentTab = this.id.replace('tab-', ''); // Actualizar la pestaña activa
            fetchOrders(currentTab); // Cargar órdenes para la nueva pestaña
        });
    });

    // Activar la pestaña 'Opened' por defecto al inicio
    if (tabOpened) {
        tabOpened.click(); // Simula click para activar la lógica
    }
}


/**
 * Verifica la conexión de las API keys con BitMart para el usuario autenticado.
 * Actualiza el estado de conexión en la UI (panel principal del autobot).
 */
async function checkApiConnection() {
    if (!isLoggedIn) {
        if (apiStatusMessagePanel) apiStatusMessagePanel.textContent = 'Inicia sesión para ver el estado de la API.';
        if (connectionIndicatorPanel) connectionIndicatorPanel.classList.remove('bg-green-500', 'bg-yellow-500');
        if (connectionIndicatorPanel) connectionIndicatorPanel.classList.add('bg-red-500');
        if (connectionTextPanel) connectionTextPanel.textContent = 'Disconnected';
        return;
    }
    try {
        const balance = await fetchFromBackend('/api/user/bitmart/balance'); 
        if (balance) { // Si la respuesta no es nula (fetchFromBackend maneja errores)
            console.log('API de BitMart conectada. Balance:', balance);
            if (connectionIndicatorPanel) connectionIndicatorPanel.classList.remove('bg-red-500', 'bg-yellow-500');
            if (connectionIndicatorPanel) connectionIndicatorPanel.classList.add('bg-green-500');
            if (connectionTextPanel) connectionTextPanel.textContent = 'Connected';
            if (apiStatusMessagePanel) apiStatusMessagePanel.textContent = 'Las claves API son válidas y están conectadas.';
            if (apiStatusMessagePanel) apiStatusMessagePanel.style.color = 'green';
        } else {
            throw new Error('Error al obtener balance de BitMart. Claves API inválidas o faltantes.');
        }
    } catch (error) {
        console.warn('API de BitMart no conectada:', error.message);
        if (connectionIndicatorPanel) connectionIndicatorPanel.classList.remove('bg-green-500', 'bg-yellow-500');
        if (connectionIndicatorPanel) connectionIndicatorPanel.classList.add('bg-red-500');
        if (connectionTextPanel) connectionTextPanel.textContent = 'Disconnected';
        if (apiStatusMessagePanel) apiStatusMessagePanel.textContent = `Error: ${error.message}`;
        if (apiStatusMessagePanel) apiStatusMessagePanel.style.color = 'red';
    }
}

/**
 * Carga el estado inicial del bot desde el backend para el usuario autenticado.
 */
async function loadBotState() {
    if (!isLoggedIn) {
        console.warn("No estás logueado, no se puede cargar el estado del bot.");
        // Restablecer la UI del bot a estado "STOPPED" si no está logueado
        updateBotStateUI({
            state: 'STOPPED', cycle: 0, profit: 0, cycleProfit: 0, currentPrice: 0,
            purchaseAmount: 0, incrementPercentage: 0, decrementPercentage: 0, triggerPercentage: 0, stopOnCycleEnd: false
        });
        return;
    }
    try {
        const botState = await fetchFromBackend('/api/bot-state');
        if (botState) {
            updateBotStateUI(botState);
            console.log("Estado del bot cargado para el usuario:", botState);
        } else {
            console.warn("No se pudo cargar el estado del bot o el estado está vacío.");
            // Mostrar un estado de "error" o "detenido" si no se carga nada
            updateBotStateUI({
                state: 'ERROR', cycle: 0, profit: 0, cycleProfit: 0, currentPrice: 0,
                purchaseAmount: 0, incrementPercentage: 0, decrementPercentage: 0, triggerPercentage: 0, stopOnCycleEnd: false
            });
        }
    } catch (error) {
        console.error("Error al cargar el estado del bot:", error);
        updateBotStateUI({
            state: 'ERROR', cycle: 0, profit: 0, cycleProfit: 0, currentPrice: 0,
            purchaseAmount: 0, incrementPercentage: 0, decrementPercentage: 0, triggerPercentage: 0, stopOnCycleEnd: false
        });
        if (apiStatusMessagePanel) { // Mostrar error en el panel principal
            apiStatusMessagePanel.textContent = `Error al cargar el estado del bot: ${error.message}`;
            apiStatusMessagePanel.style.color = 'red';
        }
    }
}


// --- Gestión de Intervalos de Actualización ---
function startIntervals() {
    // Detener cualquier intervalo existente para evitar duplicados
    clearIntervals();

    // Iniciar intervalos para datos que dependen de la autenticación
    if (isLoggedIn) {
        balanceIntervalId = setInterval(getBalances, 10000); // Actualiza balances cada 10 segundos
        orderHistoryIntervalId = setInterval(() => fetchOrders(currentTab), 15000); // Actualiza órdenes cada 15 segundos
        console.log("Intervalos de balance y órdenes iniciados.");
    }
    
    // Estos intervalos pueden ejecutarse independientemente de la autenticación si son APIs públicas
    setInterval(cargarPrecioEnVivo, 250); // Actualiza precio muy rápido
    setInterval(checkConnection, 10000); // Checkea conexión con backend
    console.log("Intervalos de precio y conexión backend iniciados.");
}

function clearIntervals() {
    if (balanceIntervalId) {
        clearInterval(balanceIntervalId);
        balanceIntervalId = null;
    }
    if (orderHistoryIntervalId) {
        clearInterval(orderHistoryIntervalId);
        orderHistoryIntervalId = null;
    }
    // No detenemos los intervalos de precio en vivo y conexión al backend aquí,
    // ya que no están gestionados por balanceIntervalId/orderHistoryIntervalId
    // Podrías gestionarlos con IDs propios si quieres controlarlos también.
}

// --- Event Listeners del DOMContentLoaded (punto de entrada principal) ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializar la verificación del estado de login al cargar la página
    checkLoginStatus(); 
    
    // 2. Configurar la UI inicial basada en el estado de autenticación
    updateAuthUI(!isLoggedIn); // Si no está logueado, muestra el modal de login (true)

    // 3. Setup de los tabs principales de navegación
    setupNavTabs();

    // 4. Setup de los tabs de órdenes
    setupOrderTabs();

    // 5. Event listeners para los inputs de cálculos del bot
    if (purchaseAmountInput) purchaseAmountInput.addEventListener('input', actualizarCalculos);
    if (incrementPercentageInput) incrementPercentageInput.addEventListener('input', actualizarCalculos);
    if (decrementPercentageInput) decrementPercentageInput.addEventListener('input', actualizarCalculos);
    if (triggerPercentageInput) triggerPercentageInput.addEventListener('input', actualizarCalculos);

    // 6. Event listeners para los botones del bot
    if (startBotBtn) startBotBtn.addEventListener('click', toggleBotState);
    if (stopBotBtn) stopBotBtn.addEventListener('click', toggleBotState);

    // 7. Event listeners para el modal de Autenticación (Login/Registro)
    if (loginLogoutIcon) {
        loginLogoutIcon.addEventListener('click', () => {
            if (isLoggedIn) {
                handleLogout();
            } else {
                updateAuthUI(true); // Mostrar modal de login
            }
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailInput.value;
            const token = tokenInput.value;

            if (authMessage) {
                authMessage.textContent = 'Processing...';
                authMessage.style.color = 'yellow';
            }

            try {
                let response;
                let data;

                if (tokenInput && tokenInput.style.display === 'none') { // Primera etapa: enviar email para obtener token
                    response = await fetch(`${BACKEND_URL}/api/auth/request-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    data = await response.json();

                    if (response.ok) {
                        if (authMessage) {
                            authMessage.textContent = data.message;
                            authMessage.style.color = 'green';
                        }
                        if (emailInput) emailInput.disabled = true;
                        if (tokenInput) tokenInput.style.display = 'block';
                        if (authButton) authButton.textContent = 'Verify';
                    } else {
                        if (authMessage) {
                            authMessage.textContent = data.error || 'Server error. Please try again later.';
                            authMessage.style.color = 'red';
                        }
                    }
                } else { // Segunda etapa: verificar token
                    response = await fetch(`${BACKEND_URL}/api/auth/verify-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, token })
                    });
                    data = await response.json();

                    if (response.ok && data.token) {
                        localStorage.setItem('authToken', data.token);
                        localStorage.setItem('userEmail', email);
                        isLoggedIn = true;
                        if (authMessage) {
                            authMessage.textContent = data.message || '¡Inicio de sesión exitoso!';
                            authMessage.style.color = 'green';
                        }
                        // Actualiza la UI inmediatamente
                        updateAuthUI(false); // Oculta el modal y muestra la app
                    } else {
                        if (authMessage) {
                            authMessage.textContent = data.error || 'Invalid token or email.';
                            authMessage.style.color = 'red';
                        }
                    }
                }
            } catch (error) {
                console.error('Authentication error:', error);
                if (authMessage) {
                    authMessage.textContent = 'Network error or server unavailable. Please try again later.';
                    authMessage.style.color = 'red';
                }
            }
        });
    }

    // 8. Event listeners para el modal de API
    if (apiKeyIcon) {
        apiKeyIcon.addEventListener('click', () => {
            if (!isLoggedIn) {
                if (authMessage) {
                    authMessage.textContent = "Please login first to configure API keys.";
                    authMessage.style.color = 'blue';
                }
                updateAuthUI(true); // Mostrar modal de login
                return;
            }
            if (apiModal) {
                apiModal.style.display = 'flex'; // Usar 'flex' para centrado CSS
                if (apiStatusMessageModal) apiStatusMessageModal.textContent = ''; // Limpiar mensaje de estado del modal
                if (connectionIndicatorModal) connectionIndicatorModal.classList.remove('bg-green-500', 'bg-red-500', 'bg-yellow-500');
                if (connectionIndicatorModal) connectionIndicatorModal.classList.add('bg-gray-500'); // Default gray for not connected
                if (connectionTextModal) connectionTextModal.textContent = 'Not Connected';

                // Opcional: Cargar las API keys existentes para el usuario
                // Esto requeriría una ruta en el backend como /api/user/api-keys
                // fetchFromBackend('/api/user/api-keys').then(data => { /* ... */ }).catch(err => console.error("Error loading API keys:", err));
            }
        });
    }

    if (closeApiModalButton && apiModal) {
        closeApiModalButton.addEventListener('click', () => {
            apiModal.style.display = 'none'; // Ocultar el modal
        });
        window.addEventListener('click', (event) => {
            if (event.target === apiModal) { // Cierra si se hace clic fuera del contenido del modal
                apiModal.style.display = 'none';
            }
        });
    }

    if (apiForm) {
        apiForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const apiKey = apiKeyInput.value.trim();
            const secretKey = secretKeyInput.value.trim();
            const apiMemo = apiMemoInput.value.trim();

            if (!apiKey || !secretKey) {
                if (apiStatusMessageModal) {
                    apiStatusMessageModal.textContent = 'API Key and Secret Key are required.';
                    apiStatusMessageModal.style.color = 'red';
                }
                return;
            }

            if (apiStatusMessageModal) {
                apiStatusMessageModal.textContent = 'Validating API keys...';
                apiStatusMessageModal.style.color = 'yellow';
            }
            if (connectionIndicatorModal) connectionIndicatorModal.classList.remove('bg-green-500', 'bg-red-500', 'bg-gray-500');
            if (connectionIndicatorModal) connectionIndicatorModal.classList.add('bg-yellow-500'); // Indicador de "cargando"
            if (connectionTextModal) connectionTextModal.textContent = 'Connecting...';

            try {
                const response = await fetchFromBackend('/api/user/save-api-keys', {
                    method: 'POST',
                    body: JSON.stringify({ apiKey, secretKey, apiMemo })
                });

                if (response && response.connected) {
                    if (apiStatusMessageModal) {
                        apiStatusMessageModal.textContent = response.message || 'API keys validated and saved!';
                        apiStatusMessageModal.style.color = 'green';
                    }
                    if (connectionIndicatorModal) connectionIndicatorModal.classList.remove('bg-yellow-500', 'bg-red-500');
                    if (connectionIndicatorModal) connectionIndicatorModal.classList.add('bg-green-500');
                    if (connectionTextModal) connectionTextModal.textContent = 'Connected';
                    
                    // Disparar una actualización de balances y órdenes después de guardar las API keys
                    getBalances();
                    fetchOrders(currentTab);
                    
                    // Cierra el modal de API después de un éxito
                    setTimeout(() => { 
                        if (apiModal) apiModal.style.display = 'none'; 
                    }, 1000);
                } else {
                    const errorMessage = response.message || 'Failed to validate or save API keys.';
                    if (apiStatusMessageModal) {
                        apiStatusMessageModal.textContent = errorMessage;
                        apiStatusMessageModal.style.color = 'red';
                    }
                    if (connectionIndicatorModal) connectionIndicatorModal.classList.remove('bg-yellow-500', 'bg-green-500');
                    if (connectionIndicatorModal) connectionIndicatorModal.classList.add('bg-red-500');
                    if (connectionTextModal) connectionTextModal.textContent = 'Disconnected';
                }
            } catch (error) {
                console.error('Error submitting API keys:', error);
                if (apiStatusMessageModal) {
                    apiStatusMessageModal.textContent = `Error: ${error.message}`;
                    apiStatusMessageModal.style.color = 'red';
                }
                if (connectionIndicatorModal) connectionIndicatorModal.classList.remove('bg-yellow-500', 'bg-green-500');
                if (connectionIndicatorModal) connectionIndicatorModal.classList.add('bg-red-500');
                if (connectionTextModal) connectionTextModal.textContent = 'Disconnected';
            }
        });
    }