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

        if (!response.ok) throw new Error("Ruta no encontrada");

        const data = await response.json();

        if (data && data.success) {
            // 1. Sincronizar balances
            updateMaxBalanceDisplay('USDT', parseFloat(data.lastAvailableUSDT) || 0);
            updateMaxBalanceDisplay('BTC', parseFloat(data.lastAvailableBTC) || 0);

            // 2. Sincronizar Checkbox "Stop at cycle end"
            if (data.config) {
                const stopAtCycleCheckbox = document.getElementById('au-stop-at-cycle-end');
                if (stopAtCycleCheckbox) {
                    // Sincronizamos con el valor REAL de MongoDB
                    stopAtCycleCheckbox.checked = !!data.config.stopAtCycle;
                    console.log("Checkbox sincronizado desde DB:", stopAtCycleCheckbox.checked);
                }
            }
            
            // 3. Actualizar UI del botón (START/STOP)
            updateBotUI(data);
        }
    } catch (error) {
        console.error("Error en sincronización:", error);
    }
}

/**
 * Actualiza los balances máximos en la UI y las variables de validación
 */
function updateMaxBalanceDisplay(currency, balance) {
    if (currency === 'USDT') maxUsdtBalance = balance;
    if (currency === 'BTC') maxBtcBalance = balance;

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
            
            // Guardado automático al cambiar cualquier valor
            sendConfigToBackend();
        });
    });
}

export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');

    // CARGA INICIAL: Trae balances y estado del checkbox desde MongoDB
    await loadBotDataFromServer();
    
    setupConfigListeners();

    // Gráfico con delay para renderizado correcto
    setTimeout(() => {
        try {
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        } catch (e) { console.error("Error al inicializar TV:", e); }
    }, 200);

    // Botón START / STOP
    const startBtn = document.getElementById('austart-btn');
    startBtn?.addEventListener('click', async () => {
        const isCurrentlyRunning = startBtn.textContent.includes('STOP');
        
        if (!isCurrentlyRunning) {
            const isUsdtOk = validateAmountInput('auamount-usdt', maxUsdtBalance, 'USDT');
            const isBtcOk = validateAmountInput('auamount-btc', maxBtcBalance, 'BTC');
            
            if (!isUsdtOk || !isBtcOk) {
                return displayMessage('Verifica los saldos configurados antes de iniciar', 'error');
            }
        }
        
        // toggleBotState usará getBotConfiguration() internamente
        await toggleBotState(isCurrentlyRunning); 
    });

    // Pestañas de órdenes
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

    fetchOrders('opened', auOrderList);

    // Sockets específicos de la vista para actualizaciones en tiempo real
    if (socket) {
        socket.on('balance-real-update', (data) => {
            updateMaxBalanceDisplay('USDT', parseFloat(data.lastAvailableUSDT) || 0);
            updateMaxBalanceDisplay('BTC', parseFloat(data.lastAvailableBTC) || 0);
        });

        socket.on('bot-state-update', (state) => {
            updateBotUI(state); 
        });

        socket.on('open-orders-update', (data) => {
            if (currentTab === 'opened') {
                updateOpenOrdersTable(data, 'au-order-list', currentTab);
            }
        });
    }
}