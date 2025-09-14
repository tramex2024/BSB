// Archivo: BSB/server/autobotLogic.js          //78, 84

import { getBalances } from './balance.js';
import { initializeChart } from './chart.js';
import { checkBitMartConnectionAndData } from './network.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './orders.js';
import { loadBotConfigAndState, toggleBotState, resetBot } from './bot.js';
import { actualizarCalculosAutobot } from './aucalculations.js';
import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, currentChart, intervals } from '../main.js';

// --- NUEVA FUNCIÓN PARA GESTIONAR EL ESTADO DEL BOT EN LA UI ---
function updateBotUI(lstate, sstate) {
    const lstateElement = document.getElementById('lstate-display');
    const sstateElement = document.getElementById('sstate-display');
    const startStopButton = document.getElementById('austart-btn');
    const autobotSettings = document.getElementById('autobot-settings');

    if (lstateElement) lstateElement.textContent = `Estado Long: ${lstate}`;
    if (sstateElement) sstateElement.textContent = `Estado Short: ${sstate}`;
    
    // Habilita o deshabilita los controles de configuración según el estado del bot
    const isActive = lstate !== 'STOPPED' || sstate !== 'STOPPED';
    if (autobotSettings) {
        const inputs = autobotSettings.querySelectorAll('input, select');
        inputs.forEach(input => input.disabled = isActive);
    }

    // Actualiza el texto y la clase del botón de inicio/parada
    if (startStopButton) {
        if (isActive) {
            startStopButton.textContent = 'STOP';
            startStopButton.classList.remove('start-btn');
            startStopButton.classList.add('stop-btn');
        } else {
            startStopButton.textContent = 'START';
            startStopButton.classList.remove('stop-btn');
            startStopButton.classList.add('start-btn');
        }
    }
}

export function initializeAutobotView() {
    console.log("Inicializando vista del Autobot...");
    
    // Declara la variable para el alcance del módulo
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

    if (auresetBtn) auresetBtn.addEventListener('click', () => resetBot());
    
    if (auamountUSDTInput) auamountUSDTInput.addEventListener('input', actualizarCalculosAutobot);
    if (aupurchaseUSDTInput) aupurchaseUSDTInput.addEventListener('input', actualizarCalculosAutobot);
    if (aupurchaseBTCInput) aupurchaseBTCInput.addEventListener('input', actualizarCalculosAutobot);
    if (auincrementInput) auincrementInput.addEventListener('input', actualizarCalculosAutobot);
    if (audecrementInput) audecrementInput.addEventListener('input', actualizarCalculosAutobot);
    if (autriggerInput) autriggerInput.addEventListener('input', actualizarCalculosAutobot);

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
    
    // --- LÓGICA DE WEBSOCKET ENCAPSULADA EN EL MÓDULO ---
    const socket = io(); // Conecta al socket global
    
    // Listener para recibir y actualizar el estado del bot
    socket.on('bot-state-update', (state) => {
        updateBotUI(state.lstate, state.sstate);
    });

    // Se mantienen los intervalos de polling para datos no relacionados con el estado del bot
    getBalances();
    intervals.autobot = setInterval(getBalances, 10000);
    intervals.orders = setInterval(() => {
        const auOrderList = document.getElementById('au-order-list');
        if (auOrderList) {
            fetchOrders(currentTab, auOrderList);
        }
    }, 15000);
}