// public/js/main.js
import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotBalances } from './modules/balance.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const SOCKET_SERVER_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';

export let currentChart = null;
export let intervals = {};
export let socket = null;

let lastPrice = 0;

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),
    aibot: () => import('./modules/aibot.js')
};

/**
 * Actualiza visualmente la bolita de estado en el header
 */
function updateConnectionStatusBall(source) {
    const statusDot = document.getElementById('status-dot'); 
    if (!statusDot) return;
    
    // 1. Limpiamos todas las clases de estado pero mantenemos las de forma y tamaño
    // Usamos className para resetear por completo y evitar residuos
    statusDot.className = 'h-full w-full rounded-full block'; 

    // 2. Aplicamos la lógica de estados según la fuente de datos
    if (source === 'API_SUCCESS') {
        statusDot.classList.add('status-green'); // Pulso verde (CSS)
        statusDot.title = 'Conectado a BitMart';
    } else if (source === 'CACHE_FALLBACK') {
        statusDot.classList.add('status-yellow'); // Parpadeo lento amarillo (CSS)
        statusDot.title = 'Usando datos en caché';
    } else {
        // DISCONNECTED o errores
        statusDot.classList.add('status-red'); // Parpadeo rápido rojo (CSS)
        statusDot.title = 'Desconectado';
    }
}

export async function initializeTab(tabName) {
    Object.values(intervals).forEach(clearInterval);
    intervals = {};
    
    if (currentChart && typeof currentChart.remove === 'function') {
        currentChart.remove();
        currentChart = null;
    }
    
    if (views[tabName]) {
        try {
            const module = await views[tabName](); 
            const initFunctionName = 'initialize' + tabName.charAt(0).toUpperCase() + tabName.slice(1) + 'View';

            if (module[initFunctionName]) {
                await module[initFunctionName]();
            } else {
                console.error(`Función ${initFunctionName} no encontrada.`);
            }
        } catch (error) {
            console.error(`Error al cargar el módulo ${tabName}:`, error);
        }
    }
}

export function initializeFullApp() {
    // Estado inicial al conectar
    updateConnectionStatusBall('DISCONNECTED'); 

    socket = io(BACKEND_URL, { path: '/socket.io' });

    socket.on('disconnect', () => updateConnectionStatusBall('DISCONNECTED'));

    socket.on('marketData', (data) => {
        const newPrice = parseFloat(data.price);
        if (isNaN(newPrice)) return;

        const priceElements = document.querySelectorAll('.price-display');
        let priceColorClass = (lastPrice > 0 && newPrice > lastPrice) ? 'text-green-500' : 
                             (lastPrice > 0 && newPrice < lastPrice) ? 'text-red-500' : 'text-white';
        
        priceElements.forEach(el => {
            el.classList.remove('text-green-500', 'text-red-500', 'text-white');
            el.classList.add(priceColorClass);
            el.textContent = `$${newPrice.toFixed(2)}`;
        });
        lastPrice = newPrice;
    });

    socket.on('balance-real-update', (data) => {
        // Aquí es donde recibimos el estado de la conexión desde el backend
        updateConnectionStatusBall(data.source);
        if (data.lastAvailableUSDT !== undefined) {
            updateBotBalances([
                { currency: 'USDT', available: data.lastAvailableUSDT },
                { currency: 'BTC', available: data.lastAvailableBTC }
            ]);
        }
    });

    socket.on('bot-log', (log) => {
        const logEl = document.getElementById('log-message');
        if (logEl) {
            logEl.textContent = log.message;
            logEl.className = `log-message log-${log.type}`;
        }
    });

    setupNavTabs(initializeTab);
}

document.addEventListener('DOMContentLoaded', () => {
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();
    if (localStorage.getItem('token')) initializeFullApp();
    else setupNavTabs(initializeTab);
});