// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents } from './modules/appEvents.js';

// --- Módulos de vista ---
import { initializeDashboardView } from './modules/dashboard.js';
import { initializeTestbotView } from './modules/testbot.js';
import { initializeAutobotView } from './modules/autobot.js';
import { initializeAibotView } from './modules/aibot.js';

// --- Constantes globales ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';

let currentChart = null;
let intervals = {};

// --- Elementos del DOM ---
const logMessageElement = document.getElementById('log-message');
const mainContent = document.getElementById('main-content');
const views = {
    dashboard: initializeDashboardView,
    testbot: initializeTestbotView,
    autobot: initializeAutobotView,
    aibot: initializeAibotView
};

/**
 * Muestra u oculta las vistas principales basándose en el estado de autenticación.
 */
export function updateMainView() {
    const isLoggedIn = localStorage.getItem('authToken');
    const navTabs = document.querySelectorAll('.header-middle .nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const loggedOutView = document.getElementById('logged-out-view');

    if (isLoggedIn) {
        if (loggedOutView) loggedOutView.style.display = 'none';
        navTabs.forEach(tab => tab.style.display = 'block');
        const dashboardTab = document.querySelector('.header-middle .nav-tab[data-tab="dashboard"]');
        if (dashboardTab) dashboardTab.click();
    } else {
        tabContents.forEach(content => content.style.display = 'none');
        if (loggedOutView) loggedOutView.style.display = 'block';
        navTabs.forEach(tab => tab.style.display = 'none');
    }
}

/**
 * Función central para inicializar la pestaña seleccionada.
 * @param {string} tabName - El nombre de la pestaña a inicializar.
 */
function initializeTab(tabName) {
    Object.values(intervals).forEach(clearInterval);
    intervals = {};
    
    if (currentChart && typeof currentChart.remove === 'function') {
        currentChart.remove();
        currentChart = null;
    }
    
    // Llama a la función de inicialización del módulo de vista correspondiente
    if (views[tabName]) {
        views[tabName]();
    }
}

// --- LÓGICA PRINCIPAL AL CARGAR LA PÁGINA ---
document.addEventListener('DOMContentLoaded', () => {
    initializeAppEvents();
    updateMainView();
    setupNavTabs(initializeTab);
    
    const socket = io(BACKEND_URL, {
        path: '/socket.io'
    });

    socket.on('marketData', (data) => {
        const priceElements = document.querySelectorAll('.price-display');
        priceElements.forEach(el => {
            el.textContent = data.price ? `$${parseFloat(data.price).toFixed(2)}` : 'N/A';
        });

        // Este código ahora debería vivir en los módulos de vista para ser más limpio.
        // Lo mantendremos aquí por ahora para no romper la funcionalidad.
        const usdtDashboardElement = document.getElementById('usdt-balance');
        const btcDashboardElement = document.getElementById('btc-balance');
        if (usdtDashboardElement && data.usdt) {
            usdtDashboardElement.textContent = parseFloat(data.usdt).toFixed(8);
        }
        if (btcDashboardElement && data.btc) {
            btcDashboardElement.textContent = parseFloat(data.btc).toFixed(8);
        }
        const auBalanceElement = document.getElementById('aubalance');
        if (auBalanceElement && data.usdt) {
            auBalanceElement.textContent = parseFloat(data.usdt).toFixed(8);
        }
        const teBalanceUSDTElement = document.getElementById('teamount-usdt');
        const teBalanceBTCElement = document.getElementById('teamount-btc');
        if (teBalanceUSDTElement && data.usdt) {
            teBalanceUSDTElement.textContent = parseFloat(data.usdt).toFixed(8);
        }
        if (teBalanceBTCElement && data.btc) {
            teBalanceBTCElement.textContent = parseFloat(data.btc).toFixed(8);
        }
    });

    socket.on('bot-log', (log) => {
        displayLogMessage(log.message, log.type, logMessageElement);
    });
});