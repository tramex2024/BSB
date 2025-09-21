// public/js/modules/autobot.js

import { getBalances } from './balance.js';
import { initializeChart } from './chart.js';
import { checkBitMartConnectionAndData } from './network.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './orders.js';
// Esta línea ya importa las variables, no es necesario declararlas de nuevo
import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, currentChart, intervals } from '../main.js';

const SOCKET_SERVER_URL = 'https://bsb-ppex.onrender.com';
const BACKEND_URL = 'https://bsb-ppex.onrender.com';

// He eliminado las líneas que declaraban las variables de nuevo aquí.
// const TRADE_SYMBOL_TV = 'BITMART:BTCUSDT';
// const TRADE_SYMBOL_BITMART = 'BTC_USDT';

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

// --- FUNCIONES PARA GESTIONAR EL ESTADO Y LOS CÁLCULOS EN LA UI ---
function updateBotUI(state) {
    const statusColors = {
        RUNNING: 'text-green-400',
        STOPPED: 'text-red-400',
        BUYING: 'text-blue-400',
        SELLING: 'text-yellow-400',
        NO_COVERAGE: 'text-purple-400'
    };

    const lstateElement = document.getElementById('aubot-lstate');
    const sstateElement = document.getElementById('aubot-sstate');
    const startStopButton = document.getElementById('austart-btn');
    const autobotSettings = document.getElementById('autobot-settings');
    
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

    for (const [elementId, dataKey] of Object.entries(elementsToUpdate)) {
        const element = document.getElementById(elementId);
        if (element) {
            // Se asume que estos valores ya vienen redondeados del backend
            element.textContent = state[dataKey] !== undefined ? state[dataKey] : 'N/A';
        }
    }
    
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
    // Helper function to get and validate a float value
    const getFloatValue = (id) => {
        const value = parseFloat(document.getElementById(id).value);
        return isNaN(value) ? 0 : value;
    };

    const config = {
        symbol: TRADE_SYMBOL_BITMART,
        long: {
            amountUsdt: getFloatValue('auamount-usdt'),
            purchaseUsdt: getFloatValue('aupurchase-usdt'),
            price_var: getFloatValue('audecrement'),
            size_var: getFloatValue('auincrement'),
            trigger: getFloatValue('autrigger'),
        },
        short: {
            amountBtc: getFloatValue('auamount-btc'),
            sellBtc: getFloatValue('aupurchase-btc'),
            price_var: getFloatValue('audecrement'),
            size_var: getFloatValue('auincrement'),
            trigger: getFloatValue('autrigger'),
        },
        options: {
            stopAtCycleEnd: document.getElementById('au-stop-at-cycle-end').checked,
        },
    };
    return config;
}

// Función para mostrar mensajes de estado
function displayMessage(message, type) {
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        messageContainer.textContent = message;
        messageContainer.className = `message ${type}`;
        setTimeout(() => {
            messageContainer.textContent = '';
            messageContainer.className = 'message';
        }, 5000); // El mensaje desaparece después de 5 segundos
    }
}

/**
 * Envía la configuración del bot al backend en tiempo real.
 */
async function sendConfigToBackend() {
    try {
        const config = getBotConfiguration();        
        
        // --- AQUÍ ESTÁ EL CAMBIO ---
        console.log('Enviando configuración al backend:', config);
        // -------------------------

        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No se encontró el token de autenticación.');            
            displayMessage('Authentication token not found. Please log in again.', 'error');
            return;
        }
        
	const response = await fetch(`${BACKEND_URL}/api/autobot/update-config`, { 
        //const response = await fetch('/api/autobot/update-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ config }),
        });

        const result = await response.json();
        
        if (response.ok) {
            console.log('Configuración enviada con éxito. Respuesta del servidor:', result);
            displayMessage('Configuración y estado inicial actualizados con éxito.', 'success');
        } else {
            console.error('Error al actualizar la configuración en el backend:', result.message);
            displayMessage(`Failed to update config on backend: ${result.message}`, 'error');
        }

    } catch (error) {
        console.error('Failed to send config:', error);
        displayMessage('Failed to connect to backend.', 'error');
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

// --- FUNCIÓN DE INICIALIZACIÓN ---
export function initializeAutobotView() {
    console.log("Inicializando vista del Autobot...");
    
    let currentTab = 'opened';
    
    const austartBtn = document.getElementById('austart-btn');
    const auresetBtn = document.getElementById('aureset-btn');
    const auorderTabs = document.querySelectorAll('#autobot-section [id^="tab-"]');
    
    checkBitMartConnectionAndData();
    window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);

    setupConfigListeners();

    // Lógica para el botón START/STOP
    if (austartBtn) {
        austartBtn.addEventListener('click', async () => {
            const isRunning = austartBtn.textContent === 'STOP';
            let endpoint = isRunning ? '/api/autobot/stop' : '/api/autobot/start';
            let body = {};
            if (!isRunning) {
                // Obtenemos la última configuración antes de iniciar el bot
                body = getBotConfiguration();
                console.log('[FRONTEND LOG]: Enviando configuración al iniciar:', body);
            }
            try {
                const response = await fetch(`${BACKEND_URL}${endpoint}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    //body: JSON.stringify(body),
		    body: JSON.stringify({ config: body }),
                });
                const data = await response.json();
                if (!data.success) {
                    console.error(`Error al ${isRunning ? 'detener' : 'iniciar'} el bot:`, data.message);
                }
            } catch (error) {
                console.error(`Error de red al ${isRunning ? 'detener' : 'iniciar'} el bot:`, error);
            }
        });
    }

    if (auresetBtn) {
        auresetBtn.addEventListener('click', () => {
            // Lógica para el botón reset
        });
    }
    
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
    
    const socket = io(SOCKET_SERVER_URL);
    
    socket.on('bot-state-update', (state) => {
        updateBotUI(state);
    });

    getBalances();
    intervals.autobot = setInterval(getBalances, 10000);
    intervals.orders = setInterval(() => {
        const auOrderList = document.getElementById('au-order-list');
        if (auOrderList) {
            fetchOrders(currentTab, auOrderList);
        }
    }, 15000);
}