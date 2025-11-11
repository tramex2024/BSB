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

// 💡 Variable para rastrear el último precio conocido de BTC/USDT
let lastPrice = 0;

// Mapa de funciones de inicialización
const views = {
    dashboard: initializeDashboardView,
    testbot: initializeTestbotView,
    autobot: initializeAutobotView,
    aibot: initializeAibotView
};

/**
 * Función que actualiza el estado visual de la conexión (la "bolita").
 * Movida aquí para ser global e independiente de la pestaña activa.
 * NOTA: Idealmente, esta función debería estar en 'uiManager.js'.
 * @param {string} source - 'API_SUCCESS' (verde) o 'CACHE_FALLBACK' (amarillo).
 */
function updateConnectionStatusBall(source) {
    // Asegúrate de que este ID coincida con el elemento de la bolita en tu HTML
    const statusBall = document.getElementById('bitmart-connection-status');
    if (!statusBall) return;
    
    // Eliminamos clases viejas
    statusBall.classList.remove('status-red', 'status-yellow', 'status-green');

    if (source === 'API_SUCCESS') {
        // Verde: Conexión exitosa y datos actualizados.
        statusBall.classList.add('status-green');
        statusBall.title = 'Conectado a BitMart (Datos recientes de la API)';
    } else if (source === 'CACHE_FALLBACK') {
        // Amarillo: Falló la API (e.g., rate limit), usando la caché anterior.
        // Mantenemos el color por defecto (rojo, que se añade por CSS) para indicar que no hay datos frescos.
        statusBall.classList.add('status-yellow');
        statusBall.title = 'Advertencia: Fallo de conexión o Rate Limit. Usando datos en caché.';
    } else {
        // Rojo: Estado desconocido o error grave.
        statusBall.classList.add('status-red');
        statusBall.title = 'Error de conexión con BitMart.';
    }
}


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
    
    // Conexión del socket (ÚNICA CONEXIÓN)
    const socket = io(BACKEND_URL, {
        path: '/socket.io'
    });

    // 💡 LISTENER PARA DATOS DE MERCADO (Actualiza precio y color)
    socket.on('marketData', (data) => {
        const newPrice = parseFloat(data.price);
        if (isNaN(newPrice)) return;

        const priceElements = document.querySelectorAll('.price-display');
        
        // Determinar el cambio de precio y la clase de color
        let priceColorClass = '';
        if (lastPrice > 0 && newPrice > lastPrice) {
            priceColorClass = 'text-green-500'; // Precio sube
        } else if (lastPrice > 0 && newPrice < lastPrice) {
            priceColorClass = 'text-red-500'; // Precio baja
        } else {
            priceColorClass = 'text-white'; // Precio inicial o sin cambios
        }
        
        // Actualizar todos los elementos del precio
        priceElements.forEach(el => {
            // Limpiar clases de color anteriores (solo colores, no layout)
            el.classList.remove('text-green-500', 'text-red-500', 'text-white');
            
            // Aplicar nueva clase de color
            el.classList.add(priceColorClass);

            // Actualizar el valor del texto
            el.textContent = `$${newPrice.toFixed(2)}`;
        });

        // Actualizar el último precio para la próxima comparación
        lastPrice = newPrice;
    });
    // --------------------------------------------------------

    socket.on('bot-log', (log) => {
        const logMessageElement = document.getElementById('log-message');
        if (logMessageElement) {
            logMessageElement.textContent = log.message;
            logMessageElement.className = `log-message log-${log.type}`;
        }
    });

    // 💡 LISTENER GLOBAL PARA EL ESTADO DE CONEXIÓN (BOLITA)
    socket.on('balance-real-update', (data) => {
        updateConnectionStatusBall(data.source);
    });
    // --------------------------------------------------------

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