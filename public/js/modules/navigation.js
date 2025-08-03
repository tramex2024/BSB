// public/js/modules/navigation.js
import { displayLogMessage } from './auth.js';
import { getBalances } from './balance.js';
import { fetchOrders, setActiveTab, displayOrders } from './orders.js';
import { cargarPrecioEnVivo } from './network.js';
import { actualizarCalculos } from './calculations.js';
import { toggleBotState, resetBot } from './bot.js';

// Importa las variables globales que se necesitan
import { BACKEND_URL, TRADE_SYMBOL } from '../main.js';

// --- Variables y Elementos del DOM del Autobot ---
// Declaradas aquí porque solo se usan en esta lógica
let bitmartIntervalId = null;
let priceIntervalId = null;
let connectionIndicator = null;
let connectionText = null;
let purchaseInput = null;
let incrementInput = null;
let decrementInput = null;
let triggerInput = null;
let stopAtCycleEndCheckbox = null;
let botLongStateDisplay = null;
let botShortStateDisplay = null;
let cycleDisplay = null;
let profitDisplay = null;
let cycleProfitDisplay = null;
let startBtn = null;
let resetBtn = null;

/**
 * Función que inicializa la vista Autobot.
 */
function initializeAutobotView() {
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

    if (connectionIndicator) checkBitMartConnectionAndData();

    const tabOpened = document.getElementById('tab-opened');
    if (tabOpened) {
        setActiveTab('tab-opened');
        fetchOrders('tab-opened');
    }

    if (bitmartIntervalId) clearInterval(bitmartIntervalId);
    if (priceIntervalId) clearInterval(priceIntervalId);

    bitmartIntervalId = setInterval(checkBitMartConnectionAndData, 10000);
    priceIntervalId = setInterval(cargarPrecioEnVivo, 2000);

    if (startBtn) startBtn.addEventListener('click', toggleBotState);
    if (resetBtn) resetBtn.addEventListener('click', resetBot);

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
 * Limpia la vista Autobot.
 */
function clearAutobotView() {
    displayLogMessage('Clearing Autobot view...', 'info');
    if (bitmartIntervalId) clearInterval(bitmartIntervalId);
    if (priceIntervalId) clearInterval(priceIntervalId);
}

/**
 * Función principal para configurar la navegación.
 */
export function setupNavTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const mainContent = document.getElementById('main-content');
    
    async function loadContent(tabName) {
        try {
            if (tabName !== 'autobot') {
                clearAutobotView();
            }

            const response = await fetch(`/html/${tabName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load ${tabName}.html`);
            }
            const htmlContent = await response.text();
            mainContent.innerHTML = htmlContent;
            displayLogMessage(`Switched to ${tabName} tab.`, 'info');

            if (tabName === 'autobot') {
                initializeAutobotView();
            }
        } catch (error) {
            console.error('Error loading content:', error);
            mainContent.innerHTML = `<p class="text-red-500">Error loading page content. Please try again.</p>`;
            displayLogMessage(`Error loading content for ${tabName}.`, 'error');
        }
    }

    navTabs.forEach(tab => {
        tab.addEventListener('click', function(event) {
            event.preventDefault();
            const tabName = this.dataset.tab;

            navTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            loadContent(tabName);
        });
    });

    const initialActiveTab = document.querySelector('.nav-tab.active');
    if (initialActiveTab) {
        const initialTabName = initialActiveTab.dataset.tab;
        loadContent(initialTabName);
    }
}

/**
 * Función central para obtener datos de BitMart.
 */
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

            getBalances(data.balance);

            const currentTab = document.querySelector('.autobot-tabs button.active-tab')?.id;
            if (currentTab === 'tab-opened') {
                displayOrders(data.openOrders, 'opened');
            }

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