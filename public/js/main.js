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
 * Actualiza visualmente la bolita de estado en el header con animaciones CSS
 */
function updateConnectionStatusBall(source) {
    const statusDot = document.getElementById('status-dot'); 
    if (!statusDot) return;
    
    // Limpieza total de clases de estado previas
    statusDot.classList.remove('status-green', 'status-red', 'status-purple');

    // Lógica de estados según la fuente de datos recibida del backend/socket
    switch (source) {
        case 'API_SUCCESS':
            statusDot.classList.add('status-green');
            statusDot.title = 'Conectado a BitMart (Tiempo Real)';
            break;
        case 'CACHE_FALLBACK':
            // Usamos púrpura para el efecto de onda expansiva cuando no es tiempo real puro
            statusDot.classList.add('status-purple');
            statusDot.title = 'Usando datos en caché (Reconectando...)';
            break;
        case 'DISCONNECTED':
        default:
            statusDot.classList.add('status-red');
            statusDot.title = 'Desconectado del servidor';
            break;
    }
}

export async function initializeTab(tabName) {
    // Limpiar todos los intervalos activos de la pestaña anterior
    Object.values(intervals).forEach(clearInterval);
    intervals = {};
    
    // Eliminar gráfico de TradingView si existe para liberar memoria
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
                console.error(`Función ${initFunctionName} no encontrada en el módulo.`);
            }
        } catch (error) {
            console.error(`Error al cargar el módulo ${tabName}:`, error);
        }
    }
}

export function initializeFullApp() {
    // Estado inicial: Rojo hasta recibir confirmación del socket
    updateConnectionStatusBall('DISCONNECTED'); 

    socket = io(BACKEND_URL, { 
        path: '/socket.io',
        reconnectionAttempts: 5,
        timeout: 10000 
    });

    socket.on('connect', () => {
        console.log('Socket conectado al backend');
    });

    socket.on('disconnect', () => {
        updateConnectionStatusBall('DISCONNECTED');
    });

    // Actualización de precio en tiempo real (Header y vistas)
    socket.on('marketData', (data) => {
        const newPrice = parseFloat(data.price);
        if (isNaN(newPrice)) return;

        const priceElements = document.querySelectorAll('.price-display');
        let priceColorClass = (lastPrice > 0 && newPrice > lastPrice) ? 'text-green-500' : 
                             (lastPrice > 0 && newPrice < lastPrice) ? 'text-red-500' : 'text-white';
        
        priceElements.forEach(el => {
            el.classList.remove('text-green-500', 'text-red-500', 'text-white');
            el.classList.add(priceColorClass);
            el.textContent = `$${newPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        });
        lastPrice = newPrice;
    });

    // Actualización de balances y estado de conexión API
    socket.on('balance-real-update', (data) => {
        // Actualiza la bolita de estado según 'source' (API_SUCCESS o CACHE_FALLBACK)
        updateConnectionStatusBall(data.source);

        if (data.lastAvailableUSDT !== undefined) {
            updateBotBalances([
                { currency: 'USDT', available: data.lastAvailableUSDT },
                { currency: 'BTC', available: data.lastAvailableBTC }
            ]);
        }
    });

    // Logs del Bot para la barra superior
    socket.on('bot-log', (log) => {
        const logEl = document.getElementById('log-message');
        if (logEl) {
            logEl.textContent = log.message;
            // Asegúrate de tener clases .log-info, .log-error, .log-success en su CSS
            logEl.className = `log-message log-${log.type || 'info'}`;
        }
    });

    setupNavTabs(initializeTab);
}

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar eventos de Login/Modal
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();

    // Si hay sesión iniciada, arrancar la App completa
    if (localStorage.getItem('token')) {
        initializeFullApp();
    } else {
        // Si no, solo permitir navegación básica (vistas de "Logged Out")
        setupNavTabs(initializeTab);
    }
});