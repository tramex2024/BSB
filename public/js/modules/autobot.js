// public/js/modules/autobot.js
import { initializeChart } from './chart.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab, updateOpenOrdersTable } from './orders.js';
import { updateBotUI, displayMessage } from './uiManager.js';
import { getBotConfiguration, sendConfigToBackend, toggleBotState } from './apiService.js';
import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, currentChart, intervals, BACKEND_URL, socket } from '../main.js';

const MIN_USDT_AMOUNT = 5.00;
const MIN_BTC_AMOUNT = 0.00005;
let maxUsdtBalance = 0;
let maxBtcBalance = 0;

function updateMainBalanceDisplay(usdt, btc) {
    const usdtValue = parseFloat(usdt || 0).toFixed(2);
    const btcValue = parseFloat(btc || 0).toFixed(5);
    const formattedBalance = `USDT: ${usdtValue} | BTC: ${btcValue}`;
    const totalBalanceEl = document.getElementById('aubalance');
    if (totalBalanceEl) {
        totalBalanceEl.textContent = formattedBalance;
    }
}

function updateDynamicBotMetrics(botState) {
    const lcoverageEl = document.getElementById('au-lcoverage');
    const lcoverage = parseFloat(botState.lcoverage || 0);
    if (lcoverageEl) lcoverageEl.textContent = `$${lcoverage.toFixed(2)}`;

    const lnorderEl = document.getElementById('au-lnorder');
    const lnorder = parseInt(botState.lnorder || 0, 10);
    if (lnorderEl) lnorderEl.textContent = lnorder;
    
    const ppcEl = document.getElementById('au-ppc');
    const ppc = parseFloat(botState.lStateData?.ppc || 0);
    if (ppcEl) ppcEl.textContent = ppc > 0 ? `$${ppc.toFixed(2)}` : 'N/A';
}

function updateMaxBalanceDisplay(currency, balance) {
    const displayElement = document.getElementById(`au-max-${currency.toLowerCase()}`); 
    if (displayElement) {
        displayElement.textContent = `(Max: ${balance.toFixed(currency === 'USDT' ? 2 : 5)} ${currency})`;
    }
}

function validateAmountInput(inputId, maxLimit, currency) {
    const input = document.getElementById(inputId);
    const errorDisplayId = `au-error-${currency.toLowerCase()}`;
    const errorElement = document.getElementById(errorDisplayId); 
    
    if (!input) return true;
    const value = parseFloat(input.value);
    const minBitmart = currency === 'USDT' ? MIN_USDT_AMOUNT : MIN_BTC_AMOUNT;
    
    if (isNaN(value) || value <= 0) {
        if (errorElement) {
            errorElement.textContent = `El monto de ${currency} debe ser un número positivo.`;
            errorElement.style.display = 'block';
        }
        return false;
    }

    if (value < minBitmart) {
        if (errorElement) {
            errorElement.textContent = `Mínimo BitMart: ${minBitmart.toFixed(currency === 'USDT' ? 2 : 5)} ${currency}.`;
            errorElement.style.display = 'block';
        }
        return false;
    }

    if (value > maxLimit) {
        if (errorElement) {
            errorElement.textContent = `Excede el saldo disponible (${maxLimit.toFixed(currency === 'USDT' ? 2 : 5)} ${currency}).`;
            errorElement.style.display = 'block';
        }
        return false;
    }

    if (errorElement) errorElement.style.display = 'none';
    return true;
}

function setupConfigListeners() {
    const balanceInputIds = [
        { id: 'auamount-usdt', currency: 'USDT' },
        { id: 'auamount-btc', currency: 'BTC' },
    ];
    
    const otherConfigInputIds = [
        'aupurchase-usdt', 'aupurchase-btc', 'auincrement', 'audecrement', 
        'autrigger', 'au-stop-at-cycle-end'
    ];

    balanceInputIds.forEach(({ id, currency }) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                const isValid = validateAmountInput(id, currency === 'USDT' ? maxUsdtBalance : maxBtcBalance, currency);
                if (isValid) sendConfigToBackend();
            });
        }
    });
    
    otherConfigInputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.addEventListener('input', sendConfigToBackend);
    });
}

async function loadBalancesAndLimits() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BACKEND_URL}/api/v1/bot-state/balances`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch initial balances');
        
        const data = await response.json();
        if (data.success && data.data) {
            const dbData = data.data;
            maxUsdtBalance = parseFloat(dbData.lastAvailableUSDT) || 0;
            maxBtcBalance = parseFloat(dbData.lastAvailableBTC) || 0;
            
            updateMaxBalanceDisplay('USDT', maxUsdtBalance);
            updateMaxBalanceDisplay('BTC', maxBtcBalance);
            updateMainBalanceDisplay(maxUsdtBalance, maxBtcBalance);

            validateAmountInput('auamount-usdt', maxUsdtBalance, 'USDT');
            validateAmountInput('auamount-btc', maxBtcBalance, 'BTC');
        }
    } catch (error) {
        console.error("Error cargando balances iniciales:", error);
    }
}

// Inicialización de la vista (Esta función es llamada por main.js)
export async function initializeAutobotView() {
    await loadBalancesAndLimits();
    setupConfigListeners();
    
    if (socket) {
        socket.on('open-orders-update', (ordersData) => {
            updateOpenOrdersTable(ordersData, 'au-order-list', 'autobot');
        });
        
        socket.on('bot-state-update', (state) => {
            updateBotUI(state);
            updateDynamicBotMetrics(state);
        });
    }
}