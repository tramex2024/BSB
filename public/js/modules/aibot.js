// public/js/modules/aibot.js

// 🚨 IMPORTACIONES CLAVE
import { initializeChart } from './chart.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab, updateOpenOrdersTable } from './orders.js'; 
import { loadBotConfigAndState, toggleBotState, resetBot } from './bot.js'; // Asumimos que estas funciones hacen llamadas HTTP
import { actualizarCalculosAibot } from './aicalculations.js';
import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, currentChart, intervals, socket } from '../main.js'; 

// Variable para el alcance del módulo
let currentTab = 'opened';

// --- FUNCIÓN DE INICIALIZACIÓN (DESHABILITADA PARA TESTING) ---
export async function initializeAibotView() {
    console.log("Inicializando vista del Aibot...");

    // 🛑 1. ELIMINAR POLLING (setInterval) y llamadas HTTP innecesarias
    if (intervals.aibot) clearInterval(intervals.aibot); // Limpia el intervalo de balances
    if (intervals.orders) clearInterval(intervals.orders); // Limpia el intervalo de órdenes

    // 2. Cargar elementos del DOM (declaración única)
    const aistartBtn = document.getElementById('aistart-btn');
    const airesetBtn = document.getElementById('aireset-btn');
    const aiorderTabs = document.querySelectorAll('#aibot-section [id^="tab-"]');
    
    // Almacena la referencia del contenedor de órdenes
    const aiOrderListElement = document.getElementById('ai-order-list'); 

    // 🛑 3. Cargar la configuración inicial de forma asíncrona
    // ERROR 404: La llamada a este endpoint del backend /api/user/bot-config-and-state no existe o falla.
    // await loadBotConfigAndState(); // <--- COMENTADO PARA EVITAR EL ERROR 404

    // 4. Inicializa el gráfico
    window.currentChart = initializeChart('ai-tvchart', TRADE_SYMBOL_TV);

    // 5. Configurar Listeners (Botones y Campos)
    // También comentamos los listeners de los botones para evitar llamadas a funciones no implementadas (toggleBotState, resetBot)
    // if (aistartBtn) aistartBtn.addEventListener('click', toggleBotState); // <--- COMENTADO
    // if (airesetBtn) airesetBtn.addEventListener('click', resetBot); // <--- COMENTADO
    
    // Lista de inputs para asignar listeners
    const inputIds = [
        'aiamount-usdt', 'aiamount-btc', 'aipurchase-usdt', 'aipurchase-btc', 
        'aiincrement', 'aidecrement', 'aitrigger'
    ];
    
    inputIds.forEach(id => {
        const input = document.getElementById(id);
        // Asignamos la función de cálculo/envío de configuración a todos los inputs
        if (input) {
            // input.addEventListener('input', actualizarCalculosAibot); // <--- COMENTADO para evitar ReferenceError
        }
    });
    
    // 6. Configurar listeners de pestañas de órdenes
    aiorderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            // Cargar órdenes cuando el usuario cambia de pestaña
            if (aiOrderListElement) fetchOrders(currentTab, aiOrderListElement);
        });
    });

    // 7. Carga inicial de órdenes
    setOrdersActiveTab('tab-opened');
    if (aiOrderListElement) fetchOrders(currentTab, aiOrderListElement);

    // 8. Configurar los Listeners de WebSocket
    if (socket) {
        // Listener para el estado y métricas del AIBot
        socket.on('aibot-metrics-update', (metrics) => {
            // console.log('[Socket.io] Métricas del AIBot en tiempo real recibidas.'); // Log opcional
            // Lógica de actualización de UI aquí (Profit, Balances Lógicos, estados)
        });
        
        // Listener para Órdenes Abiertas
        socket.on('open-orders-update', (ordersData) => {
            // console.log(`[Socket.io] Recibidas órdenes abiertas/actualizadas para AIBot.`); // <--- COMENTADO: Log que quieres eliminar
            if (aiOrderListElement) {
                updateOpenOrdersTable(ordersData, 'ai-order-list', currentTab);
            }
        });
        
    } else {
        console.error("El socket principal no está disponible. No se pueden recibir actualizaciones en tiempo real del AIBot.");
    }
    
    // 🛑 9. Ejecutar el cálculo inicial
    // ERROR: ReferenceError: aiaipriceDropPercentage is not defined
    // actualizarCalculosAibot(); // <--- COMENTADO para evitar ReferenceError
}