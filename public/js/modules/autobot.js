import { initializeChart } from './chart.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './orders.js';
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
 */
function setupConfigListeners() {
    // Inputs que disparan guardado inmediato al cambiar
    const configIds = [
        'auamount-usdt', 'auamount-btc', 'aupurchase-usdt', 
        'aupurchase-btc', 'auincrement', 'audecrement', 
        'autrigger', 'au-stop-at-cycle-end'
    ];

    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        const eventType = el.type === 'checkbox' || el.type === 'number' ? 'change' : 'input';
        
        el.addEventListener(eventType, () => {
            // Si es un monto principal, validamos antes de enviar
            if (id === 'auamount-usdt') validateAmountInput(id, maxUsdtBalance, 'USDT');
            if (id === 'auamount-btc') validateAmountInput(id, maxBtcBalance, 'BTC');
            
            sendConfigToBackend();
        });
    });
}

/**
 * Carga de balances desde el API para límites
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
        }
    } catch (error) {
        console.error("Error límites:", error);
    }
}

export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');

    // 1. Cargar datos base
    await loadBalancesAndLimits();
    setupConfigListeners();

    // 2. Gráfico TradingView
    try {
        window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
    } catch (e) { console.error("TV Error:", e); }

    // 3. START / STOP Logic
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

    // 4. Manejo de Pestañas (Historial de Órdenes)
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

    // 5. Estado Inicial de Órdenes
    fetchOrders('opened', auOrderList);

    // 6. Socket Listeners (Actualizaciones de tiempo real)
    if (socket) {
        // Actualización de balances reales (vía socket)
        socket.on('balance-real-update', (data) => {
            maxUsdtBalance = parseFloat(data.lastAvailableUSDT) || 0;
            maxBtcBalance = parseFloat(data.lastAvailableBTC) || 0;
            updateMaxBalanceDisplay('USDT', maxUsdtBalance);
            updateMaxBalanceDisplay('BTC', maxBtcBalance);
        });

        // Actualización integral de la estrategia
        socket.on('bot-state-update', (state) => {
            updateBotUI(state); // Maneja el botón START/STOP y Profit Total

            const fields = {
                'aubalance-usdt': state.lastAvailableUSDT?.toFixed(2),
                'aubalance-btc': state.lastAvailableBTC?.toFixed(6),
                'aulbalance': state.lbalance?.toFixed(2),
                'aulcycle': state.lcycle,
                'aulsprice': state.lsprice?.toFixed(2),
                'aulprofit': state.lprofit?.toFixed(4),
                'aulcoverage': state.lcoverage?.toFixed(2),
                'aulnorder': state.lnorder,
                'ausbalance': state.sbalance?.toFixed(2),
                'auscycle': state.scycle,
                'ausbprice': state.sbprice?.toFixed(2),
                'ausprofit': state.sprofit?.toFixed(4),
                'auscoverage': state.scoverage?.toFixed(2),
                'ausnorder': state.snorder
            };

            Object.entries(fields).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) {
                    el.textContent = value ?? '0.00';
                    if (id.includes('profit')) {
                        el.className = parseFloat(value) >= 0 ? 'text-emerald-400' : 'text-red-400';
                    }
                }
            });

            // Actualizar etiquetas de estado Long/Short
            const lStateEl = document.getElementById('aubot-lstate');
            const sStateEl = document.getElementById('aubot-sstate');
            if (lStateEl) {
                lStateEl.textContent = state.lstate;
                lStateEl.className = `text-xs font-bold ${state.lstate === 'STOPPED' ? 'text-red-400' : 'text-emerald-400'}`;
            }
            if (sStateEl) {
                sStateEl.textContent = state.sstate;
                sStateEl.className = `text-xs font-bold ${state.sstate === 'STOPPED' ? 'text-red-400' : 'text-emerald-400'}`;
            }
        });
    }
}