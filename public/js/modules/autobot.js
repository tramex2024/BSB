// public/js/modules/autobot.js

import { BACKEND_URL } from '../main.js';
import { initializeChart } from './chart.js';

// Mapa de elementos del DOM que necesitan ser actualizados
const elementsToUpdate = {
    profit: 'auprofit',
    lstate: 'aubot-lstate',
    sstate: 'aubot-sstate',
    lbalance: 'aulbalance',
    sbalance: 'ausbalance',
    ltprice: 'aultprice',
    stprice: 'austprice',
    lcycle: 'aulcycle',
    scycle: 'auscycle',
    lcoverage: 'aulcoverage',
    scoverage: 'auscoverage',
    lnorder: 'aulnorder',
    snorder: 'ausnorder',
};

// IDs de los campos de configuración
const configInputIds = [
    'auamount-usdt',
    'auamount-btc',
    'aupurchase-usdt',
    'aupurchase-btc',
    'auincrement',
    'audecrement',
    'autrigger',
    'au-stop-at-cycle-end',
];

let allOrders = [];

/**
 * Recopila todos los datos de los campos de configuración.
 * @returns {object} Un objeto con la configuración del bot.
 */
function getBotConfiguration() {
    const config = {
        long: {
            purchaseUsdt: parseFloat(document.getElementById('aupurchase-usdt').value),
            price_var: parseFloat(document.getElementById('audecrement').value),
            size_var: parseFloat(document.getElementById('auincrement').value),
            trigger: parseFloat(document.getElementById('autrigger').value),
        },
        short: {
            sellBtc: parseFloat(document.getElementById('aupurchase-btc').value),
            price_var: parseFloat(document.getElementById('audecrement').value),
            size_var: parseFloat(document.getElementById('auincrement').value),
            trigger: parseFloat(document.getElementById('autrigger').value),
        },
        options: {
            stopAtCycleEnd: document.getElementById('au-stop-at-cycle-end').checked,
        },
    };
    return config;
}

/**
 * Actualiza la UI con los datos del estado del bot.
 * @param {object} botState - El estado del bot recibido del backend.
 */
function updateBotUI(botState) {
    // Actualiza los elementos del DOM basados en el estado del bot
    for (const key in elementsToUpdate) {
        if (elementsToUpdate.hasOwnProperty(key)) {
            const el = document.getElementById(elementsToUpdate[key]);
            if (el && botState[key] !== undefined) {
                el.textContent = botState[key].toFixed ? botState[key].toFixed(2) : botState[key];
            }
        }
    }
    
    // Maneja el estado de los botones y la conexión
    const startBtn = document.getElementById('austart-btn');
    const resetBtn = document.getElementById('aureset-btn');
    const statusDot = document.getElementById('status-dot');

    const isRunning = botState.lstate === 'RUNNING' || botState.sstate === 'RUNNING';

    startBtn.textContent = isRunning ? 'STOP' : 'START';
    startBtn.classList.toggle('bg-green-600', !isRunning);
    startBtn.classList.toggle('bg-red-600', isRunning);

    resetBtn.disabled = isRunning;
    statusDot.classList.toggle('bg-green-500', isRunning);
    statusDot.classList.toggle('bg-red-500', !isRunning);

    // Deshabilita/Habilita los campos de configuración
    configInputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.disabled = isRunning;
        }
    });
}

/**
 * Envía la configuración del bot al backend en tiempo real.
 */
async function sendConfigToBackend() {
    const config = getBotConfiguration();
    try {
        const response = await fetch(`${BACKEND_URL}/api/autobot/update-config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ config }),
        });
        if (!response.ok) {
            console.error('Failed to update config on backend');
        }
    } catch (error) {
        console.error('Error sending config to backend:', error);
    }
}

/**
 * Configura los event listeners para los campos de configuración.
 */
function setupConfigListeners() {
    configInputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                sendConfigToBackend();
            });
        }
    });
}

/**
 * Renderiza la lista de órdenes en el DOM.
 * @param {Array} orders - La lista de órdenes a mostrar.
 */
function renderOrders(orders) {
    const orderListEl = document.getElementById('au-order-list');
    orderListEl.innerHTML = ''; // Limpia el contenido actual

    if (orders.length === 0) {
        orderListEl.innerHTML = '<p class="text-gray-400">No hay órdenes para mostrar.</p>';
        return;
    }

    orders.forEach(order => {
        const orderEl = document.createElement('div');
        orderEl.className = 'flex justify-between items-center text-xs p-2 rounded bg-gray-700';
        const orderSideClass = order.side === 'buy' ? 'text-green-400' : 'text-red-400';
        
        orderEl.innerHTML = `
            <div class="flex-1">${order.symbol}</div>
            <div class="flex-1 ${orderSideClass}">${order.side.toUpperCase()}</div>
            <div class="flex-1">${order.order_amount}</div>
            <div class="flex-1">${order.price}</div>
            <div class="flex-1">${new Date(order.create_time).toLocaleTimeString()}</div>
        `;
        orderListEl.appendChild(orderEl);
    });
}

/**
 * Filtra las órdenes basándose en el estado y las renderiza.
 * @param {string} filter - El filtro ('opened', 'filled', 'cancelled', 'all').
 */
function filterAndRenderOrders(filter) {
    let filteredOrders = [];
    if (filter === 'all') {
        filteredOrders = allOrders;
    } else if (filter === 'opened') {
        filteredOrders = allOrders.filter(order => order.status === 'open');
    } else if (filter === 'filled') {
        filteredOrders = allOrders.filter(order => order.status === 'filled');
    } else if (filter === 'cancelled') {
        filteredOrders = allOrders.filter(order => order.status === 'cancelled');
    }
    renderOrders(filteredOrders);
}

/**
 * Configura los listeners para las pestañas de órdenes.
 */
function setupOrderTabs() {
    const tabs = document.querySelectorAll('.autobot-tabs button');
    tabs.forEach(tab => {
        tab.addEventListener('click', (event) => {
            tabs.forEach(t => t.classList.remove('border-green-500'));
            event.target.classList.add('border-green-500');
            const filter = event.target.id.replace('tab-', '');
            filterAndRenderOrders(filter);
        });
    });
}

/**
 * Obtiene las órdenes del backend y las guarda.
 */
async function fetchOrders() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/bitmart-data`);
        const data = await response.json();
        
        if (data.success === false) {
            console.error('Error al obtener datos de BitMart:', data.message);
            const orderListEl = document.getElementById('au-order-list');
            orderListEl.innerHTML = '<p class="text-red-400">Error: No se pudieron cargar las órdenes. <br>Revisa tus claves API.</p>';
            return;
        }

        // Combina órdenes abiertas y del historial
        const openOrders = data.openOrders.map(order => ({ ...order, status: 'open' }));
        const historyOrders = data.historyOrders.map(order => {
            let status = 'filled'; // Asumimos 'filled' por defecto
            if (order.state === '9' || order.state === '4') { // Ejemplo de BitMart, puede variar
                status = 'cancelled';
            }
            return { ...order, status: status };
        });

        allOrders = [...openOrders, ...historyOrders];
        renderOrders(allOrders); // Renderiza todas las órdenes por defecto

    } catch (error) {
        console.error('Error al obtener las órdenes del backend:', error);
        const orderListEl = document.getElementById('au-order-list');
        orderListEl.innerHTML = '<p class="text-red-400">Error de conexión. No se pudieron cargar las órdenes.</p>';
    }
}

/**
 * Inicializa la vista del Autobot y configura los listeners.
 */
export function initializeAutobotView() {
    const chartContainer = document.getElementById('au-tvchart');
    if (chartContainer) {
        initializeChart('au-tvchart', 'BTCUSDT');
    }

    // Configura los listeners para los inputs
    setupConfigListeners();

    // Configura el listener del botón START/STOP
    const startBtn = document.getElementById('austart-btn');
    startBtn.onclick = async () => {
        const isRunning = startBtn.textContent === 'STOP';
        const endpoint = isRunning ? '/api/autobot/stop' : '/api/autobot/start';
        
        const body = isRunning ? {} : getBotConfiguration();
        
        try {
            const response = await fetch(`${BACKEND_URL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            if (!data.success) {
                console.error(`Error al ${isRunning ? 'detener' : 'iniciar'} el bot:`, data.message);
            }
        } catch (error) {
            console.error(`Error de red al ${isRunning ? 'detener' : 'iniciar'} el bot:`, error);
        }
    };

    // Configura el listener de Socket.IO para el estado del bot
    const socket = io(BACKEND_URL, {
        path: '/socket.io'
    });
    socket.on('bot-state-update', (data) => {
        updateBotUI(data);
    });

    // Envía la configuración inicial al cargar la página
    sendConfigToBackend();

    // Llama a las funciones para manejar las órdenes
    setupOrderTabs();
    fetchOrders();
}