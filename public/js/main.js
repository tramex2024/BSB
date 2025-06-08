// js/main.js

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
const apiForm = document.getElementById('api-form'); // Nuevo: form API
const apiKeyInput = document.getElementById('api-key'); // Nuevo: input API Key
const secretKeyInput = document.getElementById('secret-key'); // Nuevo: input Secret Key
const apiMemoInput = document.getElementById('api-memo'); // Nuevo: input API Memo
const apiStatusMessage = document.getElementById('api-status-message'); // Nuevo: mensaje estado API
const connectionIndicator = document.getElementById('connection-indicator'); // Nuevo: círculo indicador API
const connectionText = document.getElementById('connection-text'); // Nuevo: texto indicador API


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
        // Opcional: Podrías hacer una llamada al backend para validar el token si es muy viejo,
        // pero por ahora, con que exista, lo consideramos logueado.
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
 * Maneja el proceso de deslogueo del usuario.
 * Borra el token local y notifica al backend.
 */
async function handleLogout() {
    console.log('[FRONTEND] Intentando desloguear...');
    try {
        const response = await fetch(`${BACKEND_URL}/api/logout`, { // Asumo que esta ruta no requiere token de auth
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
        window.location.reload(); // Recargar para limpiar todo el estado
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
        return null;
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
    const orderListDiv = document.getElementById('order-list');
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
        if (document.getElementById('balance')) {
            document.getElementById('balance').textContent = 'Login to see';
        }
        return;
    }
    try {
        // Usamos la nueva ruta que tu backend sugirió en los logs.
        // Asume que esta ruta en el backend manejará la autenticación JWT
        // y buscará las credenciales de BitMart del usuario.
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
        // Usamos la nueva ruta que tu backend sugiere
        const orders = await fetchFromBackend(`/api/user/bitmart/open-orders?symbol=${TRADE_SYMBOL}`);
        return orders || [];
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
        console.warn(`Funcionalidad para ${tab} aún no implementada en el backend para historial.`);
        // Aquí deberías llamar a la ruta `/api/user/bitmart/history-orders` con el filtro de estado si existe
        return [];
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
        if (document.getElementById('price')) {
            document.getElementById('price').textContent = price + ' USDT';
            actualizarCalculos();
        }
    } catch (error) {
        console.error('Error al cargar precio en vivo:', error);
        if (document.getElementById('price')) {
            document.getElementById('price').textContent = 'Error';
        }
    }
}

async function checkConnection() {
    // Esta función chequea la conexión con TU backend, no con BitMart.
    // Aunque no necesita token para /ping, la estamos llamando con fetchFromBackend
    // por consistencia. Podría ser una llamada fetch simple sin token si /ping no lo requiere.
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
    const purchaseInput = document.getElementById("purchase");
    const incrementInput = document.getElementById("increment");
    const decrementInput = document.getElementById("decrement");
    const priceElement = document.getElementById("price");
    const balanceElement = document.getElementById("balance");
    const orqElement = document.getElementById("orq");
    const coverageElement = document.getElementById("coverage");

    if (!purchaseInput || !incrementInput || !decrementInput || !priceElement || !balanceElement || !orqElement || !coverageElement) {
        console.warn("Faltan elementos DOM para actualizar cálculos.");
        return;
    }

    const purchase = parseFloat(purchaseInput.value) || 0;
    const increment = parseFloat(incrementInput.value) || 100;
    const decrement = parseFloat(decrementInput.value) || 1;
    const priceText = priceElement.textContent;
    const price = parseFloat(priceText.replace(' USDT', '')) || 0;
    const balanceText = balanceElement.textContent;
    const balance = balanceText === 'Login to see' ? 0 : parseFloat(balanceText) || 0;


    const orq = calcularORQ(purchase, increment, balance);
    const coverage = calcularCoverage(orq, price, decrement);

    orqElement.textContent = orq;
    coverageElement.textContent = coverage.toFixed(2);
    ultimoCoverageValido = coverage;
}

async function toggleBotState() {
    if (!isLoggedIn) {
        alert("Please login first to control the bot.");
        return;
    }
    const startBtn = document.getElementById('start-btn');
    const resetBtn = document.getElementById('reset-btn');
    const botStateDisplay = document.getElementById('bot-state');
    const stopAtCycleEndCheckbox = document.getElementById('stop-at-cycle-end');

    if (!startBtn || !resetBtn || !botStateDisplay || !stopAtCycleEndCheckbox) {
        console.warn("Faltan elementos DOM para controlar el estado del bot.");
        return;
    }

    const purchase = parseFloat(document.getElementById("purchase").value);
    const increment = parseFloat(document.getElementById("increment").value);
    const decrement = parseFloat(document.getElementById("decrement").value);
    const trigger = parseFloat(document.getElementById("trigger").value);
    const stopAtCycleEnd = stopAtCycleEndCheckbox.checked;

    const action = startBtn.textContent === 'START' ? 'start' : 'stop';

    try {
        const response = await fetchFromBackend('/api/toggle-bot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, params: { purchase, increment, decrement, trigger, stopAtCycleEnd } })
        });

        if (response && response.success) {
            const newBotState = response.botState.status;
            isRunning = (newBotState === 'RUNNING');

            botStateDisplay.textContent = newBotState;
            botStateDisplay.className = isRunning ? 'text-green-400' : 'text-yellow-400';
            startBtn.textContent = isRunning ? 'STOP' : 'START';
            resetBtn.disabled = isRunning;
            stopAtCycleEndCheckbox.disabled = isRunning;

            document.getElementById('cycle').textContent = response.botState.cycle || 0;
            document.getElementById('profit').textContent = (response.botState.profit || 0).toFixed(2);
            document.getElementById('cycleprofit').textContent = (response.botState.cycleProfit || 0).toFixed(2);

            console.log(`Bot status updated: ${newBotState}`);
        } else {
            throw new Error(response.message || 'Failed to toggle bot state.');
        }
    } catch (error) {
        console.error('Error toggling bot state:', error);
        alert(`Error: ${error.message}`);
        isRunning = !isRunning; // Revertir el estado si hubo error
        botStateDisplay.textContent = isRunning ? 'RUNNING' : 'STOPPED';
        botStateDisplay.className = isRunning ? 'text-green-400' : 'text-yellow-400';
        startBtn.textContent = isRunning ? 'STOP' : 'START';
        resetBtn.disabled = isRunning;
        stopAtCycleEndCheckbox.disabled = isRunning;
    }
}

function resetBot() {
    document.getElementById('purchase').value = 5.00;
    document.getElementById('increment').value = 100;
    document.getElementById('decrement').value = 1.0;
    document.getElementById('trigger').value = 1.5;
    document.getElementById('stop-at-cycle-end').checked = false;
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
    checkLoginStatus(); // Esto debe ejecutarse primero

    // Setup de los tabs principales de navegación
    setupNavTabs();

    // Inicializar los cálculos y el estado de conexión del bot (si los elementos existen)
    // Se han añadido checks de isLoggedIn para estas funciones
    if (document.getElementById('balance')) getBalances(); // Llama a getBalances al inicio
    if (document.getElementById('price')) cargarPrecioEnVivo();
    if (document.getElementById('status-dot')) checkConnection();
    if (document.getElementById('tab-opened')) setActiveTab('tab-opened'); // Activar la pestaña 'Opened' por defecto

    // Configurar intervalos de actualización
    setInterval(getBalances, 10000); // Actualiza balances cada 10 segundos
    setInterval(cargarPrecioEnVivo, 250); // Actualiza precio muy rápido
    setInterval(checkConnection, 10000); // Checkea conexión con backend
    setInterval(() => fetchOrders(currentTab), 15000); // Actualiza órdenes cada 15 segundos

    // Event listeners para los botones del bot
    const startBtn = document.getElementById('start-btn');
    const resetBtn = document.getElementById('reset-btn');
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
    const purchaseInput = document.getElementById('purchase');
    const incrementInput = document.getElementById('increment');
    const decrementInput = document.getElementById('decrement');
    const triggerInput = document.getElementById('trigger');

    if (purchaseInput) purchaseInput.addEventListener('input', actualizarCalculos);
    if (incrementInput) incrementInput.addEventListener('input', actualizarCalculos);
    if (decrementInput) decrementInput.addEventListener('input', actualizarCalculos);
    if (triggerInput) triggerInput.addEventListener('input', actualizarCalculos);


    // --- Lógica para el modal de Autenticación (Login/Registro) ---

    // Manejador del Click en el Icono de Login/Logout
    if (loginLogoutIcon) {
        loginLogoutIcon.addEventListener('click', () => {
            if (isLoggedIn) {
                handleLogout(); // Si ya está logueado, la acción es desloguear
            } else {
                toggleAuthModal(true); // Si no está logueado, abre el modal
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
                        updateLoginIcon(); // Actualiza el icono inmediatamente
                        authMessage.textContent = data.message;
                        authMessage.style.color = 'green';
                        setTimeout(() => {
                            toggleAuthModal(false);
                            window.location.reload(); // Recargar la página es clave para que los intervalos y checks se reinicien con el estado logueado
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
            if (apiModal) {
                apiModal.style.display = 'flex'; // Usar 'flex' para centrado CSS
                apiStatusMessage.textContent = '';
                connectionIndicator.classList.remove('bg-green-500', 'bg-red-500', 'bg-yellow-500');
                connectionIndicator.classList.add('bg-gray-500'); // Default gray for not connected
                connectionText.textContent = 'Not Connected';

                // Opcional: Cargar las API keys existentes si ya están guardadas para el usuario
                // Esto requeriría una ruta en el backend como /api/user/bitmart/api-keys
                // fetchFromBackend('/api/user/bitmart/api-keys')
                //     .then(data => {
                //         if (data && data.apiKey) {
                //             apiKeyInput.value = data.apiKey;
                //             secretKeyInput.value = '********'; // No mostrar la secret key
                //             apiMemoInput.value = data.apiMemo || '';
                //             connectionIndicator.classList.replace('bg-gray-500', 'bg-green-500');
                //             connectionText.textContent = 'Last Connected';
                //         }
                //     })
                //     .catch(error => console.error("Error loading existing API keys:", error));
            }
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
            connectionIndicator.classList.add('bg-yellow-500'); // Indicador de "cargando"
            connectionText.textContent = 'Connecting...';

            try {
                // Aquí llamamos a la ruta en tu backend que guardará y validará las API Keys
                const response = await fetchFromBackend('/api/user/bitmart/save-api-keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey, secretKey, apiMemo })
                });

                if (response && response.success) { // Tu backend debería responder con { success: true, message: "..." }
                    apiStatusMessage.textContent = response.message || 'API keys validated and saved!';
                    apiStatusMessage.style.color = 'green';
                    connectionIndicator.classList.remove('bg-yellow-500', 'bg-red-500');
                    connectionIndicator.classList.add('bg-green-500');
                    connectionText.textContent = 'Connected';
                    // Disparar una actualización de balances y órdenes después de guardar las API keys
                    getBalances();
                    fetchOrders(currentTab);
                    // Opcional: Cerrar el modal después de un éxito
                    // setTimeout(() => { apiModal.style.display = 'none'; }, 2000);
                } else {
                    const errorMessage = response.error || 'Failed to validate or save API keys.';
                    apiStatusMessage.textContent = errorMessage;
                    apiStatusMessage.style.color = 'red';
                    connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
                    connectionIndicator.classList.add('bg-red-500');
                    connectionText.textContent = 'Disconnected';
                }
            } catch (error) {
                console.error('Error submitting API keys:', error);
                apiStatusMessage.textContent = `Error: ${error.message || 'Network issue.'}`;
                apiStatusMessage.style.color = 'red';
                connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
                connectionIndicator.classList.add('bg-red-500');
                connectionText.textContent = 'Disconnected';
            }
        });
    }

    // Cierra el modal de API con el botón de cerrar
    if (closeApiModalButton) {
        closeApiModalButton.addEventListener('click', () => {
            if (apiModal) {
                apiModal.style.display = 'none';
            }
        });
    }

    // Cierra cualquier modal al hacer clic fuera de él
    window.addEventListener('click', (event) => {
        if (event.target === authModal) {
            toggleAuthModal(false);
        }
        if (event.target === apiModal) {
            apiModal.style.display = 'none';
        }
    });

    // Toggle Dark/Lite Mode
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            if (document.body.classList.contains('dark-mode')) {
                localStorage.setItem('theme', 'dark');
            } else {
                localStorage.setItem('theme', 'lite');
            }
        });
        if (localStorage.getItem('theme') === 'lite') {
            document.body.classList.remove('dark-mode');
        } else {
            document.body.classList.add('dark-mode');
        }
    }

}); // Fin de DOMContentLoaded