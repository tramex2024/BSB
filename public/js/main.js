// public/js/main.js (SIMPLIFICADO - SIN LOGICA DE USUARIOS/AUTENTICACION)

// --- Importaciones de Módulos ---
// Importa solo las funciones y variables necesarias de tus módulos.
// Ajusta estas importaciones si los módulos de 'auth.js' o 'modals.js' ya no existen o han cambiado.
import { displayLogMessage } from './modules/auth.js'; // Solo para displayLogMessage
// Eliminamos imports de modals de auth/api ya que no los usaremos
// Eliminamos imports de funciones de login/logout ya que no hay usuarios
import { getBalances } from './modules/balance.js';
import { fetchOrders, setActiveTab, displayOrders, createOrderElement, updateOrderElement } from './modules/orders.js';
import { cargarPrecioEnVivo, checkConnection } from './modules/network.js'; // checkConnection ahora obtendrá data directa
import { actualizarCalculos } from './modules/calculations.js';
import { loadBotConfigAndState, toggleBotState, resetBot } from './modules/bot.js'; // loadBotConfigAndState necesitará ajustes
import { setupNavTabs } from './modules/navigation.js';

// --- Constantes Globales ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com'; // ¡Tu URL de backend en Render!
export const TRADE_SYMBOL = 'BTC_USDT';

// --- Elementos del DOM (Exportados, solo los que aún se usarán) ---
// Eliminamos elementos del DOM relacionados con autenticación y API keys si ya no existen en tu HTML
export let authModal = null; // Mantener solo si el HTML aún lo tiene por algún motivo
export let authForm = null;
export let emailInput = null;
export let tokenInput = null;
export let authButton = null;
export let authMessage = null;
export let loginLogoutIcon = null; // Esto probablemente ya no exista en tu HTML

export let apiKeyIcon = null; // Esto probablemente ya no exista en tu HTML
export let apiModal = null;
export let closeApiModalButton = null;
export let apiKeyInput = null;
export let secretKeyInput = null;
export let apiMemoInput = null;
export let apiStatusMessage = null;
export let connectionIndicator = null;
export let connectionText = null;
export let apiForm = null;

export let logMessageElement = null;

// Elementos del Bot (Inputs y Displays) - Estos se mantienen
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
document.addEventListener('DOMContentLoaded', () => {
    // --- Asignación de Elementos del DOM ---
    // Eliminar asignaciones de elementos que ya no existan en tu HTML si has quitado la lógica de auth/api keys
    authModal = document.getElementById('auth-modal'); // Si aún existe en HTML
    authForm = document.getElementById('auth-form');
    emailInput = document.getElementById('email');
    tokenInput = document.getElementById('token');
    authButton = document.getElementById('auth-button');
    authMessage = document.getElementById('auth-message');
    loginLogoutIcon = document.getElementById('login-logout-icon');

    apiKeyIcon = document.getElementById('api-key-icon'); // Si aún existe en HTML
    apiModal = document.getElementById('api-modal');
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
    setupNavTabs();

    // NOTA: checkLoginStatus y loadBotConfigAndState ya no tienen sentido
    // sin un sistema de usuarios. Necesitarás ajustar loadBotConfigAndState
    // para cargar la configuración del bot de otra manera (ej. de localStorage directamente
    // o de una ruta pública del servidor si no es sensible).
    // Por ahora, se mantienen las llamadas, pero no harán nada relacionado con usuarios.
    // checkLoginStatus(); // Ya no relevante
    // loadBotConfigAndState(); // Necesita ser revisado si no hay usuarios

    // Llama a una función unificada para obtener todos los datos de BitMart
    // Esta función debería llamar al nuevo endpoint /bitmart-data del backend
    if (connectionIndicator) checkBitMartConnectionAndData();

    // 5. Establece la pestaña de órdenes activa por defecto (normalmente 'opened').
    if (document.getElementById('tab-opened')) {
        setActiveTab('tab-opened');
    }

    // --- Configuración de Intervalos de Actualización ---
    // Estas funciones ahora necesitarán usar el nuevo endpoint /bitmart-data o endpoints específicos públicos.
    // Por ahora, las mantengo llamando a funciones que obtendrán la data de forma unificada.
    setInterval(checkBitMartConnectionAndData, 10000); // Actualiza todo cada 10 segundos (balances, conexión, etc.)
    setInterval(cargarPrecioEnVivo, 2000); // Esto sigue obteniendo el precio

    // currentTab es manejado por el módulo orders, por eso se pasa como argumento
    // fetchOrders también necesitará adaptarse al nuevo endpoint /bitmart-data o uno público específico para órdenes.
    setInterval(() => fetchOrders(document.querySelector('.autobot-tabs button.active-tab')?.id || 'tab-opened'), 15000);

    // --- Event Listeners ---
    if (startBtn) startBtn.addEventListener('click', toggleBotState);
    if (resetBtn) resetBtn.addEventListener('click', resetBot);

    const tabOpened = document.getElementById('tab-opened');
    const tabFilled = document.getElementById('tab-filled');
    const tabCancelled = document.getElementById('tab-cancelled');
    const tabAll = document.getElementById('tab-all');

    if (tabOpened) tabOpened.addEventListener('click', () => setActiveTab('tab-opened'));
    if (tabFilled) tabFilled.addEventListener('click', () => setActiveTab('tab-filled'));
    if (tabCancelled) tabCancelled.addEventListener('click', () => setActiveTab('tab-cancelled'));
    if (tabAll) tabAll.addEventListener('click', () => setActiveTab('tab-all'));

    if (purchaseInput) purchaseInput.addEventListener('input', actualizarCalculos);
    if (incrementInput) incrementInput.addEventListener('input', actualizarCalculos);
    if (decrementInput) decrementInput.addEventListener('input', actualizarCalculos);
    if (triggerInput) triggerInput.addEventListener('input', actualizarCalculos);

    // --- Lógica para modals de Autenticación y API eliminada ---
    // Ya no hay `loginLogoutIcon` ni `apiKeyIcon` que abran modales.
    // Asumo que estos elementos y sus respectivos modals serán eliminados del HTML.

});


// --- Nueva Función para Centralizar la Obtención de Datos del Backend ---
// Esta función reemplazará a checkConnection, getBalances, etc. al inicio y en intervalos.
async function checkBitMartConnectionAndData() {
    displayLogMessage('Checking BitMart connection and fetching data...', 'info');
    if (connectionIndicator) {
        connectionIndicator.classList.remove('bg-green-500', 'bg-red-500');
        connectionIndicator.classList.add('bg-yellow-500');
    }
    if (connectionText) {
        connectionText.textContent = 'Connecting...';
    }

    try {
        const response = await fetch(`${BACKEND_URL}/bitmart-data`);
        const data = await response.json();

        if (data.connected) {
            displayLogMessage('Connected to BitMart. Data fetched successfully.', 'success');
            if (connectionIndicator) {
                connectionIndicator.classList.remove('bg-yellow-500', 'bg-red-500');
                connectionIndicator.classList.add('bg-green-500');
            }
            if (connectionText) {
                connectionText.textContent = 'Connected';
            }

            // Actualizar Balances
            const balanceData = data.balance;
            if (document.getElementById('balance')) {
                // Asumo que getBalances tiene la lógica para actualizar el DOM con el balance.
                // Si getBalances hace su propia llamada al backend, necesitarás reescribirla
                // para aceptar 'balanceData' como argumento o hacer que esta función actualice directamente.
                // Por simplicidad, por ahora solo lo logueo:
                // console.log('Balances from backend:', balanceData);
                // Si `getBalances` espera datos, adapta su llamada o lógica interna
                getBalances(balanceData); // Pasa los datos directamente
            }

            // Actualizar Órdenes
            const openOrdersData = data.openOrders;
            if (document.getElementById('orders-list')) {
                // Asumo que fetchOrders tiene la lógica para actualizar el DOM con las órdenes.
                // De manera similar, si fetchOrders hace su propia llamada al backend,
                // necesitarás reescribirla para aceptar 'openOrdersData' como argumento.
                // displayOrders es la función que realmente renderiza.
                displayOrders(openOrdersData, 'opened'); // Asume que displayOrders puede manejar esto.
            }

            // Actualizar Ticker (precio en vivo)
            const tickerData = data.ticker;
            if (document.getElementById('price')) {
                // Asumo que cargarPrecioEnVivo() o una función similar actualiza el DOM
                // con el precio. Necesitarás adaptar esta lógica para usar 'tickerData'.
                // Por ejemplo, `cargarPrecioEnVivo(tickerData.last);`
                cargarPrecioEnVivo(tickerData.last); // Pasa el último precio
            }

            actualizarCalculos(); // Recalcula si dependen de los nuevos datos

        } else {
            displayLogMessage(`Failed to connect to BitMart: ${data.message || 'Unknown error'}`, 'error');
            if (connectionIndicator) {
                connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
                connectionIndicator.classList.add('bg-red-500');
            }
            if (connectionText) {
                connectionText.textContent = 'Disconnected';
            }
        }
    } catch (error) {
        console.error('Network error fetching BitMart data:', error);
        displayLogMessage(`Network error: ${error.message}. Could not reach backend.`, 'error');
        if (connectionIndicator) {
            connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
            connectionIndicator.classList.add('bg-red-500');
        }
        if (connectionText) {
            connectionText.textContent = 'Disconnected';
        }
    }
}