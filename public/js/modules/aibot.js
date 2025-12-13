// public/js/modules/aibot.js

// 🚨 IMPORTACIONES CLAVE A MODIFICAR:
// 1. Elimina la importación de getBalances (se reemplaza por WebSocket).
// 2. Elimina la importación de checkBitMartConnectionAndData (se reemplaza por WebSocket en main.js).
// 3. ¡Importa el socket global!
import { initializeChart } from './chart.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab, updateOpenOrdersTable } from './orders.js'; 
import { loadBotConfigAndState, toggleBotState, resetBot } from './bot.js'; // Asumimos que estas funciones hacen llamadas HTTP
import { actualizarCalculosAibot } from './aicalculations.js';
import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, currentChart, intervals, socket } from '../main.js'; // <-- 🛑 ¡IMPORTANTE! Asegúrate de importar 'socket'

// Variable para el alcance del módulo
let currentTab = 'opened';
let aiOrderListElement = null; // Variable global para el contenedor de órdenes

/**
 * Función central para configurar los listeners de WebSocket para el AIBot.
 * Se llama solo si el socket está conectado.
 */
function setupAibotSocketListeners() {
    if (!socket) {
        console.error("El socket principal no está disponible. No se pueden recibir actualizaciones en tiempo real del AIBot.");
        return;
    }
    
    // 1. Listener para el estado y métricas del AIBot (desde dashboard.js vimos que existe 'aibot-metrics-update')
    socket.on('aibot-metrics-update', (metrics) => {
        console.log('[Socket.io] Métricas del AIBot en tiempo real recibidas.');
        // Aquí iría la lógica para actualizar el Profit, Balances Lógicos, y estados del bot 
        // en el contexto del AIBot. (Ejemplo: document.getElementById('aiprofit').textContent = metrics.unrealizedProfit.toFixed(2);)
    });
    
    // 2. Listener para órdenes abiertas (Compartido con Autobot, pero solo actualiza la vista activa)
    socket.on('open-orders-update', (ordersData) => {
        // Esta función updateOpenOrdersTable ya debería ser inteligente sobre qué vista está activa.
        // Si quieres que solo afecte al AIBot, debes refinar la lógica de 'updateOpenOrdersTable'.
        // Por ahora, asumimos que es una función genérica:
        updateOpenOrdersTable(ordersData); 
    });
    
    // 3. Otros listeners específicos de AIBot (ej. logs, cambios de configuración)
    // ...
}

// --- FUNCIÓN DE INICIALIZACIÓN (CORREGIDA Y OPTIMIZADA) ---
export async function initializeAibotView() {
    console.log("Inicializando vista del Aibot...");

    // 🛑 1. ELIMINAR POLLING (setInterval) y llamadas HTTP innecesarias
    // ❌ ELIMINAR: checkBitMartConnectionAndData(); 
    if (intervals.aibot) clearInterval(intervals.aibot); // Limpia el intervalo de balances
    if (intervals.orders) clearInterval(intervals.orders); // Limpia el intervalo de órdenes
    // 💡 El manejo de balances y conexión lo hará el socket global en main.js

    // 2. Cargar elementos del DOM (declaración única)
    const aistartBtn = document.getElementById('aistart-btn');
    const airesetBtn = document.getElementById('aireset-btn');
    const aiorderTabs = document.querySelectorAll('#aibot-section [id^="tab-"]');
    
    // Almacena la referencia del contenedor de órdenes
    aiOrderListElement = document.getElementById('ai-order-list'); 

    // 3. Cargar la configuración inicial de forma asíncrona
    // Usamos 'await' para asegurar que la configuración se cargue antes de configurar los inputs
    await loadBotConfigAndState();
    
    // 4. Inicializa el gráfico (puede ser bloqueante si es pesado, pero suele ser rápido)
    window.currentChart = initializeChart('ai-tvchart', TRADE_SYMBOL_TV);

    // 5. Configurar Listeners (Botones y Campos)
    if (aistartBtn) aistartBtn.addEventListener('click', toggleBotState);
    if (airesetBtn) airesetBtn.addEventListener('click', resetBot);
    
    // Lista de inputs para asignar listeners
    const inputIds = [
        'aiamount-usdt', 'aiamount-btc', 'aipurchase-usdt', 'aipurchase-btc', 
        'aiincrement', 'aidecrement', 'aitrigger'
    ];
    
    inputIds.forEach(id => {
        const input = document.getElementById(id);
        // Asignamos la función de cálculo/envío de configuración a todos los inputs
        if (input) input.addEventListener('input', actualizarCalculosAibot);
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

    // 7. Carga inicial de órdenes (Sin 'await' para no bloquear la carga)
    setOrdersActiveTab('tab-opened');
    if (aiOrderListElement) fetchOrders(currentTab, aiOrderListElement);

    // 8. Configurar los Listeners de WebSocket
    setupAibotSocketListeners();
    
    // 9. Ejecutar el cálculo inicial (después de cargar la configuración)
    actualizarCalculosAibot();
}