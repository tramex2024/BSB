// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';

// Importa todas las funciones de inicialización de las vistas
import { initializeDashboardView } from './modules/dashboard.js';
import { initializeTestbotView } from './modules/testbot.js';
import { initializeAutobotView } from './modules/autobot.js';
import { initializeAibotView } from './modules/aibot.js';

// --- Constantes y variables globales (EXPORTADAS) ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';

export let currentChart = null;
export let intervals = {};

// Mapa de funciones de inicialización
const views = {
    dashboard: initializeDashboardView,
    testbot: initializeTestbotView,
    autobot: initializeAutobotView,
    aibot: initializeAibotView
};

/**
 * Función central para inicializar la pestaña seleccionada.
 * Se llama desde navigation.js después de cargar el contenido HTML.
 * @param {string} tabName - El nombre de la pestaña a inicializar.
 */
export function initializeTab(tabName) {
    // Limpia los intervalos de la pestaña anterior
    Object.values(intervals).forEach(clearInterval);
    intervals = {};
    
    // Remueve el gráfico si existe
    if (currentChart && typeof currentChart.remove === 'function') {
        currentChart.remove();
        currentChart = null;
    }
    
    // Llama a la función de inicialización del módulo de vista correspondiente
    if (views[tabName]) {
        views[tabName]();
    }
}

/**
 * Función que inicializa la aplicación completa después de un login exitoso.
 */
export function initializeFullApp() {
    console.log("Token de autenticación encontrado. Inicializando la aplicación...");
    
    // Conexión del socket
    const socket = io(BACKEND_URL, {
        path: '/socket.io'
    });

    socket.on('marketData', (data) => {
        const priceElements = document.querySelectorAll('.price-display');
        priceElements.forEach(el => {
            el.textContent = data.price ? `$${parseFloat(data.price).toFixed(2)}` : 'N/A';
        });
    });

    socket.on('bot-log', (log) => {
        const logMessageElement = document.getElementById('log-message');
        if (logMessageElement) {
            logMessageElement.textContent = log.message;
            logMessageElement.className = `log-message log-${log.type}`;
        }
    });

    // Carga la pestaña inicial y configura la navegación
    setupNavTabs(initializeTab);
}

// --- LÓGICA PRINCIPAL AL CARGAR LA PÁGINA ---
document.addEventListener('DOMContentLoaded', () => {
    // Configura los eventos globales y el comportamiento del login/logout
    initializeAppEvents(initializeFullApp); // Pasamos la función como callback
    updateLoginIcon();
    
    // Verifica si ya existe un token de autenticación.
    const token = localStorage.getItem('token');
    if (token) {
        // Si hay token, inicializa la aplicación completa.
        initializeFullApp();
    } else {
        // Si no hay token, la navegación ya se encargará de restringir el acceso.
        // Solo necesitamos que el dashboard se cargue inicialmente.
        console.log("No se encontró un token de autenticación. La navegación está restringida.");
        setupNavTabs(initializeTab); // Carga la navegación y la pestaña del dashboard
    }
});