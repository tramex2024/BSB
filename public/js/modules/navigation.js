// public/js/modules/navigation.js

import { displayLogMessage } from './auth.js';
import { getBalances } from './balance.js';
import { fetchOrders, setActiveTab, displayOrders } from './orders.js';
import { cargarPrecioEnVivo } from './network.js';
import { actualizarCalculos } from './calculations.js';
import { toggleBotState, resetBot } from './bot.js';
import { fetchFromBackend } from './api.js';

import { BACKEND_URL, TRADE_SYMBOL } from '../main.js';

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

function initializeAutobotView() {
    displayLogMessage('Initializing Autobot view...', 'info');

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
        // Aquí no llamamos a fetchOrders directamente, ya que checkBitMartConnectionAndData lo hará.
    }

    if (bitmartIntervalId) clearInterval(bitmartIntervalId);
    if (priceIntervalId) clearInterval(priceIntervalId);

    bitmartIntervalId = setInterval(checkBitMartConnectionAndData, 10000);
    // Ya no es necesario un intervalo separado para el precio, lo obtenemos con /bitmart-data
    // priceIntervalId = setInterval(cargarPrecioEnVivo, 2000);

    if (startBtn) startBtn.addEventListener('click', toggleBotState);
    if (resetBtn) resetBtn.addEventListener('click', resetBot);

    const orderTabs = ['tab-opened', 'tab-filled', 'tab-cancelled', 'tab-all'];
    orderTabs.forEach(id => {
        const tab = document.getElementById(id);
        if (tab) {
            tab.addEventListener('click', () => {
                setActiveTab(id);
                // Aquí podrías llamar a una función para refrescar solo las órdenes
                // pero por ahora, mantendremos la lógica centralizada en checkBitMartConnectionAndData
            });
        }
    });

    if (purchaseInput) purchaseInput.addEventListener('input', actualizarCalculos);
    if (incrementInput) incrementInput.addEventListener('input', actualizarCalculos);
    if (decrementInput) decrementInput.addEventListener('input', actualizarCalculos);
    if (triggerInput) triggerInput.addEventListener('input', actualizarCalculos);
}

function clearAutobotView() {
    displayLogMessage('Clearing Autobot view...', 'info');
    if (bitmartIntervalId) clearInterval(bitmartIntervalId);
    if (priceIntervalId) clearInterval(priceIntervalId);
}

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

            const newUrl = window.location.origin + window.location.pathname + `?#${tabName}`;
            window.history.pushState({ path: newUrl }, '', newUrl);

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
    } else {
        const defaultTab = 'dashboard';
        const defaultTabElement = document.querySelector(`.nav-tab[data-tab="${defaultTab}"]`);
        if (defaultTabElement) {
            defaultTabElement.classList.add('active');
            loadContent(defaultTab);
        }
    }
}

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
        // Hacemos una única llamada al endpoint /bitmart-data de tu servidor
        const data = await fetchFromBackend('/bitmart-data');

        if (data.connected) {
            displayLogMessage('Connected to BitMart. Data fetched successfully.', 'success');
            if (connectionIndicator) {
                connectionIndicator.classList.remove('bg-yellow-500', 'bg-red-500');
                connectionIndicator.classList.add('bg-green-500');
            }
            if (connectionText) {
                connectionText.textContent = 'Connected';
            }

            // Usamos los datos consolidados para actualizar las diferentes partes del UI
            getBalances(data.balance);
            
            const currentTab = document.querySelector('.autobot-tabs button.active-tab')?.id;
            if (currentTab === 'tab-opened' && data.openOrders) {
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
        console.error('Failed to fetch BitMart data:', error);
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