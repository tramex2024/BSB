// public/js/main.js (SIMPLIFICADO Y OPTIMIZADO - SIN LOGICA DE USUARIOS NI AUTH)

// --- Importaciones de Módulos ---
import { setupNavTabs } from './modules/navigation.js';
import { displayLogMessage } from './modules/auth.js';
import { getBalances } from './modules/balance.js';
import { fetchOrders, setActiveTab, displayOrders } from './modules/orders.js';
import { cargarPrecioEnVivo } from './modules/network.js';
import { actualizarCalculos } from './modules/calculations.js';
import { toggleBotState, resetBot } from './modules/bot.js';

// --- Constantes Globales ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL = 'BTC_USDT';

// --- Elementos del DOM ---
// Solo declaramos elementos que existen en el HTML y se encuentran en todas las vistas,
// o que se asignarán de forma dinámica.
export let logMessageElement = null;
export let connectionIndicator = null;
export let connectionText = null;

// Elementos del Bot (Inputs y Displays) - Estos solo existirán en la vista Autobot
// y serán asignados después de que se cargue la vista.
export let purchaseInput = null;
export let incrementInput = null;
export let decrementInput = null;
export let triggerInput = null;
export let stopAtCycleEndCheckbox = null;
export let botLongStateDisplay = null;
export let botShortStateDisplay = null;
export let cycleDisplay = null;
export let profitDisplay = null;
export let cycleProfitDisplay = null;
export let startBtn = null;
export let resetBtn = null;

let bitmartIntervalId = null;
let priceIntervalId = null;

/**
 * Función que se ejecuta al cargar el DOM.
 * Contiene la lógica inicial y los listeners de eventos.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Asignación de elementos del DOM que siempre están presentes.
    logMessageElement = document.getElementById('log-message');

    // Inicializa la navegación de pestañas.
    setupNavTabs();
});

/**
 * Función que inicializa la vista Autobot.
 * Se llama cuando se carga el contenido de 'autobot.html'.
 */
export function initializeAutobotView() {
    displayLogMessage('Initializing Autobot view...', 'info');

    // Asignación de elementos del DOM específicos de la vista Autobot
    connectionIndicator = document.getElementById('status-dot');
    connectionText = document.getElementById('status-text');
    purchaseInput = document.getElementById("purchase");
    incrementInput = document.getElementById("increment");
    decrementInput = document.getElementById("decrement");
    triggerInput = document.getElementById("trigger");
    stopAtCycleEndCheckbox = document.getElementById('stop-at-cycle-end');
    botLongStateDisplay = document.getElementById('bot-lstate');
    botShortStateDisplay = document.getElementById('bot-sstate');
    cycleDisplay = document.getElementById('cycle');
    profitDisplay = document.getElementById('profit');
    cycleProfitDisplay = document.getElementById('cycleprofit');
    startBtn = document.getElementById('start-btn');
    resetBtn = document.getElementById('reset-btn');

    // --- Inicializaciones ---
    if (connectionIndicator) checkBitMartConnectionAndData();

    // Establece la pestaña de órdenes activa por defecto ('Opened').
    const tabOpened = document.getElementById('tab-opened');
    if (tabOpened) {
        setActiveTab('tab-opened');
        fetchOrders('tab-opened');
    }

    // --- Configuración de Intervalos de Actualización ---
    // Limpiamos intervalos anteriores para evitar duplicados.
    if (bitmartIntervalId) clearInterval(bitmartIntervalId);
    if (priceIntervalId) clearInterval(priceIntervalId);

    // Creamos los nuevos intervalos.
    bitmartIntervalId = setInterval(checkBitMartConnectionAndData, 10000);
    priceIntervalId = setInterval(cargarPrecioEnVivo, 2000);

    // --- Event Listeners de la vista Autobot ---
    if (startBtn) startBtn.addEventListener('click', toggleBotState);
    if (resetBtn) resetBtn.addEventListener('click', resetBot);

    // Event listeners para los tabs de Order History (dentro de Autobot)
    const orderTabs = ['tab-opened', 'tab-filled', 'tab-cancelled', 'tab-all'];
    orderTabs.forEach(id => {
        const tab = document.getElementById(id);
        if (tab) {
            tab.addEventListener('click', () => {
                setActiveTab(id);
                fetchOrders(id);
            });
        }
    });

    if (purchaseInput) purchaseInput.addEventListener('input', actualizarCalculos);
    if (incrementInput) incrementInput.addEventListener('input', actualizarCalculos);
    if (decrementInput) decrementInput.addEventListener('input', actualizarCalculos);
    if (triggerInput) triggerInput.addEventListener('input', actualizarCalculos);
}

/**
 * Limpia la vista Autobot. Se llama cuando se navega a otra pestaña.
 */
export function clearAutobotView() {
    displayLogMessage('Clearing Autobot view...', 'info');
    if (bitmartIntervalId) clearInterval(bitmartIntervalId);
    if (priceIntervalId) clearInterval(priceIntervalId);
}

/**
 * Función central para obtener datos de BitMart.
 */
export async function checkBitMartConnectionAndData() {
    displayLogMessage('Checking BitMart connection and fetching data...', 'info');
    
    // Verificamos si los elementos existen antes de interactuar con ellos
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
            getBalances(data.balance);

            // Actualizar Órdenes abiertas
            const currentTab = document.querySelector('.autobot-tabs button.active-tab')?.id;
            if (currentTab === 'tab-opened') {
                displayOrders(data.openOrders, 'opened');
            }

            // Actualizar Ticker (precio en vivo)
            if (data.ticker && data.ticker.last) {
                cargarPrecioEnVivo(data.ticker.last);
            }
            
            actualizarCalculos();

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