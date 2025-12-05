import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';

// Importa todas las funciones de inicialización de las vistas
import { initializeDashboardView } from './modules/dashboard.js';
import { initializeAutobotView } from './modules/autobot.js';
import { updateOpenOrdersTable } from './modules/orders.js'; // Necesaria para el WS
import { updateBotBalances } from './modules/balance.js';
import { initializeAibotView } from './modules/aibot.js';

// --- Constantes y variables globales (EXPORTADAS) ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const SOCKET_SERVER_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';

export let currentChart = null;
export let intervals = {};

// 💡 Variable para rastrear el último precio conocido de BTC/USDT
let lastPrice = 0;

// Mapa de funciones de inicialización
const views = {
    dashboard: initializeDashboardView,
    autobot: initializeAutobotView,
    aibot: initializeAibotView
};

/**
 * Función que actualiza el estado visual de la conexión (la "bolita").
 * @param {string} source - 'API_SUCCESS' (verde) o 'CACHE_FALLBACK' (amarillo) o 'DISCONNECTED' (rojo).
 */
function updateConnectionStatusBall(source) {
    // 🛑 CRÍTICO: Apuntamos al elemento 'status-dot' que ahora es global en el header.
    const statusDot = document.getElementById('status-dot'); 
    
    if (!statusDot) { 
        console.warn("Elemento 'status-dot' no encontrado. Verifique la ID en el HTML.");
        return;
    }
    
    // 1. Eliminar todas las posibles clases de color de Tailwind
    statusDot.classList.remove('bg-red-500', 'bg-yellow-500', 'bg-green-500');

    // 2. Definir y aplicar el nuevo color de fondo (bg-*) y el tooltip (title)
    if (source === 'API_SUCCESS') {
        // Verde: Conexión exitosa y datos actualizados.
        statusDot.classList.add('bg-green-500');
        statusDot.title = 'Conectado a BitMart (Datos recientes de la API)';
    } else if (source === 'CACHE_FALLBACK') {
        // Amarillo: Falló la API (e.g., rate limit), usando la caché anterior.
        statusDot.classList.add('bg-yellow-500');
        statusDot.title = 'Advertencia: Fallo de conexión o Rate Limit. Usando datos en caché.';
    } else {
        // Rojo: Desconectado o inicialización pendiente (por defecto si no hay source)
        statusDot.classList.add('bg-red-500');
        statusDot.title = 'Desconectado: Error de conexión con BitMart o inicialización pendiente.';
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
    
    // 🛑 Inicializamos el estado a ROJO/Desconectado al iniciar la app.
    updateConnectionStatusBall('DISCONNECTED'); 

    // Conexión del socket (ÚNICA CONEXIÓN)
    const socket = io(BACKEND_URL, {
        path: '/socket.io'
    });

    // Añadir listener para la desconexión del socket
    socket.on('disconnect', () => {
        console.warn('Socket.IO desconectado. Forzando estado de conexión a rojo.');
        // Forzamos el estado a rojo si el socket se desconecta
        updateConnectionStatusBall('DISCONNECTED'); 
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
    
    // 💡 LISTENER PARA ÓRDENES ABIERTAS VÍA WEBSOCKET
    socket.on('open-orders-update', (ordersData) => {
        console.log(`[Socket.io] Recibidas órdenes abiertas/actualizadas vía WebSocket.`);
        
        // Llamamos a la función importada de orders.js para actualizar la tabla
        updateOpenOrdersTable(ordersData); 
    });
    
    socket.on('bot-log', (log) => {
        const logMessageElement = document.getElementById('log-message');
        if (logMessageElement) {
            logMessageElement.textContent = log.message;
            logMessageElement.className = `log-message log-${log.type}`;
        }
    });

    // 💡 LISTENER GLOBAL PARA EL ESTADO DE CONEXIÓN (BOLITA) y BALANCE
    // Esto se activa cada vez que se actualiza el balance real, indicando que hay una conexión viva.
    socket.on('balance-real-update', (data) => {
        console.log(`[STATUS] Recibido evento 'balance-real-update' con source: ${data.source}`);
        updateConnectionStatusBall(data.source);
        
        // Adaptamos la estructura de los datos del socket al formato que espera updateBotBalances
        if (data.lastAvailableUSDT !== undefined && data.lastAvailableBTC !== undefined) {
            const formattedBalances = [
                // Usamos las claves que vienen del backend
                { currency: 'USDT', available: data.lastAvailableUSDT },
                { currency: 'BTC', available: data.lastAvailableBTC }
            ];
            
            // Ahora llama correctamente a la función para dibujar los balances en el DOM
            updateBotBalances(formattedBalances);    
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
        console.log("No se encontró un token de autenticación. La navegación está restringida.");
        setupNavTabs(initializeTab); // Carga la navegación y la pestaña del dashboard
    }
});