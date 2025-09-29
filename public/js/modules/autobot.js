// public/js/modules/autobot.js (VERSIÓN FINAL CON VALIDACIÓN DE FONDOS)

import { getBalances, fetchAvailableBalancesForValidation } from './balance.js'; // Importamos la nueva función
import { initializeChart } from './chart.js';
import { checkBitMartConnectionAndData } from './network.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './orders.js';
import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, currentChart, intervals } from '../main.js';
import { updateBotUI, displayMessage } from './uiManager.js';
import { getBotConfiguration, sendConfigToBackend, toggleBotState } from './apiService.js';

const SOCKET_SERVER_URL = 'https://bsb-ppex.onrender.com';

// NUEVAS VARIABLES GLOBALES PARA LOS LÍMITES REALES
let maxUsdtBalance = 0;
let maxBtcBalance = 0;

/**
 * Muestra el límite real disponible junto a los inputs.
 */
function updateMaxBalanceDisplay(currency, balance) {
    const displayElement = document.getElementById(`au-max-${currency.toLowerCase()}`); 
    if (displayElement) {
        displayElement.textContent = `(Max: ${balance.toFixed(currency === 'USDT' ? 2 : 5)} ${currency})`;
    }
}

/**
 * Valida un input de monto contra el saldo real disponible.
 * Muestra un mensaje de advertencia si excede el límite.
 * @param {string} inputId - ID del campo de input ('auamount-usdt' o 'auamount-btc').
 * @param {number} maxLimit - El límite máximo (maxUsdtBalance o maxBtcBalance).
 * @param {string} currency - 'USDT' o 'BTC'.
 * @returns {boolean} True si es válido (o si la validación es ignorada), False si excede el límite.
 */
function validateAmountInput(inputId, maxLimit, currency) {
    const input = document.getElementById(inputId);
    const errorDisplayId = `au-error-${currency.toLowerCase()}`; // ID del nuevo elemento de error
    const errorElement = document.getElementById(errorDisplayId); 
    
    if (!input) return true;

    const value = parseFloat(input.value);

    // Permitimos valores vacíos, nulos o ceros si el bot está detenido o la lógica lo permite. 
    if (isNaN(value) || value <= 0) {
        if (errorElement) errorElement.style.display = 'none';
        // No bloqueamos, dejamos que el backend decida si es una configuración válida.
        return true; 
    }

    if (value > maxLimit) {
        const msg = `¡Advertencia! El monto excede el saldo real disponible (${maxLimit.toFixed(currency === 'USDT' ? 2 : 5)} ${currency}).`;
        if (errorElement) {
            errorElement.textContent = msg;
            errorElement.style.display = 'block';
        }
        return false; // Bloqueamos el envío de la configuración
    }

    if (errorElement) errorElement.style.display = 'none';
    return true;
}


/**
 * Configura los event listeners para los campos de configuración.
 */
function setupConfigListeners() {
    // Campos que requieren validación de balance real
    const balanceInputIds = [
        { id: 'auamount-usdt', currency: 'USDT' },
        { id: 'auamount-btc', currency: 'BTC' },
    ];
    
    // Campos generales
    const otherConfigInputIds = [
        'aupurchase-usdt', 'aupurchase-btc', 'auincrement', 'audecrement', 
        'autrigger', 'au-stop-at-cycle-end'
    ];

    // 1. Listeners para Campos de Balance
    balanceInputIds.forEach(({ id, currency }) => {
        const input = document.getElementById(id);
        if (input) {
            // Validación y envío al teclear
            input.addEventListener('input', () => {
                // Antes de enviar, validamos
                const isValid = validateAmountInput(id, currency === 'USDT' ? maxUsdtBalance : maxBtcBalance, currency);
                if (isValid) {
                    // Solo enviamos si pasa la validación de límites.
                    sendConfigToBackend();
                } 
                // Si NO es válido (retorna false), no se envía la configuración, y el error de UX se muestra.
            });
        }
    });
    
    // 2. Listeners para otros campos (solo envío)
    otherConfigInputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', sendConfigToBackend);
        }
    });
}

// --- FUNCIÓN DE INICIALIZACIÓN ---
export async function initializeAutobotView() {
    console.log("Inicializando vista del Autobot...");
    
    // 1. Obtener y establecer los límites de balance
    const balances = await fetchAvailableBalancesForValidation();
    maxUsdtBalance = balances.availableUSDT;
    maxBtcBalance = balances.availableBTC;
    
    // 2. Actualizar la interfaz de usuario con los límites (UX)
    updateMaxBalanceDisplay('USDT', maxUsdtBalance);
    updateMaxBalanceDisplay('BTC', maxBtcBalance);
    
    // Opcional: Establecer el atributo 'max' en los inputs para validación nativa del navegador
    document.getElementById('auamount-usdt')?.setAttribute('max', maxUsdtBalance.toFixed(2));
    document.getElementById('auamount-btc')?.setAttribute('max', maxBtcBalance.toFixed(5));

    setupConfigListeners();

    let currentTab = 'opened';
    
    const austartBtn = document.getElementById('austart-btn');
    const auresetBtn = document.getElementById('aureset-btn');
    const auorderTabs = document.querySelectorAll('#autobot-section [id^="tab-"]');
    
    checkBitMartConnectionAndData();
    window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);

    // Lógica para el botón START/STOP
    if (austartBtn) {
        austartBtn.addEventListener('click', async () => {
            const isRunning = austartBtn.textContent === 'STOP';
            
            // Re-validación estricta antes de iniciar
            const usdtValid = validateAmountInput('auamount-usdt', maxUsdtBalance, 'USDT');
            const btcValid = validateAmountInput('auamount-btc', maxBtcBalance, 'BTC');

            if (!isRunning && (!usdtValid || !btcValid)) {
                displayMessage('No se puede iniciar. Los montos asignados exceden los fondos disponibles.', 'error');
                return; 
            }
            
            const config = getBotConfiguration();
            await toggleBotState(isRunning, config);
        });
    }

    if (auresetBtn) {
        auresetBtn.addEventListener('click', () => {
            // Lógica para el botón reset
        });
    }
    
    auorderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            const auOrderList = document.getElementById('au-order-list');
            fetchOrders(currentTab, auOrderList);
        });
    });

    setOrdersActiveTab('tab-opened');
    const auOrderList = document.getElementById('au-order-list');
    fetchOrders(currentTab, auOrderList);
    
    const socket = io(SOCKET_SERVER_URL);
    
    socket.on('bot-state-update', (state) => {
        updateBotUI(state);
    });

    getBalances();
    intervals.autobot = setInterval(getBalances, 10000);
    intervals.orders = setInterval(() => {
        const auOrderList = document.getElementById('au-order-list');
        if (auOrderList) {
            fetchOrders(currentTab, auOrderList);
        }
    }, 15000);
}