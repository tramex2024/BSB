// public/js/modules/autobot.js

// public/js/modules/autobot.js

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
 * Sincroniza la UI con los datos reales de MongoDB
 */
async function loadBotDataFromServer() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/autobot/config-and-state`, { 
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data && data.success) {
            updateMaxBalanceDisplay('USDT', parseFloat(data.lastAvailableUSDT) || 0);
            updateMaxBalanceDisplay('BTC', parseFloat(data.lastAvailableBTC) || 0);
            if (data.config) {
                const stopLongCb = document.getElementById('au-stop-long-at-cycle');
                const stopShortCb = document.getElementById('au-stop-short-at-cycle');
                if (stopLongCb) stopLongCb.checked = !!data.config.long?.stopAtCycle;
                if (stopShortCb) stopShortCb.checked = !!data.config.short?.stopAtCycle;
            }
            updateBotUI(data);
        }
    } catch (error) {
        console.error("Sync error:", error);
    }
}

function updateMaxBalanceDisplay(currency, balance) {
    if (currency === 'USDT') maxUsdtBalance = balance;
    if (currency === 'BTC') maxBtcBalance = balance;
    const displayElement = document.getElementById(`au-max-${currency.toLowerCase()}`); 
    if (displayElement) {
        const formattedBalance = balance.toLocaleString('en-US', {
            minimumFractionDigits: currency === 'USDT' ? 2 : 6,
            maximumFractionDigits: currency === 'USDT' ? 2 : 6
        });
        displayElement.textContent = `(Max: ${formattedBalance} ${currency})`;
    }
}

function validateAmountInput(inputId, maxLimit, currency) {
    const input = document.getElementById(inputId);
    if (!input) return true;
    const errorElement = document.getElementById(`au-error-${currency.toLowerCase()}`); 
    const value = parseFloat(input.value);
    const minBitmart = currency === 'USDT' ? MIN_USDT_AMOUNT : MIN_BTC_AMOUNT;
    
    let errorMsg = '';
    if (isNaN(value) || value <= 0) errorMsg = `Invalid amount.`;
    else if (value < minBitmart) errorMsg = `Min: ${minBitmart.toFixed(currency === 'USDT' ? 2 : 6)} ${currency}`;
    else if (maxLimit > 0 && value > maxLimit) errorMsg = `Insufficient balance.`;

    input.classList.toggle('border-red-500', !!errorMsg);
    if (errorElement) {
        errorElement.textContent = errorMsg;
        errorElement.style.display = errorMsg ? 'block' : 'none';
    }
    return !errorMsg;
}

function setupConfigListeners() {
    const configIds = [
        'auamount-usdt', 'auamount-btc', 'aupurchase-usdt', 
        'aupurchase-btc', 'auincrement', 'audecrement', 
        'autrigger', 'au-stop-long-at-cycle', 'au-stop-short-at-cycle'
    ];
    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
            if (id === 'auamount-usdt') validateAmountInput(id, maxUsdtBalance, 'USDT');
            if (id === 'auamount-btc') validateAmountInput(id, maxBtcBalance, 'BTC');
            sendConfigToBackend();
        });
    });
}

export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');

    await loadBotDataFromServer();
    setupConfigListeners();

    // Gráfico con Delay de seguridad
    setTimeout(() => {
        if (document.getElementById('au-tvchart')) {
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 400);

    // --- LÓGICA DE ACTIVACIÓN DEL BOTÓN (MODO BULLDOZER) ---
    const activateStartBtn = () => {
        const startBtn = document.getElementById('austart-btn');
        if (startBtn) {
            console.log("🚀 [UI] Botón Start Autobot localizado y vinculado.");
            const newBtn = startBtn.cloneNode(true);
            startBtn.parentNode.replaceChild(newBtn, startBtn);

            newBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                console.log("🔥 [EVENT] Click en Start detectado.");
                
                const isRunning = newBtn.textContent.includes('STOP');
                
                // Validación rápida: si falla el visual, igual intentamos ejecutar
                if (!isRunning) {
                    const isUsdtOk = validateAmountInput('auamount-usdt', maxUsdtBalance, 'USDT');
                    const isBtcOk = validateAmountInput('auamount-btc', maxBtcBalance, 'BTC');
                    if (!isUsdtOk || !isBtcOk) {
                        console.warn("⚠️ Validación incompleta, revisa balances.");
                        // Opcional: displayMessage('Check balances', 'warning');
                    }
                }
                
                try {
                    await toggleBotState(isRunning);
                    console.log("✅ [API] Señal de cambio de estado enviada.");
                } catch (err) {
                    console.error("❌ Error al cambiar estado:", err);
                }
            });
            return true;
        }
        return false;
    };

    // Reintento automático por si el HTML tarda en inyectarse
    if (!activateStartBtn()) {
        const retry = setInterval(() => {
            if (activateStartBtn()) clearInterval(retry);
        }, 200);
        setTimeout(() => clearInterval(retry), 4000);
    }

    // Pestañas de órdenes
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    orderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            orderTabs.forEach(t => t.classList.remove('text-emerald-500', 'bg-gray-800'));
            tab.classList.add('text-emerald-500', 'bg-gray-800');
            currentTab = tab.id.replace('tab-', '');
            fetchOrders(currentTab, auOrderList);
        });
    });

    fetchOrders('opened', auOrderList);

    // Gestión de Sockets (Limpieza de duplicados)
    if (socket) {
        socket.off('balance-real-update');
        socket.off('bot-state-update');
        socket.off('open-orders-update');

        socket.on('balance-real-update', (data) => {
            updateMaxBalanceDisplay('USDT', parseFloat(data.lastAvailableUSDT) || 0);
            updateMaxBalanceDisplay('BTC', parseFloat(data.lastAvailableBTC) || 0);
        });

        socket.on('bot-state-update', (state) => {
            updateBotUI(state); 
        });

        socket.on('open-orders-update', (data) => {
            if (currentTab === 'opened') updateOpenOrdersTable(data, 'au-order-list', currentTab);
        });
    }
}