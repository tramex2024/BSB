// public/js/main.js

import { toggleAuthModal, handleLogout, handleAuthFormSubmit, displayLogMessage } from './modules/auth.js';
import { getBalances } from './modules/balance.js';
import { initializeChart } from './modules/chart.js';
import { checkBitMartConnectionAndData } from './modules/network.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './modules/orders.js';
import { actualizarBalancesEstrategia, actualizarCalculosTestbot } from './modules/tecalculations.js';
import { actualizarBalancesEstrategia, actualizarCalculosAutobot } from './modules/aucalculations.js';
import { actualizarBalancesEstrategia, actualizarCalculosAibot } from './modules/aicalculations.js';
import { loadBotConfigAndState, toggleBotState, resetBot } from './modules/bot.js';
import { setupNavTabs } from './modules/navigation.js';
import { handleApiFormSubmit } from './modules/api.js';
import { toggleApiModal } from './modules/auth.js';
import { startPriceUpdates, stopPriceUpdates } from './modules/price.js';

// --- Constantes globales ---
const BACKEND_URL = 'https://bsb-ppex.onrender.com';
const TRADE_SYMBOL = 'BTC_USDT';

// Exportar constantes para que otros módulos las puedan usar si es necesario
export { BACKEND_URL, TRADE_SYMBOL };

// --- Variables de estado locales ---
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
    actualizarCalculosTestbot(); // Llamada inicial para renderizar todos los valores
    checkBitMartConnectionAndData();
    
    initializeChart('tvchart', `BINANCE:${TRADE_SYMBOL}`);
    
    startPriceUpdates(TRADE_SYMBOL, 'price', 2500); // Actualiza cada 3 segundos

    if (testartBtn) startBtn.addEventListener('click', toggleBotState);
    if (teresetBtn) resetBtn.addEventListener('click', resetBot);
    
    // --- Escuchadores de eventos para los nuevos cálculos ---
    // Cada vez que se modifica un input, se ejecuta la función de cálculos completa.
    if (teamountUSDTInput) amountUSDTInput.addEventListener('input', actualizarCalculosTestbot);
    if (teamountBTCInput) amountBTCInput.addEventListener('input', actualizarCalculosTestbot);
    if (tepurchaseUSDTInput) purchaseUSDTInput.addEventListener('input', actualizarCalculosTestbot);
    if (tepurchaseBTCInput) purchaseBTCInput.addEventListener('input', actualizarCalculosTestbot);
    if (teincrementInput) incrementInput.addEventListener('input', actualizarCalculosTestbot);
    if (tedecrementInput) decrementInput.addEventListener('input', actualizarCalculosTestbot);
    if (tetriggerInput) triggerInput.addEventListener('input', actualizarCalculosTestbot);

    orderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            fetchOrders(currentTab);
        });
    });

    setOrdersActiveTab('tab-opened');
    fetchOrders('opened');

    actualizarBalancesEstrategia();
}


function initializeAutobotView() {
    console.log("Inicializando vista del Autobot...");
    
    // Obtener referencias a todos los inputs y botones
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
    actualizarCalculosAutobot(); // Llamada inicial para renderizar todos los valores
    checkBitMartConnectionAndData();
    
    initializeChart('tvchart', `BINANCE:${TRADE_SYMBOL}`);
    
    startPriceUpdates(TRADE_SYMBOL, 'price', 2500); // Actualiza cada 3 segundos

    if (austartBtn) startBtn.addEventListener('click', toggleBotState);
    if (auresetBtn) resetBtn.addEventListener('click', resetBot);
    
    // --- Escuchadores de eventos para los nuevos cálculos ---
    // Cada vez que se modifica un input, se ejecuta la función de cálculos completa.
    if (auamountUSDTInput) amountUSDTInput.addEventListener('input', actualizarCalculosAutobot);
    if (auamountBTCInput) amountBTCInput.addEventListener('input', actualizarCalculosAutobot);
    if (aupurchaseUSDTInput) purchaseUSDTInput.addEventListener('input', actualizarCalculosAutobot);
    if (aupurchaseBTCInput) purchaseBTCInput.addEventListener('input', actualizarCalculosAutobot);
    if (auincrementInput) incrementInput.addEventListener('input', actualizarCalculosAutobot);
    if (audecrementInput) decrementInput.addEventListener('input', actualizarCalculosAutobot);
    if (autriggerInput) triggerInput.addEventListener('input', actualizarCalculosAutobot);

    orderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            fetchOrders(currentTab);
        });
    });

    setOrdersActiveTab('tab-opened');
    fetchOrders('opened');

    actualizarBalancesEstrategia();
}

function initializeAibotView() {
    console.log("Inicializando vista del Aibot...");
    
    // Obtener referencias a todos los inputs y botones
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
    actualizarCalculosAibot(); // Llamada inicial para renderizar todos los valores
    checkBitMartConnectionAndData();
    
    initializeChart('tvchart', `BINANCE:${TRADE_SYMBOL}`);
    
    startPriceUpdates(TRADE_SYMBOL, 'price', 2500); // Actualiza cada 3 segundos

    if (testartBtn) startBtn.addEventListener('click', toggleBotState);
    if (teresetBtn) resetBtn.addEventListener('click', resetBot);
    
    // --- Escuchadores de eventos para los nuevos cálculos ---
    // Cada vez que se modifica un input, se ejecuta la función de cálculos completa.
    if (aiamountUSDTInput) amountUSDTInput.addEventListener('input', actualizarCalculosAibot);
    if (aiamountBTCInput) amountBTCInput.addEventListener('input', actualizarCalculosAibot);
    if (aipurchaseUSDTInput) purchaseUSDTInput.addEventListener('input', actualizarCalculosAibot);
    if (aipurchaseBTCInput) purchaseBTCInput.addEventListener('input', actualizarCalculosAibot);
    if (aiincrementInput) incrementInput.addEventListener('input', actualizarCalculosAibot);
    if (aidecrementInput) decrementInput.addEventListener('input', actualizarCalculosAibot);
    if (aitriggerInput) triggerInput.addEventListener('input', actualizarCalculosAibot);

    orderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            fetchOrders(currentTab);
        });
    });

    setOrdersActiveTab('tab-opened');
    fetchOrders('opened');

    actualizarBalancesEstrategia();
}

function initializeTab(tabName) {
    // Detiene todos los intervalos activos
    Object.values(intervals).forEach(clearInterval);
    intervals = {}; // Limpia el objeto de intervalos
    
    // Detiene la actualización de precios
    stopPriceUpdates();

    if (tabName === 'autobot') {
        initializeAutobotView();
        intervals.autobot = setInterval(checkBitMartConnectionAndData, 10000);
        intervals.orders = setInterval(() => fetchOrders(currentTab), 15000);
    } else if (tabName === 'dashboard') {
        initializeDashboardView();
        intervals.dashboard = setInterval(checkBitMartConnectionAndData, 10000);
    } else if (tabName === 'testbot') {
        initializeTestbotView();
        intervals.testbot = setInterval(checkBitMartConnectionAndData, 10000);
    } else if (tabName === 'aibot') {
        initializeAibotView();
        intervals.aibot = setInterval(checkBitMartConnectionAndData, 10000);
    }
}

// --- Event Listeners del DOMContentLoaded (Punto de entrada principal) ---
document.addEventListener('DOMContentLoaded', () => {
    // Pasar la función de inicialización de vista como callback
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