// public/js/main.js

import { fetchFromBackend, displayLogMessage, isLoggedIn, checkLoginStatus, handleLogout } from './modules/auth.js';
import { toggleAuthModal, toggleApiModal, updateLoginIcon } from './modules/modals.js';
import { getBalances } from './modules/balance.js';
import { fetchOrders, setActiveTab, displayOrders, createOrderElement, updateOrderElement, currentDisplayedOrders } from './modules/orders.js'; // currentDisplayedOrders también se exporta e importa
import { cargarPrecioEnVivo, checkConnection } from './modules/network.js';
import { actualizarCalculos, calcularORQ, calcularCoverage } from './modules/calculations.js';
import { loadBotConfigAndState, toggleBotState, resetBot } from './modules/bot.js';
import { setupNavTabs } from './modules/navigation.js';

// --- Constantes Globales (se mantienen aquí porque son usadas en varios módulos) ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL = 'BTC_USDT';

// --- Elementos del DOM (Importantes para el inicio o compartidos entre módulos) ---
// Declara estas variables como 'let' si necesitas asignarlas después del DOMContentLoaded
// o pasarlas como argumentos a funciones que las necesiten.
// Para elementos que se acceden globalmente, puedes mantenerlos aquí o hacer que los módulos los obtengan.
// Por simplicidad en un proyecto pequeño-mediano, tenerlos aquí y pasarlos puede ser práctico.
export const authModal = document.getElementById('auth-modal');
export const authForm = document.getElementById('auth-form');
export const emailInput = document.getElementById('email');
export const tokenInput = document.getElementById('token');
export const authButton = document.getElementById('auth-button');
export const authMessage = document.getElementById('auth-message');
export const loginLogoutIcon = document.getElementById('login-logout-icon');
export const apiKeyIcon = document.getElementById('api-key-icon');

export const apiModal = document.getElementById('api-modal');
export const closeApiModalButton = apiModal ? apiModal.querySelector('.close-button') : null;
export const apiKeyInput = document.getElementById('api-key');
export const secretKeyInput = document.getElementById('secret-key');
export const apiMemoInput = document.getElementById('api-memo');
export const apiStatusMessage = document.getElementById('api-status-message');
export const connectionIndicator = document.getElementById('connection-indicator');
export const connectionText = document.getElementById('connection-text');
export const apiForm = document.getElementById('api-form');

export const logMessageElement = document.getElementById('log-message');

export const purchaseInput = document.getElementById("purchase");
export const incrementInput = document.getElementById("increment");
export const decrementInput = document.getElementById("decrement");
export const triggerInput = document.getElementById("trigger");
export const stopAtCycleEndCheckbox = document.getElementById('stop-at-cycle-end');
export const botStateDisplay = document.getElementById('bot-state');
export const cycleDisplay = document.getElementById('cycle');
export const profitDisplay = document.getElementById('profit');
export const cycleProfitDisplay = document.getElementById('cycleprofit');
export const startBtn = document.getElementById('start-btn');
export const resetBtn = document.getElementById('reset-btn');

// --- Estado de la Aplicación (Exportar si se modifican en otros módulos) ---
export let currentTab = 'opened'; // Exportar si setActiveTab lo modifica
// currentDisplayedOrders se maneja en el módulo de órdenes, y es un Map, por lo que su referencia se puede pasar.

// Exportar displayLogMessage si se usa en otros módulos
export { displayLogMessage }; // Ya está en auth.js, pero para que sea accesible fácilmente.

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
    if (document.getElementById('tab-opened')) {
        setActiveTab('tab-opened'); // Esto internamente llama a fetchOrders
    }

    // Configurar intervalos de actualización
    setInterval(getBalances, 10000);
    setInterval(cargarPrecioEnVivo, 2000);
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
    if (loginLogoutIcon) {
        loginLogoutIcon.addEventListener('click', () => {
            if (isLoggedIn) { // isLoggedIn ahora es un import
                handleLogout();
            } else {
                toggleAuthModal(true);
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
                        displayLogMessage(`Verification token sent to ${email}.`, 'success');
                    } else {
                        authMessage.textContent = data.error || 'Server error. Please try again later.';
                        authMessage.style.color = 'red';
                        displayLogMessage(`Token request failed: ${data.error || 'Unknown error'}.`, 'error');
                    }
                } else {
                    response = await fetch(`${BACKEND_URL}/api/auth/verify-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, token })
                    });
                    data = await response.json();

                    if (response.ok) {
                        localStorage.setItem('authToken', data.token);
                        localStorage.setItem('userEmail', email);
                        isLoggedIn = true; // Actualiza el estado importado
                        updateLoginIcon();
                        authMessage.textContent = data.message;
                        authMessage.style.color = 'green';
                        displayLogMessage('Login successful!', 'success');
                        setTimeout(async () => {
                            toggleAuthModal(false);
                            await loadBotConfigAndState();
                            await getBalances();
                            await fetchOrders(currentTab);
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
                toggleAuthModal(true);
                return;
            }
            toggleApiModal(true);
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
            connectionIndicator.classList.remove('bg-green-500', 'bg-red-500', 'bg-gray-500');
            connectionIndicator.classList.add('bg-yellow-500');
            connectionText.textContent = 'Connecting...';
            displayLogMessage('Validating BitMart API keys...', 'info');

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
                    secretKeyInput.value = '';
                    await getBalances();
                    await fetchOrders(currentTab);
                    displayLogMessage('BitMart API keys validated and saved. Connected!', 'success');
                } else {
                    const errorMessage = response.message || 'Failed to validate or save API keys.';
                    apiStatusMessage.textContent = errorMessage;
                    apiStatusMessage.style.color = 'red';
                    connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
                    connectionIndicator.classList.add('bg-red-500');
                    connectionText.textContent = 'Disconnected';
                    displayLogMessage(`BitMart API connection failed: ${errorMessage}`, 'error');
                }
            } catch (error) {
                console.error('Error submitting API keys:', error);
                apiStatusMessage.textContent = `Error: ${error.message}`;
                apiStatusMessage.style.color = 'red';
                connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
                connectionIndicator.classList.add('bg-red-500');
                connectionText.textContent = 'Disconnected';
                displayLogMessage(`Error submitting API keys: ${error.message}`, 'error');
            }
        });
    }

    if (closeApiModalButton) {
        closeApiModalButton.addEventListener('click', () => {
            toggleApiModal(false);
            displayLogMessage('API configuration modal closed.', 'info');
        });
    }
});