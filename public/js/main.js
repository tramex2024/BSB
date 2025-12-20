// public/js/main.js (CORREGIDO PARA SINCRONIZACIÓN COMPLETA DEL ESTADO)



// 1. SOLO IMPORTACIONES ESENCIALES

import { setupNavTabs } from './modules/navigation.js';

import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';

import { updateBotBalances } from './modules/balance.js';



// --- Constantes y variables globales (EXPORTADAS) ---

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';

export const SOCKET_SERVER_URL = 'https://bsb-ppex.onrender.com';

export const TRADE_SYMBOL_TV = 'BTCUSDT';

export const TRADE_SYMBOL_BITMART = 'BTC_USDT';



export let currentChart = null;

export let intervals = {};

export let socket = null; // Variable para la conexión Socket.IO



// 💡 Variable para rastrear el último precio conocido de BTC/USDT

let lastPrice = 0;



// MAPA DE VISTAS CON IMPORTACIONES DINÁMICAS (Lazy Loading)

const views = {

    dashboard: () => import('./modules/dashboard.js'),

    autobot: () => import('./modules/autobot.js'),

    aibot: () => import('./modules/aibot.js')

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

 * 🛑 CRÍTICO: Ahora es ASÍNCRONA para usar 'await'.

 * @param {string} tabName - El nombre de la pestaña a inicializar.

 */

export async function initializeTab(tabName) {

    // Limpia los intervalos de la pestaña anterior

    Object.values(intervals).forEach(clearInterval);

    intervals = {};

    

    // Remueve el gráfico si existe (Asumiendo que remove() es el método de TradingView/Chart.js)

    if (currentChart && typeof currentChart.remove === 'function') {

        currentChart.remove();

        currentChart = null;

    }

    

    // Llama a la función de inicialización de la vista, cargándola bajo demanda.

    if (views[tabName]) {

        try {

            // Ejecutar la función para obtener la Promesa de importación dinámica

            const modulePromise = views[tabName](); 

            

            // 🛑 AWAIT: Esperar la carga del módulo

            const module = await modulePromise; 

            

            // Llamar a la función de inicialización exportada del módulo

            const initFunctionName = 'initialize' + tabName.charAt(0).toUpperCase() + tabName.slice(1) + 'View';



            if (module[initFunctionName]) {

                await module[initFunctionName](); // Se usa await si la inicialización es asíncrona

            } else {

                console.error(`Función de inicialización ${initFunctionName} no encontrada en el módulo ${tabName}.js`);

            }

        } catch (error) {

            console.error(`Error al cargar el módulo ${tabName}:`, error);

        }

    }

}



/**

 * Función que actualiza el precio en la interfaz (global en el header/navbar).

 * @param {number} newPrice - El precio actual.

 */

function updatePriceDisplay(newPrice) {

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

}





/**

 * Función que inicializa la aplicación completa después de un login exitoso.

 */

export function initializeFullApp() {

    console.log("Token de autenticación encontrado. Inicializando la aplicación...");

    

    // 🛑 Inicializamos el estado a ROJO/Desconectado al iniciar la app.

    updateConnectionStatusBall('DISCONNECTED'); 



    // Conexión del socket (ÚNICA CONEXIÓN)

    // 🛑 Usamos la variable exportada 'socket'

    socket = io(BACKEND_URL, {

        path: '/socket.io'

    });



    // Añadir listener para la desconexión del socket

    socket.on('disconnect', () => {

        console.warn('Socket.IO desconectado. Forzando estado de conexión a rojo.');

        // Forzamos el estado a rojo si el socket se desconecta

        updateConnectionStatusBall('DISCONNECTED'); 

    });



    // 💡 NUEVO LISTENER CRÍTICO: Sincronización completa del estado del bot y el precio.

    socket.on('full-state-sync', (data) => {

        const newPrice = parseFloat(data.currentPrice);



        if (!isNaN(newPrice) && newPrice > 0) {

            // 1. Actualizar el precio global

            updatePriceDisplay(newPrice);

        }

        

        // 2. Aquí se puede retransmitir el botState a los módulos específicos (autobot/aibot)

        // Por ahora, solo nos aseguramos de que el precio global esté sincronizado.

    });



    // 🛑 ELIMINADO: Listener 'marketData'

    // 🛑 ELIMINADO: Listener 'bot-state-update' (Ahora se maneja en 'full-state-sync' o en el módulo específico)

    

    socket.on('bot-log', (log) => {

        const logMessageElement = document.getElementById('log-message');

        if (logMessageElement) {

            logMessageElement.textContent = log.message;

            logMessageElement.className = `log-message log-${log.type}`;

        }

    });



    // 💡 LISTENER GLOBAL PARA EL ESTADO DE CONEXIÓN (BOLITA) y BALANCE

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