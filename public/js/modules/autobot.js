import { initializeChart } from './chart.js';
import { fetchOrders, updateOpenOrdersTable } from './orders.js';
import { updateBotUI, displayMessage } from './uiManager.js';
import { getBotConfiguration, sendConfigToBackend, toggleBotState } from './apiService.js';
import { TRADE_SYMBOL_TV, BACKEND_URL, socket } from '../main.js';

const MIN_USDT_AMOUNT = 5.00;
const MIN_BTC_AMOUNT = 0.00005;
let maxUsdtBalance = 0;
let maxBtcBalance = 0;
let currentTab = 'opened';

/**
 * Actualiza los balances máximos en la UI (labels de los inputs)
 */
function updateMaxBalanceDisplay(currency, balance) {
    const displayElement = document.getElementById(`au-max-${currency.toLowerCase()}`); 
    if (displayElement) {
        displayElement.textContent = `(Max: ${balance.toFixed(currency === 'USDT' ? 2 : 6)} ${currency})`;
    }
}

/**
 * Validación visual y lógica de montos
 */
function validateAmountInput(inputId, maxLimit, currency) {
    const input = document.getElementById(inputId);
    const errorElement = document.getElementById(`au-error-${currency.toLowerCase()}`); 
    if (!input) return true;

    const value = parseFloat(input.value);
    const minBitmart = currency === 'USDT' ? MIN_USDT_AMOUNT : MIN_BTC_AMOUNT;
    
    let errorMsg = '';
    if (isNaN(value) || value <= 0) errorMsg = `Monto inválido.`;
    else if (value < minBitmart) errorMsg = `Min: ${minBitmart} ${currency}`;
    else if (value > maxLimit) errorMsg = `Saldo insuficiente.`;

    if (errorElement) {
        errorElement.textContent = errorMsg;
        errorElement.style.display = errorMsg ? 'block' : 'none';
        input.classList.toggle('border-red-500', !!errorMsg);
    }
    return !errorMsg;
}

/**
 * Listeners para guardar configuración automáticamente
 * Se incluyen todos los campos necesarios para la estrategia DCA
 */
function setupConfigListeners() {
    const configIds = [
        'auamount-usdt', 'auamount-btc', 'aupurchase-usdt', 
        'aupurchase-btc', 'auincrement', 'audecrement', 
        'autrigger', 'au-stop-at-cycle-end'
    ];

    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        const eventType = el.type === 'checkbox' ? 'change' : 'input';
        
        el.addEventListener(eventType, () => {
            // Validaciones específicas de saldo
            if (id === 'auamount-usdt') validateAmountInput(id, maxUsdtBalance, 'USDT');
            if (id === 'auamount-btc') validateAmountInput(id, maxBtcBalance, 'BTC');
            
            // Guardado automático en el backend
            sendConfigToBackend();
        });
    });
}

async function loadBalancesAndLimits() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/v1/bot-state/balances`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.success && data.data) {
            maxUsdtBalance = parseFloat(data.data.lastAvailableUSDT) || 0;
            maxBtcBalance = parseFloat(data.data.lastAvailableBTC) || 0;
            updateMaxBalanceDisplay('USDT', maxUsdtBalance);
            updateMaxBalanceDisplay('BTC', maxBtcBalance);
        }
    } catch (error) {
        console.error("Error cargando límites iniciales:", error);
    }
}

export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');

    // 1. Inicialización de datos y eventos
    await loadBalancesAndLimits();
    setupConfigListeners();

    // 2. Gráfico TradingView
    try {
        window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
    } catch (e) { console.error("Error al inicializar TV:", e); }

    // 3. Lógica del botón START / STOP
    const startBtn = document.getElementById('austart-btn');
    startBtn?.addEventListener('click', async () => {
        const isRunning = startBtn.textContent.includes('STOP');
        
        if (!isRunning) {
            // Validar antes de arrancar
            const isUsdtOk = validateAmountInput('auamount-usdt', maxUsdtBalance, 'USDT');
            const isBtcOk = validateAmountInput('auamount-btc', maxBtcBalance, 'BTC');
            if (!isUsdtOk || !isBtcOk) return displayMessage('Verifica los saldos configurados', 'error');
        }
        
        await toggleBotState(isRunning, getBotConfiguration());
    });

    // 4. Navegación de Pestañas (Historial)
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    orderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            orderTabs.forEach(t => {
                t.classList.remove('text-emerald-500', 'bg-gray-800');
                t.classList.add('text-gray-500');
            });
            tab.classList.add('text-emerald-500', 'bg-gray-800');
            tab.classList.remove('text-gray-500');

            currentTab = tab.id.replace('tab-', '');
            fetchOrders(currentTab, auOrderList);
        });
    });

    // 5. Carga inicial de órdenes (Abiertas por defecto)
    fetchOrders('opened', auOrderList);

    // 6. Configuración de Sockets (Tiempo Real)
    if (socket) {
        // Actualización de balances máximos permitidos
        socket.on('balance-real-update', (data) => {
            maxUsdtBalance = parseFloat(data.lastAvailableUSDT) || 0;
            maxBtcBalance = parseFloat(data.lastAvailableBTC) || 0;
            updateMaxBalanceDisplay('USDT', maxUsdtBalance);
            updateMaxBalanceDisplay('BTC', maxBtcBalance);
        });

        // Actualización integral de la UI (precios, ganancias, estados Long/Short)
        socket.on('bot-state-update', (state) => {
            updateBotUI(state); 
        });

        // Actualización de tabla de órdenes
        socket.on('open-orders-update', (data) => {
            // CORRECCIÓN CRÍTICA: Solo actualizamos vía socket si estamos en la pestaña 'opened'.
            // Si estamos en 'all', 'filled' o 'cancelled', dejamos que la API maneje la lista
            // para evitar que el socket "limpie" el historial.
            if (currentTab === 'opened') {
                updateOpenOrdersTable(data, 'au-order-list', currentTab);
            }
        });
    }
}