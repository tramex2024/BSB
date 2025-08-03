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

// Nueva función para inicializar el gráfico de TradingView
function initializeTradingViewChart() {
    // Si el gráfico ya se ha inicializado, no hagas nada
    if (window.tvWidget) {
        return;
    }

    // Busca el contenedor del gráfico
    const chartContainer = document.getElementById('tvchart');
    if (chartContainer) {
        new TradingView.widget({
            autosize: true,
            symbol: "BINANCE:BTCUSDT",
            interval: "1",
            timezone: "Etc/UTC",
            theme: "dark",
            style: "1",
            locale: "en",
            toolbar_bg: "#f1f3f6",
            enable_publishing: false,
            allow_symbol_change: true,
            container_id: "tvchart"
        });
        // Marca el widget como inicializado para evitar duplicados
        window.tvWidget = true;
    }
}

// Nueva función para obtener y mostrar el precio en tiempo real
async function fetchAndDisplayBitMartPrice() {
    try {
        const response = await fetch(`https://api-cloud.bitmart.com/spot/v1/ticker?symbol=${TRADE_SYMBOL}`);
        const data = await response.json();
        
        if (data && data.code === 1000 && data.data && data.data[0] && data.data[0].last_price) {
            cargarPrecioEnVivo(data.data[0].last_price);
        } else {
            displayLogMessage('Failed to fetch real-time price from BitMart API.', 'error');
            cargarPrecioEnVivo(null); // Pasa null para que se muestre N/A
        }
    } catch (error) {
        console.error('Error fetching real-time price:', error);
        displayLogMessage('Network error fetching real-time price.', 'error');
        cargarPrecioEnVivo(null); // Pasa null para que se muestre N/A
    }
}


function initializeAutobotView() {
    displayLogMessage('Initializing Autobot view...', 'info');

    // Inicializa el gráfico de TradingView cuando se carga la vista de Autobot
    initializeTradingViewChart();

    // Inicia la carga del precio en tiempo real y el intervalo
    if (priceIntervalId) clearInterval(priceIntervalId);
    fetchAndDisplayBitMartPrice(); // Carga el precio al instante
    priceIntervalId = setInterval(fetchAndDisplayBitMartPrice, 2000); // Actualiza cada 2 segundos

    connectionIndicator = document.getElementById('status-dot');
    connectionText = document.getElementById('status-text');
    purchaseInput = document.getElementById("purchase-usdt");
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

    if (connectionIndicator) {
        checkBitMartConnectionAndData();
        if (bitmartIntervalId) clearInterval(bitmartIntervalId);
        bitmartIntervalId = setInterval(checkBitMartConnectionAndData, 10000);
    }
    
    // Si los elementos existen, se añaden los eventos
    const tabOpened = document.getElementById('tab-opened');
    if (tabOpened) {
        setActiveTab('tab-opened');
    }

    if (startBtn) startBtn.addEventListener('click', toggleBotState);
    if (resetBtn) resetBtn.addEventListener('click', resetBot);

    const orderTabs = ['tab-opened', 'tab-filled', 'tab-cancelled', 'tab-all'];
    orderTabs.forEach(id => {
        const tab = document.getElementById(id);
        if (tab) {
            tab.addEventListener('click', () => {
                setActiveTab(id);
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
    // Limpiar el contenido de main-content para que no se superponga
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.innerHTML = '';

    // Cuando se borra la vista, también se debe limpiar el widget de TradingView
    window.tvWidget = null;
}

export function setupNavTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const mainContent = document.getElementById('main-content');
    
    async function loadContent(tabName) {
        try {
            // Limpiamos la vista anterior antes de cargar la nueva
            clearAutobotView();

            const response = await fetch(`/html/${tabName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load ${tabName}.html (Status: ${response.status})`);
            }
            const htmlContent = await response.text();
            mainContent.innerHTML = htmlContent;
            displayLogMessage(`Switched to ${tabName} tab.`, 'info');

            const newUrl = window.location.origin + window.location.pathname + `?#${tabName}`;
            window.history.pushState({ path: newUrl }, '', newUrl);

            // Una vez que el contenido se ha cargado, inicializamos los scripts.
            // Es crucial que esto se haga DESPUÉS de que el HTML esté en el DOM.
            if (tabName === 'autobot') {
                initializeAutobotView();
            }
        } catch (error) {
            console.error('Error loading content:', error);
            mainContent.innerHTML = `<p class="text-red-500 text-center">Error loading page content. Please try again.</p>`;
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

    const initialTabName = window.location.hash.slice(2) || 'autobot'; // Valor por defecto
    const initialActiveTab = document.querySelector(`.nav-tab[data-tab="${initialTabName}"]`);
    if (initialActiveTab) {
        initialActiveTab.classList.add('active');
        loadContent(initialTabName);
    } else {
        const defaultTab = 'autobot';
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

            getBalances(data.balance);
            
            const currentTab = document.querySelector('.autobot-tabs button.active-tab')?.id;
            if (currentTab === 'tab-opened' && data.openOrders) {
                displayOrders(data.openOrders, 'opened');
            }

            // La lógica del precio en vivo se ha movido a otra función
            
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