import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotBalances } from './modules/balance.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';

export let currentChart = null;
export let intervals = {};
export let socket = null;

let lastPrice = 0;

// Registro de módulos para carga dinámica
const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),
    aibot: () => import('./modules/aibot.js')
};

/**
 * Actualiza el indicador visual de conexión
 */
function updateConnectionStatusBall(source) {
    const statusDot = document.getElementById('status-dot'); 
    if (!statusDot) return;
    
    statusDot.className = 'status-dot transition-all duration-500'; // Reset clases

    switch (source) {
        case 'API_SUCCESS':
            statusDot.classList.add('status-green');
            statusDot.title = 'Conectado a BitMart';
            break;
        case 'CACHE_FALLBACK':
            statusDot.classList.add('status-purple');
            statusDot.title = 'Caché / Reconectando...';
            break;
        default:
            statusDot.classList.add('status-red');
            statusDot.title = 'Servidor Offline';
    }
}

/**
 * Carga el HTML y activa la lógica JS de la pestaña seleccionada
 */
export async function initializeTab(tabName) {
    // 1. Limpieza de recursos
    Object.values(intervals).forEach(clearInterval);
    intervals = {};
    
    if (window.currentChart && typeof window.currentChart.remove === 'function') {
        window.currentChart.remove();
        window.currentChart = null;
    }

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    // Efecto de transición (Opacidad)
    mainContent.style.opacity = '0';

    try {
        // 2. Fetch del HTML físico
        const response = await fetch(`./${tabName}.html`);
        if (!response.ok) throw new Error("Plantilla no encontrada");
        const html = await response.text();
        
        mainContent.innerHTML = html;
        mainContent.style.opacity = '1'; // Mostrar contenido

        // 3. Inicialización del módulo JS correspondiente
        if (views[tabName]) {
            const module = await views[tabName](); 
            const initFunctionName = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;

            if (module[initFunctionName]) {
                await module[initFunctionName]();
            }
        }
    } catch (error) {
        console.error(`Error al cargar ${tabName}:`, error);
        mainContent.innerHTML = `<div class="p-10 text-center text-red-400">Error cargando vista: ${tabName}</div>`;
        mainContent.style.opacity = '1';
    }
}

/**
 * Inicialización completa de la App (Sockets y Eventos Globales)
 */
export function initializeFullApp() {
    updateConnectionStatusBall('DISCONNECTED'); 

    // Configuración de Socket.io
    socket = io(BACKEND_URL, { 
        path: '/socket.io',
        reconnectionAttempts: 10,
        transports: ['websocket'] // Forzar websocket para evitar polling
    });

    socket.on('connect', () => {
        console.log('Real-time: Connected');
        updateConnectionStatusBall('API_SUCCESS');
    });

    socket.on('disconnect', () => updateConnectionStatusBall('DISCONNECTED'));

    // --- MANEJO DE DATOS EN TIEMPO REAL ---

    socket.on('marketData', (data) => {
        const newPrice = parseFloat(data.price);
        if (isNaN(newPrice)) return;

        // Actualización masiva de precios en la UI
        const priceElements = document.querySelectorAll('.price-display');
        const colorClass = (lastPrice > 0 && newPrice > lastPrice) ? 'text-green-500' : 
                          (lastPrice > 0 && newPrice < lastPrice) ? 'text-red-500' : 'text-white';
        
        priceElements.forEach(el => {
            el.className = `price-display ${colorClass} transition-colors duration-300`;
            el.textContent = `$${newPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        });

        // Específico para sección Autobot
        const auPriceEl = document.getElementById('auprice');
        if (auPriceEl) auPriceEl.textContent = `$${newPrice.toFixed(2)}`;

        // 24h Change
        const percentEl = document.getElementById('price-percent');
        const iconEl = document.getElementById('price-icon');
        if (percentEl && data.priceChangePercent !== undefined) {
            const isUp = data.priceChangePercent >= 0;
            percentEl.textContent = `${Math.abs(data.priceChangePercent).toFixed(2)}%`;
            percentEl.className = isUp ? 'text-green-400' : 'text-red-400';
            if (iconEl) iconEl.className = `fas ${isUp ? 'fa-caret-up' : 'fa-caret-down'} ${isUp ? 'text-green-400' : 'text-red-400'} mr-1`;
        }
        lastPrice = newPrice;
    });

    socket.on('bot-stats', (data) => {
        const profitEl = document.getElementById('auprofit');
        if (profitEl) {
            const val = parseFloat(data.totalProfit || 0);
            profitEl.textContent = `${val >= 0 ? '+' : '-'}$${Math.abs(val).toFixed(2)}`;
            profitEl.className = `text-xl font-mono font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
        }
    });

    socket.on('balance-real-update', (data) => {
        updateConnectionStatusBall(data.source);

        // Actualización Header Global
        updateBotBalances([
            { currency: 'USDT', available: data.lastAvailableUSDT },
            { currency: 'BTC', available: data.lastAvailableBTC }
        ]);

        // Sincronización con Sidebar del Autobot si existe
        const elements = {
            'aubalance-usdt': parseFloat(data.lastAvailableUSDT || 0).toFixed(2),
            'aubalance-btc': parseFloat(data.lastAvailableBTC || 0).toFixed(6),
            'au-max-usdt': `(Max: ${parseFloat(data.lastAvailableUSDT || 0).toFixed(2)})`,
            'au-max-btc': `(Max: ${parseFloat(data.lastAvailableBTC || 0).toFixed(6)})`
        };

        Object.entries(elements).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        });
    });

    socket.on('bot-log', (log) => {
        const logEl = document.getElementById('log-message');
        if (logEl) {
            logEl.textContent = log.message;
            logEl.className = `log-message text-xs font-medium animate-pulse log-${log.type || 'info'}`;
        }
    });

    setupNavTabs(initializeTab);
}

// Iniciar aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();

    if (localStorage.getItem('token')) {
        initializeFullApp();
    } else {
        setupNavTabs(initializeTab);
    }
});