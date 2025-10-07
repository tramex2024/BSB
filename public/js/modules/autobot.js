// public/js/modules/autobot.js (VERSIÓN CON MAPEO DE ESTRUCTURA FINAL)

import { getBalances, fetchAvailableBalancesForValidation } from './balance.js'; 
import { initializeChart } from './chart.js';
import { checkBitMartConnectionAndData } from './network.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './orders.js';
import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, currentChart, intervals } from '../main.js';
import { updateBotUI, displayMessage } from './uiManager.js';
import { getBotConfiguration, sendConfigToBackend, toggleBotState } from './apiService.js';

const SOCKET_SERVER_URL = 'https://bsb-ppex.onrender.com';

const MIN_USDT_AMOUNT = 5.00;
const MIN_BTC_AMOUNT = 0.00000;

let maxUsdtBalance = 0;
let maxBtcBalance = 0;

/**
 * Recolecta todos los valores de configuración de la interfaz y los mapea a la estructura anidada del backend.
 * Utiliza los nombres exactos de la DB: size_var (Incremento) y price_var (Decremento).
 * @returns {object} El objeto de configuración listo para ser enviado.
 */
function collectConfigData() {
    // Helper para obtener y parsear un valor float
    const getFloat = id => parseFloat(document.getElementById(id)?.value || 0) || 0;
    // Helper para obtener un valor booleano
    const getBool = id => document.getElementById(id)?.checked || false;
    
    // --- CAMPOS COMUNES ---
    // auincrement (Incremento de Tamaño) -> size_var
    const sizeVariation = getFloat('auincrement'); 
    // audecrement (Decremento de Precio) -> price_var
    const priceVariation = getFloat('audecrement'); 
    // autrigger (Trigger de Ganancia) -> profit_percent
    const profitTrigger = getFloat('autrigger');    
    // au-stop-at-cycle-end -> stopAtCycle (Nivel superior)
    const stopAtCycle = getBool('au-stop-at-cycle-end'); 

    return {
        // PROPIEDADES GENERALES
        symbol: TRADE_SYMBOL_BITMART, 
        stopAtCycle: stopAtCycle, // 💡 CAMPO EN EL NIVEL SUPERIOR
        
        // ESTRATEGIA LONG
        long: {
            amountUsdt: getFloat('auamount-usdt'), 
            purchaseUsdt: getFloat('aupurchase-usdt'), 
            
            // Mapeo a DB
            profit_percent: profitTrigger, 
            price_var: priceVariation, // El Decremento (Precio) se mapea a price_var
            size_var: sizeVariation,   // El Incremento (Tamaño) se mapea a size_var
            
            enabled: true // Se asume que siempre se envía true al modificar la config
        },
        
        // ESTRATEGIA SHORT
        short: {
            amountBtc: getFloat('auamount-btc'), 
            sellBtc: getFloat('aupurchase-btc'), // 'Purchase BTC' es 'sellBtc'
            
            // Mapeo a DB
            profit_percent: profitTrigger, 
            price_var: priceVariation, 
            size_var: sizeVariation,
            
            enabled: true
        }
    };
}


/**
 * Muestra el límite real disponible junto a los inputs.
 */
function updateMaxBalanceDisplay(currency, balance) {
    // ... (sin cambios)
    const displayElement = document.getElementById(`au-max-${currency.toLowerCase()}`); 
    if (displayElement) {
        displayElement.textContent = `(Max: ${balance.toFixed(currency === 'USDT' ? 2 : 5)} ${currency})`;
    }
}

/**
 * Valida un input de monto contra el saldo real disponible y los mínimos de BitMart.
 */
function validateAmountInput(inputId, maxLimit, currency) {
    // ... (sin cambios)
    const input = document.getElementById(inputId);
    const errorDisplayId = `au-error-${currency.toLowerCase()}`;
    const errorElement = document.getElementById(errorDisplayId); 
    
    if (!input) return true;
    const value = parseFloat(input.value);
    const minBitmart = currency === 'USDT' ? MIN_USDT_AMOUNT : MIN_BTC_AMOUNT;
    
    // Lógica de validación (dejada como está)
    if (isNaN(value) || value <= 0) { /* ... */ return false; }
    if (value < minBitmart) { /* ... */ return false; }
    if (value > maxLimit) { /* ... */ return false; }

    if (errorElement) errorElement.style.display = 'none';
    return true;
}

/**
 * Configura los event listeners para los campos de configuración.
 * Llama a handlerSendConfig que utiliza collectConfigData() para enviar el objeto completo.
 */
function setupConfigListeners() {
    // ... (Arrays de IDs sin cambios) ...

    const balanceInputIds = [
        { id: 'auamount-usdt', currency: 'USDT' },
        { id: 'auamount-btc', currency: 'BTC' },
    ];
    
    const otherConfigInputIds = [
        'aupurchase-usdt', 'aupurchase-btc', 'auincrement', 'audecrement', 
        'autrigger', 'au-stop-at-cycle-end'
    ];


    // FUNCIÓN MANEJADORA: Recoge y envía el objeto de configuración completo.
    const handlerSendConfig = () => {
        const configData = collectConfigData();
        sendConfigToBackend(configData);
    };

    // 1. Listeners para Campos de Balance
    balanceInputIds.forEach(({ id, currency }) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                const isValid = validateAmountInput(id, currency === 'USDT' ? maxUsdtBalance : maxBtcBalance, currency);
                if (isValid) {
                    handlerSendConfig(); 
                } 
            });
            
            input.addEventListener('blur', () => {
                validateAmountInput(id, currency === 'USDT' ? maxUsdtBalance : maxBtcBalance, currency);
            });
        }
    });
    
    // 2. Listeners para otros campos (incluyendo el autrigger)
    otherConfigInputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', handlerSendConfig); 
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
    
    document.getElementById('auamount-usdt')?.setAttribute('max', maxUsdtBalance.toFixed(2));
    document.getElementById('auamount-btc')?.setAttribute('max', maxBtcBalance.toFixed(5));

    setupConfigListeners();

    let currentTab = 'opened';
    
    const austartBtn = document.getElementById('austart-btn');
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
            
            const config = collectConfigData(); 
            await toggleBotState(isRunning, config);
        });
    }
    // ... (resto de listeners e inicialización)
    
    const socket = io(SOCKET_SERVER_URL);
    
    socket.on('bot-state-update', (state) => {
        updateBotUI(state);
    });

    //getBalances();
    intervals.autobot = setInterval(getBalances, 10000);
    intervals.orders = setInterval(() => {
        const auOrderList = document.getElementById('au-order-list');
        if (auOrderList) {
            fetchOrders(currentTab, auOrderList);
        }
    }, 15000);
}

export { collectConfigData };