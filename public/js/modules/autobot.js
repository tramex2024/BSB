// public/js/modules/autobot.js

import { getBalances } from './balance.js';
import { initializeChart } from './chart.js';
import { checkBitMartConnectionAndData } from './network.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './orders.js';
import { loadBotConfigAndState, toggleBotState, resetBot } from './bot.js';
import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, currentChart, intervals } from '../main.js';

const SOCKET_SERVER_URL = 'https://bsb-ppex.onrender.com';
const BACKEND_URL = 'https://bsb-ppex.onrender.com'; // Definimos el BACKEND_URL aquí para consistencia

// IDs de los campos de configuración que necesitan ser gestionados
const configInputIds = [
    'auamount-usdt',
    'auamount-btc',
    'aupurchase-usdt',
    'aupurchase-btc',
    'auincrement',
    'audecrement',
    'autrigger',
    'au-stop-at-cycle-end',
];

// --- NUEVA FUNCIÓN PARA GESTIONAR EL ESTADO Y LOS CÁLCULOS EN LA UI ---
function updateBotUI(state) {
    // Definimos los colores para cada estado
    const statusColors = {
        RUNNING: 'text-green-400',
        STOPPED: 'text-red-400',
        BUYING: 'text-blue-400',
        SELLING: 'text-yellow-400',
        NO_COVERAGE: 'text-purple-400'
    };

    // Obtenemos los elementos de la interfaz de usuario por su ID
    const lstateElement = document.getElementById('aubot-lstate');
    const sstateElement = document.getElementById('aubot-sstate');
    const startStopButton = document.getElementById('austart-btn');
    const autobotSettings = document.getElementById('autobot-settings');
    
    // Lista de todos los elementos a actualizar
    const elementsToUpdate = {
        auprofit: 'profit',
        aulbalance: 'lbalance',
        ausbalance: 'sbalance',
        aultprice: 'ltprice',
        austprice: 'stprice',
        aulcycle: 'lcycle',
        auscycle: 'scycle',
        aulcoverage: 'lcoverage',
        auscoverage: 'scoverage',
        aulnorder: 'lnorder',
        ausnorder: 'snorder'
    };

    // Actualiza el LState y SState
    if (lstateElement) {
        lstateElement.textContent = state.lstate;
        lstateElement.className = '';
        lstateElement.classList.add(statusColors[state.lstate] || 'text-red-400');
    }

    if (sstateElement) {
        sstateElement.textContent = state.sstate;
        sstateElement.className = '';
        sstateElement.classList.add(statusColors[state.sstate] || 'text-red-400');
    }

    // Actualiza los demás elementos dinámicos
    for (const [elementId, dataKey] of Object.entries(elementsToUpdate)) {
        const element = document.getElementById(elementId);
        if (element) {
            // Usamos un valor por defecto si el dato no existe
            element.textContent = state[dataKey] !== undefined ? state[dataKey] : 'N/A';
        }
    }
    
    // Lógica para el botón START/STOP y la habilitación de la configuración
    const isActive = state.lstate === 'RUNNING' || state.sstate === 'RUNNING';
    
    if (autobotSettings) {
        const inputs = autobotSettings.querySelectorAll('input, select');
        inputs.forEach(input => input.disabled = isActive);
    }

    if (startStopButton) {
        startStopButton.textContent = isActive ? 'STOP' : 'START';
        startStopButton.classList.remove('start-btn', 'stop-btn');
        startStopButton.classList.add(isActive ? 'stop-btn' : 'start-btn');
    }
}

/**
 * Recopila todos los datos de los campos de configuración.
 * @returns {object} Un objeto con la configuración del bot.
 */
function getBotConfiguration() {
    const config = {
        long: {
            purchaseUsdt: parseFloat(document.getElementById('aupurchase-usdt').value),
            price_var: parseFloat(document.getElementById('audecrement').value),
            size_var: parseFloat(document.getElementById('auincrement').value),
            trigger: parseFloat(document.getElementById('autrigger').value),
        },
        short: {
            sellBtc: parseFloat(document.getElementById('aupurchase-btc').value),
            price_var: parseFloat(document.getElementById('audecrement').value),
            size_var: parseFloat(document.getElementById('auincrement').value),
            trigger: parseFloat(document.getElementById('autrigger').value),
        },
        options: {
            stopAtCycleEnd: document.getElementById('au-stop-at-cycle-end').checked,
        },
    };
    return config;
}

/**
 * Envía la configuración del bot al backend en tiempo real.
 */
async function sendConfigToBackend() {
    const config = getBotConfiguration();
    
    // AGREGA ESTA LÍNEA para ver qué valor se captura del frontend
    console.log('[FRONTEND LOG]: Valor de purchaseUsdt antes de enviar:', config.long.purchaseUsdt);

    try {
        const response = await fetch(`${BACKEND_URL}/api/autobot/update-config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ config }),
        });
        if (!response.ok) {
            console.error('Failed to update config on backend');
        }
    } catch (error) {
        console.error('Error sending config to backend:', error);
    }
}

/**
 * Configura los event listeners para los campos de configuración.
 */
function setupConfigListeners() {
    configInputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                sendConfigToBackend();
            });
        }
    });
}

export function initializeAutobotView() {
    console.log("Inicializando vista del Autobot...");
    
    let currentTab = 'opened';
    
    // Obtiene los elementos del DOM
    const austartBtn = document.getElementById('austart-btn');
    const auresetBtn = document.getElementById('aureset-btn');
    const auorderTabs = document.querySelectorAll('#autobot-section [id^="tab-"]');
    
    // Llama a las funciones existentes para el gráfico y la conexión
    checkBitMartConnectionAndData();
    window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);

    // NUEVO: Configura los listeners para los inputs de configuración
    setupConfigListeners();

    // Configura el listener del botón START/STOP
    if (austartBtn) {
        austartBtn.addEventListener('click', () => {
            toggleBotState();
        });
    }

    if (auresetBtn) auresetBtn.addEventListener('click', () => resetBot('long'));
    
    // Lógica para las pestañas de órdenes (ya existente)
    auorderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            const auOrderList = document.getElementById('au-order-list');
            fetchOrders(currentTab, auOrderList);
        });
    });

    setOrdersActiveTab('tab-opened');
    const auOrderList = document.getElementById('au-order-list');
    fetchOrders(currentTab, auOrderList);
    
    // Lógica de Socket.IO para recibir el estado del bot
    const socket = io(SOCKET_SERVER_URL);
    
    socket.on('bot-state-update', (state) => {
        updateBotUI(state);
    });

    // Llama a las funciones existentes para los balances y órdenes
    getBalances();
    intervals.autobot = setInterval(getBalances, 10000);
    intervals.orders = setInterval(() => {
        const auOrderList = document.getElementById('au-order-list');
        if (auOrderList) {
            fetchOrders(currentTab, auOrderList);
        }
    }, 15000);

    // NUEVO: Envía la configuración inicial al cargar la página
    sendConfigToBackend();
}