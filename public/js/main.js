// public/js/main.js

import { toggleAuthModal, handleLogout, handleAuthFormSubmit, displayLogMessage } from './modules/auth.js';
import { getBalances } from './modules/balance.js';
import { initializeChart } from './modules/chart.js';
import { checkBitMartConnectionAndData } from './modules/network.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './modules/orders.js';
import { loadBotConfigAndState, toggleBotState, resetBot, checkBotStatus } from './modules/bot.js';
import { setupNavTabs } from './modules/navigation.js';
import { handleApiFormSubmit } from './modules/api.js';
import { toggleApiModal } from './modules/auth.js';
import { startPriceUpdates, stopPriceUpdates } from './modules/price.js';

// --- Importaciones de cálculos consolidadas ---
import { actualizarCalculosTestbot } from './modules/tecalculations.js';
import { actualizarCalculosAutobot } from './modules/aucalculations.js';
import { actualizarCalculosAibot } from './modules/aicalculations.js';

// --- Constantes globales ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL = 'BTC_USDT';

let currentChart = null; // Variable global para almacenar la instancia del gráfico

// Variables de estado locales
let currentTab = 'opened';
let intervals = {};

// --- Funciones de inicialización de la vista ---
function initializeDashboardView() {
    console.log("Inicializando vista del Dashboard...");
    getBalances();
    checkBitMartConnectionAndData();
}

function initializeTestbotView() {
    console.log("Inicializando vista del Testbot...");
    
    // Obtener referencias a todos los inputs y botones
    const teamountUSDTInput = document.getElementById('teamount-usdt');
    const teamountBTCInput = document.getElementById('teamount-btc');
    const tepurchaseUSDTInput = document.getElementById("tepurchase-usdt");
    const tepurchaseBTCInput = document.getElementById("tepurchase-btc");
    const teincrementInput = document.getElementById("teincrement");
    const tedecrementInput = document.getElementById("tedecrement");
    const tetriggerInput = document.getElementById("tetrigger");
    const testartBtn = document.getElementById('testart-btn');
    const teresetBtn = document.getElementById('tereset-btn');
    const teorderTabs = document.querySelectorAll('#testbot-section [id^="tab-"]');

    loadBotConfigAndState();
    actualizarCalculosTestbot();
    checkBitMartConnectionAndData();
    
    // Después
    currentChart = initializeChart('au-tvchart', TRADE_SYMBOL);
    startPriceUpdates(TRADE_SYMBOL, 'teprice', 2500);

    if (testartBtn) testartBtn.addEventListener('click', toggleBotState);
    if (teresetBtn) teresetBtn.addEventListener('click', resetBot);
    
    if (teamountUSDTInput) teamountUSDTInput.addEventListener('input', actualizarCalculosTestbot);
    if (teamountBTCInput) teamountBTCInput.addEventListener('input', actualizarCalculosTestbot);
    if (tepurchaseUSDTInput) tepurchaseUSDTInput.addEventListener('input', actualizarCalculosTestbot);
    if (tepurchaseBTCInput) tepurchaseBTCInput.addEventListener('input', actualizarCalculosTestbot);
    if (teincrementInput) teincrementInput.addEventListener('input', actualizarCalculosTestbot);
    if (tedecrementInput) tedecrementInput.addEventListener('input', actualizarCalculosTestbot);
    if (tetriggerInput) tetriggerInput.addEventListener('input', actualizarCalculosTestbot);

    teorderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            fetchOrders(currentTab);
        });
    });

    setOrdersActiveTab('tab-opened');
    fetchOrders('opened');
}

function startAutobotStrategy() {
    console.log("Iniciando estrategia del Autobot...");
    const startBtn = document.getElementById('austart-btn');
    const resetBtn = document.getElementById('aureset-btn');

    if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = 'Starting...';
    }

    fetch(`${BACKEND_URL}/api/autobot/start`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(error => { throw new Error(error.message); });
        }
        return response.json();
    })
    .then(data => {
        console.log(data.message);
        displayLogMessage(data.message, 'success');
        if (startBtn) {
            startBtn.textContent = 'STOP';
            startBtn.classList.remove('bg-green-600');
            startBtn.classList.add('bg-red-600');
            startBtn.disabled = false;
        }
        if (resetBtn) resetBtn.disabled = true;
    })
    .catch(error => {
        console.error('Error al iniciar Autobot:', error);
        displayLogMessage(`Error: ${error.message}`, 'error');
        if (startBtn) {
            startBtn.textContent = 'START';
            startBtn.classList.remove('bg-red-600');
            startBtn.classList.add('bg-green-600');
            startBtn.disabled = false;
        }
        if (resetBtn) resetBtn.disabled = false;
    });
}

function initializeAutobotView() {
    console.log("Inicializando vista del Autobot...");
    
    const auamountUSDTInput = document.getElementById('auamount-usdt');
    const auamountBTCInput = document.getElementById('auamount-btc');
    const aupurchaseUSDTInput = document.getElementById("aupurchase-usdt");
    const aupurchaseBTCInput = document.getElementById("aupurchase-btc");
    const auincrementInput = document.getElementById("auincrement");
    const audecrementInput = document.getElementById("audecrement");
    const autriggerInput = document.getElementById("autrigger");
    const austartBtn = document.getElementById('austart-btn');
    const auresetBtn = document.getElementById('aureset-btn');
    const auorderTabs = document.querySelectorAll('#autobot-section [id^="tab-"]');

    loadBotConfigAndState();
    actualizarCalculosAutobot();
    checkBitMartConnectionAndData();
    
    currentChart = initializeChart('au-tvchart', `BINANCE:${TRADE_SYMBOL}`); 
    startPriceUpdates(TRADE_SYMBOL, 'auprice', 2500);

    if (austartBtn) austartBtn.addEventListener('click', () => toggleBotState('autobot'));
    if (auresetBtn) auresetBtn.addEventListener('click', resetBot);
    
    if (auamountUSDTInput) auamountUSDTInput.addEventListener('input', actualizarCalculosAutobot);
    if (auamountBTCInput) auamountBTCInput.addEventListener('input', actualizarCalculosAutobot);
    if (aupurchaseUSDTInput) aupurchaseUSDTInput.addEventListener('input', actualizarCalculosAutobot);
    if (aupurchaseBTCInput) aupurchaseBTCInput.addEventListener('input', actualizarCalculosAutobot);
    if (auincrementInput) auincrementInput.addEventListener('input', actualizarCalculosAutobot);
    if (audecrementInput) audecrementInput.addEventListener('input', actualizarCalculosAutobot);
    if (autriggerInput) autriggerInput.addEventListener('input', actualizarCalculosAutobot);

    auorderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            fetchOrders(currentTab);
        });
    });

    setOrdersActiveTab('tab-opened');
    fetchOrders('opened');
    
    // Verificamos el estado del bot al iniciar y en un intervalo
    checkBotStatus();
    intervals.botStatus = setInterval(checkBotStatus, 5000); // Actualiza el estado cada 5 segundos
}

function initializeAibotView() {
    console.log("Inicializando vista del Aibot...");
    
    const aiamountUSDTInput = document.getElementById('aiamount-usdt');
    const aiamountBTCInput = document.getElementById('aiamount-btc');
    const aipurchaseUSDTInput = document.getElementById("aipurchase-usdt");
    const aipurchaseBTCInput = document.getElementById("aipurchase-btc");
    const aiincrementInput = document.getElementById("aiincrement");
    const aidecrementInput = document.getElementById("aidecrement");
    const aitriggerInput = document.getElementById("aitrigger");
    const aistartBtn = document.getElementById('aistart-btn');
    const airesetBtn = document.getElementById('aireset-btn');
    const aiorderTabs = document.querySelectorAll('#aibot-section [id^="tab-"]');

    loadBotConfigAndState();
    actualizarCalculosAibot();
    checkBitMartConnectionAndData();
    
    // Después
    currentChart = initializeChart('au-tvchart', TRADE_SYMBOL);
    startPriceUpdates(TRADE_SYMBOL, 'aiprice', 2500);

    if (aistartBtn) aistartBtn.addEventListener('click', toggleBotState);
    if (airesetBtn) airesetBtn.addEventListener('click', resetBot);
    
    if (aiamountUSDTInput) aiamountUSDTInput.addEventListener('input', actualizarCalculosAibot);
    if (aiamountBTCInput) aiamountBTCInput.addEventListener('input', actualizarCalculosAibot);
    if (aipurchaseUSDTInput) aipurchaseUSDTInput.addEventListener('input', actualizarCalculosAibot);
    if (aipurchaseBTCInput) aipurchaseBTCInput.addEventListener('input', actualizarCalculosAibot);
    if (aiincrementInput) aiincrementInput.addEventListener('input', actualizarCalculosAibot);
    if (aidecrementInput) aidecrementInput.addEventListener('input', actualizarCalculosAibot);
    if (aitriggerInput) aitriggerInput.addEventListener('input', actualizarCalculosAibot);

    aiorderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            fetchOrders(currentTab);
        });
    });

    setOrdersActiveTab('tab-opened');
    fetchOrders('opened');
}

function initializeTab(tabName) {
    Object.values(intervals).forEach(clearInterval);
    intervals = {};
    
    stopPriceUpdates();

    if (currentChart) {
        currentChart.remove();
        currentChart = null;
    }
    
    if (tabName === 'autobot') {
        initializeAutobotView();
        intervals.autobot = setInterval(getBalances, 10000);
        intervals.orders = setInterval(() => fetchOrders(currentTab), 15000);
    } else if (tabName === 'dashboard') {
        initializeDashboardView();
        intervals.dashboard = setInterval(getBalances, 10000);
    } else if (tabName === 'testbot') {
        initializeTestbotView();
        intervals.testbot = setInterval(getBalances, 10000);
    } else if (tabName === 'aibot') {
        initializeAibotView();
        intervals.aibot = setInterval(getBalances, 10000);
    }
}

// --- Event Listeners del DOMContentLoaded (Punto de entrada principal) ---
document.addEventListener('DOMContentLoaded', () => {
    setupNavTabs(initializeTab);

    const logMessageElement = document.getElementById('log-message');
    const loginLogoutIcon = document.getElementById('login-logout-icon');
    const apiKeyIcon = document.getElementById('api-key-icon');
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const apiModal = document.getElementById('api-modal');
    const apiForm = document.getElementById('api-form');
    const closeApiModalButton = apiModal ? apiModal.querySelector('.close-button') : null;
    
    if (loginLogoutIcon) {
        loginLogoutIcon.addEventListener('click', () => {
            if (localStorage.getItem('authToken')) {
                handleLogout();
            } else {
                toggleAuthModal(true);
            }
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleAuthFormSubmit(e);
        });
    }
    
    if (authModal) authModal.addEventListener('click', (e) => { if (e.target === authModal) toggleAuthModal(false); });

    if (apiKeyIcon) {
        apiKeyIcon.addEventListener('click', () => {
            if (!localStorage.getItem('authToken')) {
                alert("Please login first to configure API keys.");
                displayLogMessage("Login required to configure API keys.", "warning", logMessageElement);
                toggleAuthModal(true);
                return;
            }
            toggleApiModal(true);
        });
    }
    
    if (apiForm) apiForm.addEventListener('submit', handleApiFormSubmit);
    if (closeApiModalButton) closeApiModalButton.addEventListener('click', () => toggleApiModal(false));
    if (apiModal) apiModal.addEventListener('click', (e) => { if (e.target === apiModal) toggleApiModal(false); });
});