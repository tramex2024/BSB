// public/js/modules/autobot.js
import { initializeChart } from './chart.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab, updateOpenOrdersTable } from './orders.js';
import { updateBotUI, displayMessage } from './uiManager.js';
import { getBotConfiguration, sendConfigToBackend, toggleBotState } from './apiService.js';
import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, BACKEND_URL, socket } from '../main.js';

const MIN_USDT_AMOUNT = 5.00;
const MIN_BTC_AMOUNT = 0.00005;
let maxUsdtBalance = 0;
let maxBtcBalance = 0;

function updateMainBalanceDisplay(usdt, btc) {
    const totalBalanceEl = document.getElementById('aubalance');
    if (totalBalanceEl) {
        totalBalanceEl.textContent = `USDT: ${parseFloat(usdt || 0).toFixed(2)} | BTC: ${parseFloat(btc || 0).toFixed(5)}`;
    }
}

function updateMaxBalanceDisplay(currency, balance) {
    const displayElement = document.getElementById(`au-max-${currency.toLowerCase()}`); 
    if (displayElement) displayElement.textContent = `(Max: ${balance.toFixed(currency === 'USDT' ? 2 : 5)} ${currency})`;
}

function validateAmountInput(inputId, maxLimit, currency) {
    const input = document.getElementById(inputId);
    const errorElement = document.getElementById(`au-error-${currency.toLowerCase()}`); 
    if (!input) return true;

    const value = parseFloat(input.value);
    const minBitmart = currency === 'USDT' ? MIN_USDT_AMOUNT : MIN_BTC_AMOUNT;
    
    let errorMsg = '';
    if (isNaN(value) || value <= 0) errorMsg = `Monto de ${currency} inválido.`;
    else if (value < minBitmart) errorMsg = `Mínimo BitMart: ${minBitmart} ${currency}.`;
    else if (value > maxLimit) errorMsg = `Excede saldo disponible.`;

    if (errorElement) {
        errorElement.textContent = errorMsg;
        errorElement.style.display = errorMsg ? 'block' : 'none';
    }
    return !errorMsg;
}

function setupConfigListeners() {
    ['auamount-usdt', 'auamount-btc'].forEach(id => {
        const input = document.getElementById(id);
        const curr = id.includes('usdt') ? 'USDT' : 'BTC';
        input?.addEventListener('input', () => {
            if (validateAmountInput(id, curr === 'USDT' ? maxUsdtBalance : maxBtcBalance, curr)) sendConfigToBackend();
        });
    });
    
    ['aupurchase-usdt', 'aupurchase-btc', 'auincrement', 'audecrement', 'autrigger', 'au-stop-at-cycle-end'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', sendConfigToBackend);
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
            updateMainBalanceDisplay(maxUsdtBalance, maxBtcBalance);
        }
    } catch (error) {
        console.error("Error cargando límites:", error);
    }
}

export async function initializeAutobotView() {
    let currentTab = 'opened';
    const auOrderList = document.getElementById('au-order-list');

    await loadBalancesAndLimits();
    setupConfigListeners();

    // --- INICIALIZACIÓN DEL GRÁFICO ---
    try {
        // Importante: No reasignar currentChart localmente, usar la del main si es necesario o manejarla aquí
        window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
    } catch (e) { console.error("Error en gráfico:", e); }

    // Botón START/STOP
    document.getElementById('austart-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('austart-btn');
        const isRunning = btn.textContent === 'STOP';
        if (!isRunning && (!validateAmountInput('auamount-usdt', maxUsdtBalance, 'USDT') || !validateAmountInput('auamount-btc', maxBtcBalance, 'BTC'))) {
            return displayMessage('Fondos insuficientes', 'error');
        }
        await toggleBotState(isRunning, getBotConfiguration());
    });

    // Pestañas de Órdenes
    document.querySelectorAll('#autobot-section [id^="tab-"]').forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            fetchOrders(currentTab, auOrderList);
        });
    });

    // Carga inicial de órdenes
    setOrdersActiveTab('tab-opened');
    fetchOrders('opened', auOrderList);

    if (socket) {
        socket.on('bot-state-update', (state) => updateBotUI(state));
        socket.on('balance-update', (balances) => {
            maxUsdtBalance = balances.lastAvailableUSDT;
            maxBtcBalance = balances.lastAvailableBTC;
            updateMaxBalanceDisplay('USDT', maxUsdtBalance);
            updateMaxBalanceDisplay('BTC', maxBtcBalance);
            updateMainBalanceDisplay(maxUsdtBalance, maxBtcBalance);
        });
        socket.on('open-orders-update', (ordersData) => {
            updateOpenOrdersTable(ordersData, 'au-order-list', currentTab);
        });
    }
}