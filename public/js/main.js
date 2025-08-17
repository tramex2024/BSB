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

// --- Importaciones de cálculos consolidadas ---
import { actualizarCalculosTestbot } from './modules/tecalculations.js';
import { actualizarCalculosAutobot } from './modules/aucalculations.js';
import { actualizarCalculosAibot } from './modules/aicalculations.js';

// --- Constantes globales ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';

// Nueva constante para el símbolo de TradingView
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';

let currentChart = null; // Variable global para almacenar la instancia del gráfico
let currentTab = 'dashboard';
let intervals = {};

// --- Funciones de inicialización de la vista ---
function initializeDashboardView() {
    console.log("Inicializando vista del Dashboard...");
    getBalances();
    checkBitMartConnectionAndData();
}

function initializeTestbotView() {
    console.log("Inicializando vista del Testbot...");
    
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
    
    currentChart = initializeChart('te-tvchart', TRADE_SYMBOL_TV);

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

function initializeAutobotView() {
    console.log("Inicializando vista del Autobot...");
    
    const auamountUSDTInput = document.getElementById('auamount-usdt');
    const aupurchaseUSDTInput = document.getElementById("aupurchase-usdt");
    const aupurchaseBTCInput = document.getElementById("aupurchase-btc");
    const auincrementInput = document.getElementById("auincrement");
    const audecrementInput = document.getElementById("audecrement");
    const autriggerInput = document.getElementById("autrigger");
    const austartBtn = document.getElementById('austart-btn');
    const auresetBtn = document.getElementById('aureset-btn');
    const auorderTabs = document.querySelectorAll('#autobot-section [id^="tab-"]');

    loadBotConfigAndState();
    // NOTA: Se elimina la llamada a actualizarCalculosAutobot() aquí
    checkBitMartConnectionAndData();
    
    currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV); 

    if (austartBtn) {
        austartBtn.addEventListener('click', () => {
            const config = {
                purchaseUsdtAmount: parseFloat(aupurchaseUSDTInput.value),
                purchaseBtcAmount: parseFloat(aupurchaseBTCInput.value),
                symbol: TRADE_SYMBOL_BITMART,
                interval: 5000
            };
            
            toggleBotState('autobot', config);
        });
    }

    if (auresetBtn) auresetBtn.addEventListener('click', resetBot);
    
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
            fetchOrders(currentTab);
        });
    });

    setOrdersActiveTab('tab-opened');
    fetchOrders('opened');
    
    checkBotStatus();
    intervals.botStatus = setInterval(checkBotStatus, 5000);
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
    
    currentChart = initializeChart('ai-tvchart', TRADE_SYMBOL_TV);

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
    
    if (currentChart && typeof currentChart.remove === 'function') {
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
    
    const socket = io(BACKEND_URL, {
        path: '/socket.io'
    });

    // --- CÓDIGO ACTUALIZADO PARA RECIBIR DATOS DE MERCADO ---
    socket.on('marketData', (data) => {
        // Log para verificar si los datos se reciben
        console.log("¡Datos de mercado recibidos del backend!", data);
        
        // Use a more robust selector to update the price in all relevant tabs
        const priceElements = document.querySelectorAll('.price-display');

        priceElements.forEach(el => {
            el.textContent = `$${parseFloat(data.price).toFixed(2)}`;
        });
        
        const usdtBalanceElement = document.getElementById('usdt-balance');
        const btcBalanceElement = document.getElementById('btc-balance');
        if (usdtBalanceElement) {
            usdtBalanceElement.textContent = data.usdt;
        }
        if (btcBalanceElement) {
            btcBalanceElement.textContent = data.btc;
        }
        
        // Llamar a la función de cálculos una vez que se recibe el precio
        if (currentTab === 'autobot') {
            actualizarCalculosAutobot();
        } else if (currentTab === 'testbot') {
            actualizarCalculosTestbot();
        } else if (currentTab === 'aibot') {
            actualizarCalculosAibot();
        }
    });

    socket.on('bot-log', (log) => {
        displayLogMessage(log.message, log.type, logMessageElement);
    });

    socket.on('bot-state-update', (state) => {
        console.log("Estado del bot recibido:", state);

        const lStateElement = document.getElementById('aubot-lstate');
        const sStateElement = document.getElementById('aubot-sstate');
        
        if (lStateElement) {
            lStateElement.textContent = state.lstate;
            if (state.lstate === 'RUNNING') {
                lStateElement.classList.remove('text-red-400');
                lStateElement.classList.add('text-green-400');
            } else {
                lStateElement.classList.remove('text-green-400');
                lStateElement.classList.add('text-red-400');
            }
        }
        
        if (sStateElement) {
            sStateElement.textContent = state.sstate;
            if (state.sstate === 'RUNNING') {
                sStateElement.classList.remove('text-red-400');
                sStateElement.classList.add('text-green-400');
            } else {
                sStateElement.classList.remove('text-green-400');
                sStateElement.classList.add('text-red-400');
            }
        }
    });

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