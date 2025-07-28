// public/js/main.js

// --- Importaciones de Módulos ---
// Importa las funciones y variables necesarias de tus módulos.
// Las rutas son relativas al archivo main.js.
import { fetchFromBackend, displayLogMessage, isLoggedIn, checkLoginStatus, handleLogout } from './modules/auth.js';
import { toggleAuthModal, toggleApiModal, updateLoginIcon } from './modules/modals.js';
import { getBalances } from './modules/balance.js';
import { fetchOrders, setActiveTab, displayOrders, createOrderElement, updateOrderElement } from './modules/orders.js';
import { cargarPrecioEnVivo, checkConnection } from './modules/network.js';
import { actualizarCalculos } from './modules/calculations.js'; // Solo importamos la función, no la variable
import { loadBotConfigAndState, toggleBotState, resetBot } from './modules/bot.js';
import { setupNavTabs } from './modules/navigation.js';

// --- Constantes Globales (se mantienen aquí porque son usadas en varios módulos) ---
// Estas se exportan para que otros módulos puedan importarlas si las necesitan.
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL = 'BTC_USDT';

// --- Elementos del DOM (Exportados para que otros módulos puedan acceder a ellos directamente) ---
// Definimos una variable `let` para cada elemento del DOM que necesitamos acceder globalmente.
// Estos se inicializan a `null` y se asignan dentro de `DOMContentLoaded`
// para asegurar que el DOM esté completamente cargado antes de intentar acceder a ellos.
// Así, otros módulos pueden importarlos directamente.

// Elementos de Autenticación/Modal
export let authModal = null;
export let authForm = null;
export let emailInput = null;
export let tokenInput = null;
export let authButton = null;
export let authMessage = null;
export let loginLogoutIcon = null;

// Elementos de Configuración de API/Modal
export let apiKeyIcon = null;
export let apiModal = null;
export let closeApiModalButton = null;
export let apiKeyInput = null;
export let secretKeyInput = null;
export let apiMemoInput = null;
export let apiStatusMessage = null;
export let connectionIndicator = null;
export let connectionText = null;
export let apiForm = null;

// Elemento de Log Message
export let logMessageElement = null;

// Elementos del Bot (Inputs y Displays)
export let purchaseInput = null;
export let incrementInput = null;
export let decrementInput = null;
export let triggerInput = null;
export let stopAtCycleEndCheckbox = null;
export let botStateDisplay = null;
export let cycleDisplay = null;
export let profitDisplay = null;
export let cycleProfitDisplay = null;
export let startBtn = null;
export let resetBtn = null;

// --- Event Listener Principal para el DOM ---
// Todo el código que interactúa con el DOM debe estar dentro de este listener,
// para asegurar que los elementos HTML ya existen.
document.addEventListener('DOMContentLoaded', () => {
    // --- Asignación de Elementos del DOM ---
    // Asignamos las variables exportadas a sus respectivos elementos del DOM.
    // Esto es crucial para que los módulos importen referencias válidas.
    authModal = document.getElementById('auth-modal');
    authForm = document.getElementById('auth-form');
    emailInput = document.getElementById('email');
    tokenInput = document.getElementById('token');
    authButton = document.getElementById('auth-button');
    authMessage = document.getElementById('auth-message');
    loginLogoutIcon = document.getElementById('login-logout-icon');

    apiKeyIcon = document.getElementById('api-key-icon');
    apiModal = document.getElementById('api-modal');
    // closeApiModalButton debe ser asignado después de que apiModal exista
    closeApiModalButton = apiModal ? apiModal.querySelector('.close-button') : null;
    apiKeyInput = document.getElementById('api-key');
    secretKeyInput = document.getElementById('secret-key');
    apiMemoInput = document.getElementById('api-memo');
    apiStatusMessage = document.getElementById('api-status-message');
    connectionIndicator = document.getElementById('connection-indicator');
    connectionText = document.getElementById('connection-text');
    apiForm = document.getElementById('api-form');

    logMessageElement = document.getElementById('log-message');

    purchaseInput = document.getElementById("purchase");
    incrementInput = document.getElementById("increment");
    decrementInput = document.getElementById("decrement");
    triggerInput = document.getElementById("trigger");
    stopAtCycleEndCheckbox = document.getElementById('stop-at-cycle-end');
    botStateDisplay = document.getElementById('bot-state');
    cycleDisplay = document.getElementById('cycle');
    profitDisplay = document.getElementById('profit');
    cycleProfitDisplay = document.getElementById('cycleprofit');
    startBtn = document.getElementById('start-btn');
    resetBtn = document.getElementById('reset-btn');

    // --- Inicializaciones ---
    // Inicia las funciones principales de tu aplicación.

    // 1. Configura la navegación de las pestañas principales (Dashboard, Autobot, etc.)
    setupNavTabs();

    // 2. Verifica el estado de login al cargar la página.
    checkLoginStatus();

    // 3. Carga la configuración y estado del bot si el usuario está logueado.
    loadBotConfigAndState();

    // 4. Obtiene balances, precio en vivo y chequea la conexión (si los elementos existen).
    // Es importante llamar a `actualizarCalculos` después de obtener estos datos,
    // ya que `actualizarCalculos` depende de ellos.
    if (document.getElementById('balance')) getBalances(); // getBalances llama a actualizarCalculos
    if (document.getElementById('price')) cargarPrecioEnVivo(); // cargarPrecioEnVivo llama a actualizarCalculos
    if (document.getElementById('status-dot')) checkConnection();

    // 5. Establece la pestaña de órdenes activa por defecto (normalmente 'opened').
    // Esto disparará la carga inicial de órdenes.
    if (document.getElementById('tab-opened')) {
        // 'opened' es el data-tab del botón #tab-opened
        setActiveTab('tab-opened');
    }

    // --- Configuración de Intervalos de Actualización ---
    // Actualizaciones periódicas para mantener la UI al día.
    setInterval(getBalances, 10000); // Actualiza balances cada 10 segundos
    setInterval(cargarPrecioEnVivo, 2000); // Actualiza precio cada 2 segundos
    setInterval(checkConnection, 10000); // Chequea conexión cada 10 segundos
    // currentTab es manejado por el módulo orders, por eso se pasa como argumento
    setInterval(() => fetchOrders(document.querySelector('.autobot-tabs button.active-tab')?.id || 'tab-opened'), 15000); // Actualiza órdenes cada 15 segundos

    // --- Event Listeners ---
    // Configura los oyentes de eventos para las interacciones del usuario.

    // Botones del bot
    if (startBtn) startBtn.addEventListener('click', toggleBotState);
    if (resetBtn) resetBtn.addEventListener('click', resetBot);

    // Pestañas de órdenes (Opened, Filled, Cancelled, All)
    const tabOpened = document.getElementById('tab-opened');
    const tabFilled = document.getElementById('tab-filled');
    const tabCancelled = document.getElementById('tab-cancelled');
    const tabAll = document.getElementById('tab-all');

    if (tabOpened) tabOpened.addEventListener('click', () => setActiveTab('tab-opened'));
    if (tabFilled) tabFilled.addEventListener('click', () => setActiveTab('tab-filled'));
    if (tabCancelled) tabCancelled.addEventListener('click', () => setActiveTab('tab-cancelled'));
    if (tabAll) tabAll.addEventListener('click', () => setActiveTab('tab-all'));


    // Inputs de cálculos del bot (llaman a actualizarCalculos en cada cambio)
    if (purchaseInput) purchaseInput.addEventListener('input', actualizarCalculos);
    if (incrementInput) incrementInput.addEventListener('input', actualizarCalculos);
    if (decrementInput) decrementInput.addEventListener('input', actualizarCalculos);
    if (triggerInput) triggerInput.addEventListener('input', actualizarCalculos);

    // --- Lógica para el modal de Autenticación (Login/Registro) ---
    if (loginLogoutIcon) {
        loginLogoutIcon.addEventListener('click', () => {
            // isLoggedIn ahora es una variable importada del módulo auth.js
            if (isLoggedIn) {
                handleLogout(); // Llama a la función de logout del módulo auth.js
            } else {
                toggleAuthModal(true); // Abre el modal de auth del módulo modals.js
            }
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailInput.value;
            const token = tokenInput.value;

            authMessage.textContent = 'Processing...';
            authMessage.style.color = 'yellow';
            displayLogMessage('Authentication process started...', 'info');

            try {
                let response;
                let data;

                if (tokenInput.style.display === 'none') {
                    // Si el campo de token está oculto, significa que estamos solicitando un token.
                    response = await fetch(`${BACKEND_URL}/api/auth/request-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    data = await response.json();

                    if (response.ok) {
                        authMessage.textContent = data.message;
                        authMessage.style.color = 'green';
                        emailInput.disabled = true; // Deshabilita el email para que el usuario ingrese el token
                        tokenInput.style.display = 'block'; // Muestra el campo de token
                        authButton.textContent = 'Verify'; // Cambia el texto del botón
                        displayLogMessage(`Verification token sent to ${email}.`, 'success');
                    } else {
                        authMessage.textContent = data.error || 'Server error. Please try again later.';
                        authMessage.style.color = 'red';
                        displayLogMessage(`Token request failed: ${data.error || 'Unknown error'}.`, 'error');
                    }
                } else {
                    // Si el campo de token está visible, significa que estamos verificando el token.
                    response = await fetch(`${BACKEND_URL}/api/auth/verify-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, token })
                    });
                    data = await response.json();

                    if (response.ok) {
                        localStorage.setItem('authToken', data.token);
                        localStorage.setItem('userEmail', email);
                        // No necesitamos asignar a isLoggedIn aquí, ya que checkLoginStatus() y handleLogout()
                        // en auth.js son los que realmente gestionan el estado y updateLoginIcon()
                        // ya lo maneja basándose en localStorage.
                        updateLoginIcon(); // Actualiza el icono de login/logout
                        authMessage.textContent = data.message;
                        authMessage.style.color = 'green';
                        displayLogMessage('Login successful!', 'success');
                        setTimeout(async () => {
                            toggleAuthModal(false); // Cierra el modal
                            // Recarga los datos del bot y balances después de un login exitoso
                            await loadBotConfigAndState();
                            await getBalances();
                            await fetchOrders(document.querySelector('.autobot-tabs button.active-tab')?.id || 'tab-opened');
                        }, 1500);
                    } else {
                        authMessage.textContent = data.error || 'Invalid token or email.';
                        authMessage.style.color = 'red';
                        displayLogMessage(`Token verification failed: ${data.error || 'Invalid token or email'}.`, 'error');
                    }
                }
            } catch (error) {
                console.error('Authentication error:', error);
                authMessage.textContent = 'Network error or server unavailable. Please try again later.';
                authMessage.style.color = 'red';
                displayLogMessage(`Authentication network error: ${error.message}.`, 'error');
            }
        });
    }

    // --- Lógica para el modal de API ---
    if (apiKeyIcon) {
        apiKeyIcon.addEventListener('click', () => {
            if (!isLoggedIn) {
                alert("Please login first to configure API keys.");
                displayLogMessage("Login required to configure API keys.", "warning");
                toggleAuthModal(true); // Abre el modal de login si no está logueado
                return;
            }
            toggleApiModal(true); // Abre el modal de API del módulo modals.js
        });
    }

    if (apiForm) {
        apiForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const apiKey = apiKeyInput.value.trim();
            const secretKey = secretKeyInput.value.trim();
            const apiMemo = apiMemoInput.value.trim();

            if (!apiKey || !secretKey) {
                apiStatusMessage.textContent = 'API Key and Secret Key are required.';
                apiStatusMessage.style.color = 'red';
                displayLogMessage('API Key and Secret Key are required.', 'warning');
                return;
            }

            apiStatusMessage.textContent = 'Validating API keys...';
            apiStatusMessage.style.color = 'yellow';
            if (connectionIndicator) {
                connectionIndicator.classList.remove('bg-green-500', 'bg-red-500', 'bg-gray-500');
                connectionIndicator.classList.add('bg-yellow-500');
            }
            if (connectionText) {
                connectionText.textContent = 'Connecting...';
            }
            displayLogMessage('Validating BitMart API keys...', 'info');

            try {
                // Usa fetchFromBackend del módulo auth.js para enviar las claves al backend.
                const response = await fetchFromBackend('/api/user/save-api-keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey, secretKey, apiMemo })
                });

                if (response && response.connected) {
                    apiStatusMessage.textContent = response.message || 'API keys validated and saved!';
                    apiStatusMessage.style.color = 'green';
                    if (connectionIndicator) {
                        connectionIndicator.classList.remove('bg-yellow-500', 'bg-red-500');
                        connectionIndicator.classList.add('bg-green-500');
                    }
                    if (connectionText) {
                        connectionText.textContent = 'Connected';
                    }
                    secretKeyInput.value = ''; // Limpia el campo de la clave secreta por seguridad
                    await getBalances(); // Recarga balances después de conectar la API
                    await fetchOrders(document.querySelector('.autobot-tabs button.active-tab')?.id || 'tab-opened'); // Recarga órdenes
                    displayLogMessage('BitMart API keys validated and saved. Connected!', 'success');
                } else {
                    const errorMessage = response?.message || 'Failed to validate or save API keys.';
                    apiStatusMessage.textContent = errorMessage;
                    apiStatusMessage.style.color = 'red';
                    if (connectionIndicator) {
                        connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
                        connectionIndicator.classList.add('bg-red-500');
                    }
                    if (connectionText) {
                        connectionText.textContent = 'Disconnected';
                    }
                    displayLogMessage(`BitMart API connection failed: ${errorMessage}`, 'error');
                }
            } catch (error) {
                console.error('Error submitting API keys:', error);
                apiStatusMessage.textContent = `Error: ${error.message}`;
                apiStatusMessage.style.color = 'red';
                if (connectionIndicator) {
                    connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
                    connectionIndicator.classList.add('bg-red-500');
                }
                if (connectionText) {
                    connectionText.textContent = 'Disconnected';
                }
                displayLogMessage(`Error submitting API keys: ${error.message}`, 'error');
            }
        });
    }

    if (closeApiModalButton) {
        closeApiModalButton.addEventListener('click', () => {
            toggleApiModal(false); // Cierra el modal de API
            displayLogMessage('API configuration modal closed.', 'info');
        });
    }
});