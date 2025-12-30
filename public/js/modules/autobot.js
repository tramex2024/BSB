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
let currentTab = 'opened'; // Variable persistente en el módulo

/**
 * Actualiza el texto del balance total en la interfaz
 */
function updateMainBalanceDisplay(usdt, btc) {
    const totalBalanceEl = document.getElementById('aubalance');
    if (totalBalanceEl) {
        totalBalanceEl.innerHTML = `<span class="text-gray-400">USDT:</span> ${parseFloat(usdt || 0).toFixed(2)} | <span class="text-gray-400">BTC:</span> ${parseFloat(btc || 0).toFixed(6)}`;
    }
}

/**
 * Muestra el balance máximo permitido al lado de la etiqueta del input
 */
function updateMaxBalanceDisplay(currency, balance) {
    const displayElement = document.getElementById(`au-max-${currency.toLowerCase()}`); 
    if (displayElement) {
        displayElement.textContent = `(Max: ${balance.toFixed(currency === 'USDT' ? 2 : 6)} ${currency})`;
    }
}

/**
 * Valida si el monto ingresado es correcto antes de enviar al backend
 */
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
        input.classList.toggle('border-red-500', !!errorMsg);
    }
    return !errorMsg;
}

/**
 * Escucha cambios en los inputs para sincronizar con el backend
 */
function setupConfigListeners() {
    ['auamount-usdt', 'auamount-btc'].forEach(id => {
        const input = document.getElementById(id);
        const curr = id.includes('usdt') ? 'USDT' : 'BTC';
        input?.addEventListener('input', () => {
            const limit = curr === 'USDT' ? maxUsdtBalance : maxBtcBalance;
            if (validateAmountInput(id, limit, curr)) {
                sendConfigToBackend();
            }
        });
    });
    
    // Checkbox y otros inputs numéricos
    ['aupurchase-usdt', 'aupurchase-btc', 'auincrement', 'audecrement', 'autrigger', 'au-stop-at-cycle-end'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', sendConfigToBackend);
    });
}

/**
 * Carga inicial de balances para establecer los límites de los inputs
 */
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
    const auOrderList = document.getElementById('au-order-list');

    // 1. Cargar datos iniciales
    await loadBalancesAndLimits();
    setupConfigListeners();

    // 2. Inicialización del gráfico de TradingView
    try {
        window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
    } catch (e) { 
        console.error("Error al cargar TradingView:", e); 
    }

    // 3. Control del botón START/STOP
    const startBtn = document.getElementById('austart-btn');
    startBtn?.addEventListener('click', async () => {
        const isRunning = startBtn.textContent === 'STOP';
        
        // Solo validar si vamos a arrancar el bot
        if (!isRunning) {
            const isUsdtOk = validateAmountInput('auamount-usdt', maxUsdtBalance, 'USDT');
            const isBtcOk = validateAmountInput('auamount-btc', maxBtcBalance, 'BTC');
            if (!isUsdtOk || !isBtcOk) {
                return displayMessage('Revisa los límites de inversión', 'error');
            }
        }
        
        await toggleBotState(isRunning, getBotConfiguration());
    });

    // 4. Manejo de Pestañas del Historial de Órdenes
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    orderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Actualización visual de la pestaña
            orderTabs.forEach(t => t.classList.remove('active-tab'));
            tab.classList.add('active-tab');

            // Carga de datos
            currentTab = tab.id.replace('tab-', '');
            fetchOrders(currentTab, auOrderList);
        });
    });

    // 5. Carga inicial de órdenes por defecto (Opened)
    setOrdersActiveTab('tab-opened');
    fetchOrders('opened', auOrderList);

    // 6. Listeners de Socket para actualizaciones en tiempo real
    if (socket) {
    socket.on('bot-state-update', (state) => {
        // 1. Llamada normal a la UI general
        updateBotUI(state);

        // 2. FORZAR ACTUALIZACIÓN DE COBERTURA (El parche de tiempo real)
        const lCoverageEl = document.getElementById('lcoverage'); // Asegúrate que el ID sea este
        const lNorderEl = document.getElementById('lnorder');

        if (lCoverageEl && state.lcoverage !== undefined) {
            lCoverageEl.textContent = `$${parseFloat(state.lcoverage).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            
            // Efecto visual opcional: un pequeño destello cuando cambie
            lCoverageEl.classList.add('price-update-flash');
            setTimeout(() => lCoverageEl.classList.remove('price-update-flash'), 500);
        }

        if (lNorderEl && state.lnorder !== undefined) {
            lNorderEl.textContent = state.lnorder;
        }
    });
    }
}