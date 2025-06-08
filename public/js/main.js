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
const loginLogoutIcon = document.getElementById('login-logout-icon'); // El ID que añadimos en index.html
const apiKeyIcon = document.getElementById('api-key-icon'); // El ID que añadimos en index.html

const apiModal = document.getElementById('api-modal');
const closeApiModalButton = apiModal ? apiModal.querySelector('.close-button') : null;

// --- Estado de la Aplicación ---
let isLoggedIn = false; // Variable para controlar el estado de login
let isRunning = false; // Estado del bot
let ultimoCoverageValido = 0.00;
let currentTab = 'opened'; // Pestaña de órdenes activa
let currentDisplayedOrders = new Map(); // Mapa para optimizar la visualización de órdenes

// --- FUNCIONES DE AUTENTICACIÓN Y ESTADO DEL USUARIO ---

/**
 * Verifica si el usuario está logueado comprobando un token en localStorage.
 * Actualiza la variable `isLoggedIn` y el icono de login.
 */
function checkLoginStatus() {
    const token = localStorage.getItem('authToken'); // O el nombre de tu token
    if (token) {
        isLoggedIn = true;
    } else {
        isLoggedIn = false;
    }
    updateLoginIcon(); // Siempre actualiza el icono al verificar el estado
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
    if (authModal) { // Asegúrate de que el modal exista
        if (show) {
            authModal.style.display = 'block';
            authMessage.textContent = ''; // Limpiar mensajes anteriores
            emailInput.value = ''; // Limpiar campo de email
            tokenInput.value = ''; // Limpiar campo de token
            tokenInput.style.display = 'none'; // Asegurarse de que el campo de token esté oculto inicialmente
            emailInput.disabled = false; // Asegurarse de que el email esté habilitado
            authButton.textContent = 'Continue'; // Botón inicial
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
        // Llama a la ruta de deslogueo en el backend (opcional pero recomendado)
        // No es necesario enviar el token en el body para un simple "POST /logout"
        const response = await fetch(`${BACKEND_URL}/api/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (response.ok) {
            console.log('[FRONTEND] Deslogueo en backend exitoso:', data.message);
        } else {
            console.error('[FRONTEND] Error en deslogueo de backend:', data.message || 'Error desconocido');
        }
    } catch (error) {
        console.error('[FRONTEND] Falló la llamada al backend para deslogueo:', error);
        // El error en el backend no debe impedir el deslogueo local
    } finally {
        // Elimina el token del localStorage y cualquier otro dato de sesión
        localStorage.removeItem('authToken'); // <--- AJUSTA ESTE NOMBRE SI ES DIFERENTE
        localStorage.removeItem('userEmail'); // Opcional: Si guardas el email

        isLoggedIn = false; // Actualiza el estado local
        updateLoginIcon(); // Actualiza la UI del icono
        toggleAuthModal(false); // Asegura que el modal de auth esté cerrado

        alert('Has cerrado sesión exitosamente.'); // Notifica al usuario
        // Recargar la página es una buena práctica para resetear completamente el estado del frontend
        window.location.reload();
    }
}

// --- Helper Function for API Calls (Revisada para manejar errores y JSON) ---
async function fetchFromBackend(url, options = {}) {
    try {
        // Si el usuario está logueado, adjuntar el token a la cabecera Authorization
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
                // Intentar parsear el error como JSON para obtener un mensaje más detallado
                const errorData = await res.json();
                if (errorData.error) {
                    errorDetails = errorData.error;
                } else if (errorData.message) {
                    errorDetails = errorData.message;
                } else {
                    errorDetails = JSON.stringify(errorData); // Fallback si el JSON es válido pero sin 'error' o 'message'
                }
            } catch (jsonError) {
                // Si falla el parseo a JSON, usar el texto de la respuesta o un mensaje genérico
                errorDetails = await res.text() || `HTTP error! status: ${res.status} (non-JSON response or empty)`;
            }
            // Si el error es 401 (No autorizado) o 403 (Prohibido), podría indicar token inválido/expirado
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
        // Mostrar el error en la interfaz de usuario si aplica (ej. en la lista de órdenes)
        if (document.getElementById('order-list')) {
             document.getElementById('order-list').innerHTML = `<p class="text-red-400">Error: ${errorMessage}</p>`;
        }
        return null; // Asegura que se devuelva null en caso de error
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

    if (!orderListDiv) return; // Asegurarse de que el elemento exista

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


// --- Funciones para Obtener Datos de BitMart ---

async function getBalances() {
    if (!isLoggedIn) { // Solo intenta obtener balances si el usuario está logueado
        if (document.getElementById('balance')) {
            document.getElementById('balance').textContent = 'Login to see';
        }
        return;
    }
    try {
        const walletData = await fetchFromBackend('/api/balance');
        if (walletData) {
            const usdt = walletData.find(w => w.currency === "USDT");
            const balance = usdt ? parseFloat(usdt.available).toFixed(2) : '0.00';
            if (document.getElementById('balance')) {
                document.getElementById('balance').textContent = balance;
                actualizarCalculos();
            }
        } else {
            if (document.getElementById('balance')) {
                document.getElementById('balance').textContent = 'Error';
            }
        }
    } catch (error) {
        console.error('Error al cargar balances:', error);
        if (document.getElementById('balance')) {
            document.getElementById('balance').textContent = 'Error';
        }
    }
}

async function fetchOpenOrdersData() {
    if (!isLoggedIn) { // Solo intenta obtener órdenes si el usuario está logueado
        return [];
    }
    try {
        const orders = await fetchFromBackend(`/api/open-orders?symbol=${TRADE_SYMBOL}`);
        return orders || [];
    } catch (error) {
        console.error("Error fetching open orders data:", error);
        return [];
    }
}

async function fetchHistoryOrdersData(tab) {
    if (!isLoggedIn) { // Solo intenta obtener historial si el usuario está logueado
        return [];
    }
     try {
        // En una aplicación real, aquí llamarías a tu backend para las órdenes históricas.
        // Por ahora, solo devolverá un array vacío y un warning.
        console.warn(`Funcionalidad para ${tab} aún no implementada en el backend para historial.`);
        return [];
    } catch (error) {
        console.error("Error fetching historical orders data:", error);
        return [];
    }
}

async function fetchOrders(tab) {
    const orderListDiv = document.getElementById('order-list');
    if (!orderListDiv) return;

    if (!isLoggedIn) { // Muestra un mensaje si no está logueado
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

// --- Funciones Existentes (Ajustadas para llamadas al backend) ---

async function cargarPrecioEnVivo() {
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
    try {
        const response = await fetchFromBackend('/ping');
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');

        if (dot && text) { // Asegúrate de que los elementos existan
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
        if (dot && text) { // Asegúrate de que los elementos existan
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
    // Verifica si balanceText es "Login to see" antes de intentar parsearlo
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
        // Revertir la UI si hubo un error
        isRunning = !isRunning;
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
    checkLoginStatus();

    // Setup de los tabs principales de navegación
    setupNavTabs();

    // Inicializar los cálculos y el estado de conexión del bot (si los elementos existen)
    // Se han añadido checks de isLoggedIn para estas funciones
    if (document.getElementById('balance')) getBalances();
    if (document.getElementById('price')) cargarPrecioEnVivo();
    if (document.getElementById('status-dot')) checkConnection();
    if (document.getElementById('tab-opened')) setActiveTab('tab-opened'); // Activar la pestaña 'Opened' por defecto

    // Configurar intervalos de actualización
    setInterval(getBalances, 10000);
    setInterval(cargarPrecioEnVivo, 250);
    setInterval(checkConnection, 10000);
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
    if (authForm) { // Asegúrate de que el formulario exista
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
                        emailInput.disabled = true; // Deshabilita el email
                        tokenInput.style.display = 'block'; // Muestra el campo de token
                        authButton.textContent = 'Verify'; // Cambia el texto del botón
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
                        localStorage.setItem('authToken', data.token); // Guarda el token
                        localStorage.setItem('userEmail', email); // Guarda el email (opcional)
                        isLoggedIn = true; // Actualiza el estado local
                        updateLoginIcon(); // Actualiza el icono
                        authMessage.textContent = data.message;
                        authMessage.style.color = 'green';
                        setTimeout(() => {
                            toggleAuthModal(false); // Cierra el modal después de un breve tiempo
                            window.location.reload(); // Recarga la página para aplicar el estado de login
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
    // (Esta lógica aún no incluye el envío al backend ni la validación de BitMart,
    // solo abre y cierra el modal. La implementaremos una vez que el login funcione).

    // Abre el modal de API con el icono de la llave
    if (apiKeyIcon) {
        apiKeyIcon.addEventListener('click', () => {
            if (!isLoggedIn) { // Requiere login para configurar la API
                alert("Please login first to configure API keys.");
                toggleAuthModal(true); // Opcional: abre el modal de login
                return;
            }
            if (apiModal) { // Asegúrate de que el modal exista
                apiModal.style.display = 'block';
                // Limpiar mensajes anteriores y resetear el indicador
                document.getElementById('api-status-message').textContent = '';
                document.getElementById('connection-indicator').classList.remove('bg-green-500', 'bg-red-500', 'bg-yellow-500');
                document.getElementById('connection-text').textContent = '';
            }
        });
    }

    // Cierra el modal de API con el botón de cerrar
    if (closeApiModalButton) {
        closeApiModalButton.addEventListener('click', () => {
            if (apiModal) { // Asegúrate de que el modal exista
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

    // Toggle Dark/Lite Mode (Lógica existente)
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            // Puedes guardar la preferencia del usuario en localStorage
            if (document.body.classList.contains('dark-mode')) {
                localStorage.setItem('theme', 'dark');
            } else {
                localStorage.setItem('theme', 'lite');
            }
        });

        // Cargar preferencia al inicio
        if (localStorage.getItem('theme') === 'lite') {
            document.body.classList.remove('dark-mode');
        } else {
            document.body.classList.add('dark-mode');
        }
    }

}); // Fin de DOMContentLoaded




const TRADE_SYMBOL = 'BTC_USDT'; // Define el símbolo para las órdenes

// --- Elementos del DOM ---
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const tokenInput = document.getElementById('token');
const authButton = document.getElementById('auth-button');
const authMessage = document.getElementById('auth-message');
const loginLogoutIcon = document.getElementById('login-logout-icon'); // El ID que añadimos en index.html
const apiKeyIcon = document.getElementById('api-key-icon'); // El ID que añadimos en index.html

const apiModal = document.getElementById('api-modal');
const closeApiModalButton = apiModal ? apiModal.querySelector('.close-button') : null;

// --- Estado de la Aplicación ---
let isLoggedIn = false; // Variable para controlar el estado de login
let isRunning = false; // Estado del bot
let ultimoCoverageValido = 0.00;
let currentTab = 'opened'; // Pestaña de órdenes activa
let currentDisplayedOrders = new Map(); // Mapa para optimizar la visualización de órdenes

// --- FUNCIONES DE AUTENTICACIÓN Y ESTADO DEL USUARIO ---

/**
 * Verifica si el usuario está logueado comprobando un token en localStorage.
 * Actualiza la variable `isLoggedIn` y el icono de login.
 */
function checkLoginStatus() {
    const token = localStorage.getItem('authToken'); // O el nombre de tu token
    if (token) {
        isLoggedIn = true;
    } else {
        isLoggedIn = false;
    }
    updateLoginIcon(); // Siempre actualiza el icono al verificar el estado
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
    if (authModal) { // Asegúrate de que el modal exista
        if (show) {
            authModal.style.display = 'block';
            authMessage.textContent = ''; // Limpiar mensajes anteriores
            emailInput.value = ''; // Limpiar campo de email
            tokenInput.value = ''; // Limpiar campo de token
            tokenInput.style.display = 'none'; // Asegurarse de que el campo de token esté oculto inicialmente
            emailInput.disabled = false; // Asegurarse de que el email esté habilitado
            authButton.textContent = 'Continue'; // Botón inicial
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
        // Llama a la ruta de deslogueo en el backend (opcional pero recomendado)
        // No es necesario enviar el token en el body para un simple "POST /logout"
        const response = await fetch(`${BACKEND_URL}/api/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (response.ok) {
            console.log('[FRONTEND] Deslogueo en backend exitoso:', data.message);
        } else {
            console.error('[FRONTEND] Error en deslogueo de backend:', data.message || 'Error desconocido');
        }
    } catch (error) {
        console.error('[FRONTEND] Falló la llamada al backend para deslogueo:', error);
        // El error en el backend no debe impedir el deslogueo local
    } finally {
        // Elimina el token del localStorage y cualquier otro dato de sesión
        localStorage.removeItem('authToken'); // <--- AJUSTA ESTE NOMBRE SI ES DIFERENTE
        localStorage.removeItem('userEmail'); // Opcional: Si guardas el email

        isLoggedIn = false; // Actualiza el estado local
        updateLoginIcon(); // Actualiza la UI del icono
        toggleAuthModal(false); // Asegura que el modal de auth esté cerrado

        alert('Has cerrado sesión exitosamente.'); // Notifica al usuario
        // Recargar la página es una buena práctica para resetear completamente el estado del frontend
        window.location.reload();
    }
}

// --- Helper Function for API Calls (Revisada para manejar errores y JSON) ---
async function fetchFromBackend(url, options = {}) {
    try {
        // Si el usuario está logueado, adjuntar el token a la cabecera Authorization
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
                // Intentar parsear el error como JSON para obtener un mensaje más detallado
                const errorData = await res.json();
                if (errorData.error) {
                    errorDetails = errorData.error;
                } else if (errorData.message) {
                    errorDetails = errorData.message;
                } else {
                    errorDetails = JSON.stringify(errorData); // Fallback si el JSON es válido pero sin 'error' o 'message'
                }
            } catch (jsonError) {
                // Si falla el parseo a JSON, usar el texto de la respuesta o un mensaje genérico
                errorDetails = await res.text() || `HTTP error! status: ${res.status} (non-JSON response or empty)`;
            }
            // Si el error es 401 (No autorizado) o 403 (Prohibido), podría indicar token inválido/expirado
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
        // Mostrar el error en la interfaz de usuario si aplica (ej. en la lista de órdenes)
        if (document.getElementById('order-list')) {
             document.getElementById('order-list').innerHTML = `<p class="text-red-400">Error: ${errorMessage}</p>`;
        }
        return null; // Asegura que se devuelva null en caso de error
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

    if (!orderListDiv) return; // Asegurarse de que el elemento exista

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


// --- Funciones para Obtener Datos de BitMart ---

async function getBalances() {
    try {
        const walletData = await fetchFromBackend('/api/balance');
        if (walletData) {
            const usdt = walletData.find(w => w.currency === "USDT");
            const balance = usdt ? parseFloat(usdt.available).toFixed(2) : '0.00';
            if (document.getElementById('balance')) {
                document.getElementById('balance').textContent = balance;
                actualizarCalculos();
            }
        } else {
            if (document.getElementById('balance')) {
                document.getElementById('balance').textContent = 'Error';
            }
        }
    } catch (error) {
        console.error('Error al cargar balances:', error);
        if (document.getElementById('balance')) {
            document.getElementById('balance').textContent = 'Error';
        }
    }
}

async function fetchOpenOrdersData() {
    try {
        const orders = await fetchFromBackend(`/api/open-orders?symbol=${TRADE_SYMBOL}`);
        return orders || [];
    } catch (error) {
        console.error("Error fetching open orders data:", error);
        return [];
    }
}

async function fetchHistoryOrdersData(tab) {
     try {
        // En una aplicación real, aquí llamarías a tu backend para las órdenes históricas.
        // Por ahora, solo devolverá un array vacío y un warning.
        console.warn(`Funcionalidad para ${tab} aún no implementada en el backend para historial.`);
        return [];
    } catch (error) {
        console.error("Error fetching historical orders data:", error);
        return [];
    }
}

async function fetchOrders(tab) {
    const orderListDiv = document.getElementById('order-list');
    if (!orderListDiv) return;

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

// --- Funciones Existentes (Ajustadas para llamadas al backend) ---

async function cargarPrecioEnVivo() {
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
    try {
        const response = await fetchFromBackend('/ping');
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');

        if (dot && text) { // Asegúrate de que los elementos existan
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
        if (dot && text) { // Asegúrate de que los elementos existan
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
    const balance = parseFloat(balanceText) || 0;

    const orq = calcularORQ(purchase, increment, balance);
    const coverage = calcularCoverage(orq, price, decrement);

    orqElement.textContent = orq;
    coverageElement.textContent = coverage.toFixed(2);
    ultimoCoverageValido = coverage;
}

async function toggleBotState() {
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
        // Revertir la UI si hubo un error
        isRunning = !isRunning;
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
    checkLoginStatus();

    // Setup de los tabs principales de navegación
    setupNavTabs();

    // Inicializar los cálculos y el estado de conexión del bot (si los elementos existen)
    if (document.getElementById('balance')) getBalances();
    if (document.getElementById('price')) cargarPrecioEnVivo();
    if (document.getElementById('status-dot')) checkConnection();
    if (document.getElementById('tab-opened')) setActiveTab('tab-opened'); // Activar la pestaña 'Opened' por defecto

    // Configurar intervalos de actualización
    setInterval(getBalances, 10000);
    setInterval(cargarPrecioEnVivo, 250);
    setInterval(checkConnection, 10000);
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
    if (authForm) { // Asegúrate de que el formulario exista
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
                        emailInput.disabled = true; // Deshabilita el email
                        tokenInput.style.display = 'block'; // Muestra el campo de token
                        authButton.textContent = 'Verify'; // Cambia el texto del botón
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
                        localStorage.setItem('authToken', data.token); // Guarda el token
                        localStorage.setItem('userEmail', email); // Guarda el email (opcional)
                        isLoggedIn = true; // Actualiza el estado local
                        updateLoginIcon(); // Actualiza el icono
                        authMessage.textContent = data.message;
                        authMessage.style.color = 'green';
                        setTimeout(() => {
                            toggleAuthModal(false); // Cierra el modal después de un breve tiempo
                            window.location.reload(); // Recarga la página para aplicar el estado de login
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

    // Abre el modal de API con el icono de la llave
    if (apiKeyIcon) {
        apiKeyIcon.addEventListener('click', () => {
            if (apiModal) { // Asegúrate de que el modal exista
                apiModal.style.display = 'block';
            }
        });
    }

    // Cierra el modal de API con el botón de cerrar
    if (closeApiModalButton) {
        closeApiModalButton.addEventListener('click', () => {
            if (apiModal) { // Asegúrate de que el modal exista
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

    // Toggle Dark/Lite Mode (Lógica existente)
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            // Puedes guardar la preferencia del usuario en localStorage
            if (document.body.classList.contains('dark-mode')) {
                localStorage.setItem('theme', 'dark');
            } else {
                localStorage.setItem('theme', 'lite');
            }
        });

        // Cargar preferencia al inicio
        if (localStorage.getItem('theme') === 'lite') {
            document.body.classList.remove('dark-mode');
        } else {
            document.body.classList.add('dark-mode');
        }
    }

}); // Fin de DOMContentLoaded