// public/js/main.js

import { checkLoginStatus, toggleAuthModal, displayLogMessage } from './modules/auth.js';
import { getBalances } from './modules/balance.js';
import { cargarPrecioEnVivo, checkBitMartConnectionAndData } from './modules/network.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './modules/orders.js';
import { actualizarCalculos } from './modules/calculations.js';
import { loadBotConfigAndState, toggleBotState, resetBot } from './modules/bot.js';
import { setupNavTabs } from './modules/navigation.js';
import { handleAuthFormSubmit } from './modules/auth.js';
import { handleApiFormSubmit } from './modules/api.js';

// --- Constantes globales ---
const BACKEND_URL = 'https://bsb-ppex.onrender.com';
const TRADE_SYMBOL = 'BTC_USDT';

// Exportar constantes para que otros módulos las puedan usar si es necesario
export { BACKEND_URL, TRADE_SYMBOL };

// --- Variables de estado locales ---
let currentTab = 'opened';
let intervals = {};

// --- Elementos del DOM ---
const logMessageElement = document.getElementById('log-message');
const loginLogoutIcon = document.getElementById('login-logout-icon');
const apiKeyIcon = document.getElementById('api-key-icon');

// --- Funciones de inicialización de la vista ---
function initializeDashboardView() {
    // Lógica específica para inicializar la vista del Dashboard
    getBalances();
    cargarPrecioEnVivo();
    checkBitMartConnectionAndData();
}

function initializeAutobotView() {
    // Lógica específica para inicializar la vista de Autobot
    const purchaseInput = document.getElementById("purchase");
    const incrementInput = document.getElementById("increment");
    const decrementInput = document.getElementById("decrement");
    const triggerInput = document.getElementById("trigger");
    const startBtn = document.getElementById('start-btn');
    const resetBtn = document.getElementById('reset-btn');
    const orderTabs = document.querySelectorAll('#autobot-section [id^="tab-"]');

    loadBotConfigAndState();
    actualizarCalculos();
    checkBitMartConnectionAndData();

    if (startBtn) startBtn.addEventListener('click', toggleBotState);
    if (resetBtn) resetBtn.addEventListener('click', resetBot);
    
    if (purchaseInput) purchaseInput.addEventListener('input', actualizarCalculos);
    if (incrementInput) incrementInput.addEventListener('input', actualizarCalculos);
    if (decrementInput) decrementInput.addEventListener('input', actualizarCalculos);
    if (triggerInput) triggerInput.addEventListener('input', actualizarCalculos);

    orderTabs.forEach(tab => {
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
    // Limpiar intervalos anteriores
    Object.values(intervals).forEach(clearInterval);

    if (tabName === 'autobot') {
        initializeAutobotView();
        intervals.autobot = setInterval(checkBitMartConnectionAndData, 10000);
        intervals.orders = setInterval(() => fetchOrders(currentTab), 15000);
    } else if (tabName === 'dashboard') {
        initializeDashboardView();
        intervals.dashboard = setInterval(checkBitMartConnectionAndData, 10000);
    }
    // Añadir lógica para otras pestañas si es necesario (testbot, aibot)
}

// --- Event Listeners del DOMContentLoaded (Punto de entrada principal) ---
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar el estado de login y los modales
    checkLoginStatus();

    // Configurar la navegación principal con un callback para la inicialización
    setupNavTabs(initializeTab);

    // Event listeners para el modal de autenticación
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    if (loginLogoutIcon) {
        loginLogoutIcon.addEventListener('click', () => {
            const isLoggedIn = localStorage.getItem('authToken');
            if (isLoggedIn) {
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

    // Event listeners para el modal de API
    const apiKeyIcon = document.getElementById('api-key-icon');
    const apiModal = document.getElementById('api-modal');
    const apiForm = document.getElementById('api-form');
    const closeApiModalButton = apiModal ? apiModal.querySelector('.close-button') : null;
    if (apiKeyIcon) {
        apiKeyIcon.addEventListener('click', () => {
            const isLoggedIn = localStorage.getItem('authToken');
            if (!isLoggedIn) {
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