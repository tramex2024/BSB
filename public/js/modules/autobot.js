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
 * Actualiza los balances máximos en la UI
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
            if (id === 'auamount-usdt') validateAmountInput(id, maxUsdtBalance, 'USDT');
            if (id === 'auamount-btc') validateAmountInput(id, maxBtcBalance, 'BTC');
            
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
        console.error("Error límites:", error);
    }
}

export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');

    await loadBalancesAndLimits();
    setupConfigListeners();

    // Gráfico
    try {
        window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
    } catch (e) { console.error("TV Error:", e); }

    // START / STOP Logic
    const startBtn = document.getElementById('austart-btn');
    startBtn?.addEventListener('click', async () => {
        const isRunning = startBtn.textContent.includes('STOP');
        
        if (!isRunning) {
            const isUsdtOk = validateAmountInput('auamount-usdt', maxUsdtBalance, 'USDT');
            const isBtcOk = validateAmountInput('auamount-btc', maxBtcBalance, 'BTC');
            if (!isUsdtOk || !isBtcOk) return displayMessage('Verifica saldos', 'error');
        }
        
        await toggleBotState(isRunning, getBotConfiguration());
    });

    // Manejo de Pestañas
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

    // Carga inicial
    fetchOrders('opened', auOrderList);

    // Socket Listeners
    if (socket) {
        socket.on('balance-real-update', (data) => {
            maxUsdtBalance = parseFloat(data.lastAvailableUSDT) || 0;
            maxBtcBalance = parseFloat(data.lastAvailableBTC) || 0;
            updateMaxBalanceDisplay('USDT', maxUsdtBalance);
            updateMaxBalanceDisplay('BTC', maxBtcBalance);
        });

        socket.on('bot-state-update', (state) => {
            // delegamos la actualización masiva al uiManager para evitar saltos visuales
            updateBotUI(state); 
        });

        socket.on('open-orders-update', (data) => {
            if (currentTab === 'opened' || currentTab === 'all') {
                updateOpenOrdersTable(data, 'au-order-list', currentTab);
            }
        });
    }
}