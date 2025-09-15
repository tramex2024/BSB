// public/js/modules/autobot.js

import { getBalances } from './balance.js';
import { initializeChart } from './chart.js';
import { checkBitMartConnectionAndData } from './network.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './orders.js';
import { loadBotConfigAndState, toggleBotState, resetBot } from './bot.js';
import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, currentChart, intervals } from '../main.js';

const SOCKET_SERVER_URL = 'https://bsb-ppex.onrender.com';

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

export function initializeAutobotView() {
    console.log("Inicializando vista del Autobot...");
    
    let currentTab = 'opened';
    
    const auamountUSDTInput = document.getElementById('auamount-usdt');
    const aupurchaseUSDTInput = document.getElementById("aupurchase-usdt");
    const aupurchaseBTCInput = document.getElementById("aupurchase-btc");
    const auincrementInput = document.getElementById("auincrement");
    const audecrementInput = document.getElementById("audecrement");
    const autriggerInput = document.getElementById("autrigger");
    const austartBtn = document.getElementById('austart-btn');
    const auresetBtn = document.getElementById('aureset-btn');
    const auorderTabs = document.querySelectorAll('#autobot-section [id^="tab-"]');
    
    checkBitMartConnectionAndData();
    
    window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);

    if (austartBtn) {
        austartBtn.addEventListener('click', () => {
            toggleBotState();
        });
    }

    if (auresetBtn) auresetBtn.addEventListener('click', () => resetBot('long'));
    
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