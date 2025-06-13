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
const apiStatusMessageModal = document.getElementById('api-status-message-modal'); // Mensaje de estado API en el modal (ID corregido)
const connectionIndicatorModal = document.getElementById('connection-indicator-modal'); // Círculo indicador API en el modal (ID corregido)
const connectionTextModal = document.getElementById('connection-text-modal'); // Texto indicador API en el modal (ID corregido)


// Autobot Section Specific Elements (from index.html, IDs corrected)
const profitText = document.getElementById('profit-text');
const botStatusText = document.getElementById('bot-status-text');
const currentPriceText = document.getElementById('current-price-text');
const cycleProfitText = document.getElementById('cycle-profit-text');
const balanceBTCText = document.getElementById('balance-btc');
const cycleText = document.getElementById('cycle-text');
const balanceUSDTText = document.getElementById('balance-usdt');
const orqText = document.getElementById('orq-text'); // Corrected ID

const purchaseAmountInput = document.getElementById('purchase-amount'); // Corrected ID
const incrementPercentageInput = document.getElementById('increment-percentage'); // Corrected ID
const decrementPercentageInput = document.getElementById('decrement-percentage'); // Corrected ID
const triggerPercentageInput = document.getElementById('trigger-percentage'); // Corrected ID
const stopOnCycleEndCheckbox = document.getElementById('stop-on-cycle-end'); // Corrected ID
const startBotBtn = document.getElementById('start-bot-btn'); // Corrected ID
const stopBotBtn = document.getElementById('stop-bot-btn'); // Corrected ID

// Connection status elements within the Autobot section's API status box (IDs corrected)
const apiStatusMessagePanel = document.getElementById('api-status-message-panel'); 
const connectionIndicatorPanel = document.getElementById('connection-indicator-panel');
const connectionTextPanel = document.getElementById('connection-text-panel');

// Order Tabs
const tabOpened = document.getElementById('tab-opened');
const tabFilled = document.getElementById('tab-filled');
const tabCancelled = document.getElementById('tab-cancelled');
const tabAll = document.getElementById('tab-all');
const orderListDiv = document.getElementById('order-list');


// --- Estado de la Aplicación ---
let isLoggedIn = false; // Este seguirá siendo falso para la prueba de pestañas
let isRunning = false;
let ultimoCoverageValido = 0.00;
let currentTab = 'opened';
let currentDisplayedOrders = new Map();

// Variables para intervalos de actualización (no se iniciarán en esta prueba)
let balanceIntervalId = null;
let orderHistoryIntervalId = null;

// --- FUNCIONES DE AUTENTICACIÓN Y ESTADO DEL USUARIO (TEMPORALMENTE NO USADAS EN ESTA PRUEBA) ---

function checkLoginStatus() {
    // Comentado para esta prueba
    // const token = localStorage.getItem('authToken');
    // isLoggedIn = !!token;
}

function updateLoginIcon() {
    if (loginLogoutIcon) {
        if (isLoggedIn) {
            loginLogoutIcon.classList.remove('fa-sign-in-alt');
            loginLogoutIcon.classList.add('fa-sign-out-alt');
            loginLogoutIcon.title = 'Logout';
        } else {
            loginLogoutIcon.classList.remove('fa-sign-out-alt');
            loginLogoutIcon.classList.add('fa-sign-in-alt');
            loginLogoutIcon.title = 'Login';
        }
    }
}

function toggleAuthModal(show) {
    if (authModal) {
        if (show) {
            authModal.style.display = 'flex';
            if (authMessage) authMessage.textContent = '';
            if (emailInput) emailInput.value = '';
            if (tokenInput) tokenInput.value = '';
            if (tokenInput) tokenInput.style.display = 'none';
            if (emailInput) emailInput.disabled = false;
            if (authButton) authButton.textContent = 'Continue';
        } else {
            authModal.style.display = 'none';
        }
    }
}

async function handleLogout() {
    console.log('[FRONTEND] Intentando desloguear...');
    // Lógica de logout simulada para esta prueba
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    isLoggedIn = false;
    updateLoginIcon();
    toggleAuthModal(false); // Oculta el modal, pero la app-section ya está visible
    console.log('Has cerrado sesión exitosamente (simulado).');
    // window.location.reload(); // Evitar recarga para no perder el estado de prueba
}

// --- Helper Function for API Calls (No se usarán para funcionalidad de pestañas, pero se mantienen) ---
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
            // Esto solo se ejecutará si se intenta una llamada API protegida
            console.log("Tu sesión ha expirado o no es válida. Por favor, inicia sesión de nuevo.");
            handleLogout();
            throw new Error("No autorizado o Prohibido");
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
        const errorMessage = error instanceof Error ? error.message : String(error || "Unknown error occurred.");
        if (orderListDiv) {
             orderListDiv.innerHTML = `<p class="text-red-400">Error: ${errorMessage}</p>`;
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


// --- Funciones para Obtener Datos de BitMart (NO SE USARÁN EN ESTA PRUEBA) ---

async function getBalances() {
    console.log("getBalances: No se ejecuta en esta fase de prueba.");
    if (balanceUSDTText) balanceUSDTText.textContent = 'N/A';
    if (balanceBTCText) balanceBTCText.textContent = 'N/A';
}

async function fetchOpenOrdersData() {
    console.log("fetchOpenOrdersData: No se ejecuta en esta fase de prueba.");
    return [];
}

async function fetchHistoryOrdersData(tab) {
    console.log(`fetchHistoryOrdersData (${tab}): No se ejecuta en esta fase de prueba.`);
    return [];
}

async function fetchOrders(tab) {
    console.log(`fetchOrders (${tab}): No se ejecuta en esta fase de prueba.`);
    if (orderListDiv) orderListDiv.innerHTML = `<p class="text-gray-400">Las órdenes se cargarán después de implementar la lógica de API.</p>`;
}

// --- Otras Funciones del Bot (NO SE USARÁN EN ESTA PRUEBA) ---

async function cargarPrecioEnVivo() {
    // Esta función no requiere autenticación de usuario ya que es una API pública de Binance
    try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const data = await res.json();
        const price = parseFloat(data.price).toFixed(2);
        if (currentPriceText) {
            currentPriceText.textContent = price;
            actualizarCalculos(); // Se llamará solo si los inputs están presentes
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
    return 0; // Simulamos por ahora
}

function calcularCoverage(orq, price, decrement) {
    return 0; // Simulamos por ahora
}

function actualizarCalculos() {
    // Las referencias a elementos DOM aquí ya están corregidas para que apunten a los IDs correctos
    const purchase = parseFloat(purchaseAmountInput.value) || 0;
    const increment = parseFloat(incrementPercentageInput.value) || 0;
    const decrement = parseFloat(decrementPercentageInput.value) || 0;
    const trigger = parseFloat(triggerPercentageInput.value) || 0;

    const price = parseFloat(currentPriceText.textContent) || 0;
    const balance = parseFloat(balanceUSDTText.textContent) || 0;

    const orq = calcularORQ(purchase, increment, balance);
    const coverage = calcularCoverage(orq, price, decrement);

    if (orqText) orqText.textContent = orq;
    // No hay un elemento específico para 'coverage' con ID en tu HTML, por ahora no se actualiza visiblemente.
}

function updateBotStateUI(state) {
    if (botStatusText) botStatusText.textContent = state.state;
    if (cycleText) cycleText.textContent = state.cycle;
    if (profitText) profitText.textContent = `${state.profit ? state.profit.toFixed(2) : '0.00'}`;
    if (cycleProfitText) cycleProfitText.textContent = `${state.cycleProfit ? state.cycleProfit.toFixed(2) : '0.00'}`;
    if (currentPriceText) currentPriceText.textContent = `${state.currentPrice ? state.currentPrice.toFixed(2) : '0.00'}`;
    if (purchaseAmountInput) purchaseAmountInput.value = state.purchaseAmount || '';
    if (incrementPercentageInput) incrementPercentageInput.value = state.incrementPercentage || '';
    if (decrementPercentageInput) decrementPercentageInput.value = state.decrementPercentage || '';
    if (triggerPercentageInput) triggerPercentageInput.value = state.triggerPercentage || '';
    if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.checked = state.stopOnCycleEnd || false;
    
    const isDisabled = !(state.state === 'STOPPED' || state.state === 'ERROR' || state.state === 'NO_COVERAGE');
    
    if (purchaseAmountInput) purchaseAmountInput.disabled = isDisabled;
    if (incrementPercentageInput) incrementPercentageInput.disabled = isDisabled;
    if (decrementPercentageInput) decrementPercentageInput.disabled = isDisabled;
    if (triggerPercentageInput) triggerPercentageInput.disabled = isDisabled;
    if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.disabled = isDisabled;
    
    if (startBotBtn) startBotBtn.disabled = isDisabled;
    if (stopBotBtn) stopBotBtn.disabled = !isDisabled;
}

async function toggleBotState() {
    console.log("toggleBotState: No se ejecuta en esta fase de prueba.");
    // alert("Bot controls are disabled for this testing phase.");
}


// --- Lógica de Cambio de Pestañas (Dashboard, Testbot, Autobot, Aibot) ---
function setupNavTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    navTabs.forEach(tab => {
        tab.addEventListener('click', function(event) {
            event.preventDefault();
            const targetId = this.dataset.tab; // e.g., 'dashboard', 'autobot'
            const targetSectionId = targetId + '-section'; // e.g., 'dashboard-section'

            navTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            tabContents.forEach(content => {
                if (content.id === targetSectionId) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });

            // Llamadas de prueba para verificar que la lógica de la pestaña Autobot se activa
            if (targetId === 'autobot') {
                console.log("Pestaña Autobot activada. Ejecutando funciones de prueba:");
                cargarPrecioEnVivo(); // Esta SÍ funciona
                checkConnection(); // Esta SÍ funciona
                // Las demás funciones (getBalances, fetchOrders, loadBotState) están comentadas/simuladas para esta fase.
            } else {
                // Al cambiar a otra pestaña que no sea Autobot, limpiar el contenido de las órdenes
                if (orderListDiv) orderListDiv.innerHTML = `<p class="text-gray-400">Contenido de órdenes no relevante para esta pestaña.</p>`;
            }
        });
    });

    // Activar la pestaña inicial al cargar la página
    // Prioridad: 1. Hash de la URL, 2. Pestaña con clase 'active' en HTML, 3. 'dashboard' por defecto
    const initialHashTab = window.location.hash.substring(1); // Eliminar '#'
    let initialTabToActivate = 'dashboard'; // Por defecto

    if (initialHashTab && document.querySelector(`.nav-tab[data-tab="${initialHashTab}"]`)) {
        initialTabToActivate = initialHashTab;
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
    const orderTabButtons = document.querySelectorAll('#autobot-section button[id^="tab-"]'); // Selects buttons starting with 'tab-'

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
            fetchOrders(currentTab); // Cargar órdenes para la nueva pestaña (simulada)
        });
    });

    // Activar la pestaña 'Opened' por defecto al inicio
    if (tabOpened) {
        tabOpened.click(); // Simula click para activar la lógica
    }
}


// --- Gestión de Intervalos de Actualización (NO SE INICIARÁN EN ESTA PRUEBA) ---
function startIntervals() {
    // Solo iniciar intervalos que NO dependen de la autenticación
    setInterval(cargarPrecioEnVivo, 250); // Actualiza precio muy rápido
    setInterval(checkConnection, 10000); // Checkea conexión con backend
    console.log("Intervalos de precio y conexión backend iniciados (sin autenticación).");
}

function clearIntervals() {
    // No hay intervalos activos por el momento para detener aquí
}

// --- Event Listeners del DOMContentLoaded (punto de entrada principal) ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializar la verificación del estado de login (comentado, isLoggedIn será false)
    // checkLoginStatus(); 
    
    // 2. Configurar la UI inicial (app-section visible, auth modal oculto)
    // updateAuthUI(!isLoggedIn); // Comentado para esta prueba, ya que app-section está visible en HTML

    // 3. Setup de los tabs principales de navegación
    setupNavTabs();

    // 4. Setup de los tabs de órdenes
    setupOrderTabs();

    // 5. Event listeners para los inputs de cálculos del bot
    // Asegurar que las referencias a los inputs son correctas
    if (purchaseAmountInput) purchaseAmountInput.addEventListener('input', actualizarCalculos);
    if (incrementPercentageInput) incrementPercentageInput.addEventListener('input', actualizarCalculos);
    if (decrementPercentageInput) decrementPercentageInput.addEventListener('input', actualizarCalculos);
    if (triggerPercentageInput) triggerPercentageInput.addEventListener('input', actualizarCalculos);

    // 6. Event listeners para los botones del bot (deshabilitados o simulados en esta fase)
    if (startBotBtn) startBotBtn.addEventListener('click', toggleBotState);
    if (stopBotBtn) stopBotBtn.addEventListener('click', toggleBotState);

    // 7. Event listeners para el modal de Autenticación (Login/Registro) - Lógica de auth deshabilitada para esta prueba
    if (loginLogoutIcon) {
        loginLogoutIcon.addEventListener('click', () => {
            console.log("Login/Logout clickeado - Autenticación deshabilitada para esta prueba.");
            // toggleAuthModal(true); // Puedes descomentar para ver el modal, pero no funcionará la autenticación
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("Auth form submit - Autenticación deshabilitada para esta prueba.");
            // Lógica de auth deshabilitada
        });
    }

    // 8. Event listeners para el modal de API - Lógica de API deshabilitada para esta prueba
    if (apiKeyIcon) {
        apiKeyIcon.addEventListener('click', () => {
            console.log("API icon clickeado - API deshabilitada para esta prueba.");
            if (apiModal) apiModal.style.display = 'flex'; // Puedes ver el modal, pero no funcionará la API
        });
    }

    if (closeApiModalButton && apiModal) {
        closeApiModalButton.addEventListener('click', () => {
            apiModal.style.display = 'none';
        });
        window.addEventListener('click', (event) => {
            if (event.target === apiModal) {
                apiModal.style.display = 'none';
            }
        });
    }

    if (apiForm) {
        apiForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("API form submit - API deshabilitada para esta prueba.");
            // Lógica de API deshabilitada
        });
    }

    // Iniciar intervalos de funciones que no dependen de la autenticación
    startIntervals();
});
