// public/js/modules/autobot.js (VERSIÓN FINAL CON VALIDACIÓN DE FONDOS Y FIX CONEXIÓN)

import { getBalances, fetchAvailableBalancesForValidation } from './balance.js'; 
import { initializeChart } from './chart.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './orders.js';
import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, currentChart, intervals, BACKEND_URL } from '../main.js';
import { updateBotUI, displayMessage } from './uiManager.js';
import { getBotConfiguration, sendConfigToBackend, toggleBotState } from './apiService.js';

const SOCKET_SERVER_URL = 'https://bsb-ppex.onrender.com'; 

// Constantes de mínimos de BitMart
const MIN_USDT_AMOUNT = 5.00;
const MIN_BTC_AMOUNT = 0.00005;

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
 * Valida un input de monto contra el saldo real disponible y los mínimos de BitMart.
 * @param {string} inputId - ID del campo de input.
 * @param {number} maxLimit - El saldo máximo disponible.
 * @param {string} currency - 'USDT' o 'BTC'.
 * @returns {boolean} True si es válido, False si no lo es.
 */
function validateAmountInput(inputId, maxLimit, currency) {
    const input = document.getElementById(inputId);
    const errorDisplayId = `au-error-${currency.toLowerCase()}`;
    const errorElement = document.getElementById(errorDisplayId); 
    
    if (!input) return true;

    const value = parseFloat(input.value);
    const minBitmart = currency === 'USDT' ? MIN_USDT_AMOUNT : MIN_BTC_AMOUNT;
    
    // 1. Verificar si el valor es válido (no NaN y positivo)
    if (isNaN(value) || value <= 0) {
        if (errorElement) {
            errorElement.textContent = `El monto de ${currency} debe ser un número positivo.`;
            errorElement.style.display = 'block';
        }
        return false;
    }

    // 2. Verificar el mínimo de BitMart
    if (value < minBitmart) {
        if (errorElement) {
            errorElement.textContent = `El monto mínimo requerido por BitMart es ${minBitmart.toFixed(currency === 'USDT' ? 2 : 5)} ${currency}.`;
            errorElement.style.display = 'block';
        }
        return false;
    }

    // 3. Verificar el límite máximo (Saldo Disponible)
    if (value > maxLimit) {
        const msg = `¡Advertencia! El monto excede el saldo real disponible (${maxLimit.toFixed(currency === 'USDT' ? 2 : 5)} ${currency}).`;
        if (errorElement) {
            errorElement.textContent = msg;
            errorElement.style.display = 'block';
        }
        return false;
    }

    // Si todo es correcto, ocultar el error
    if (errorElement) errorElement.style.display = 'none';
    return true;
}

/**
 * Configura los event listeners para los campos de configuración.
 * Nota: El código es el mismo que antes, pero llama a la función validateAmountInput actualizada.
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
                // Se llama a la función de validación actualizada
                const isValid = validateAmountInput(id, currency === 'USDT' ? maxUsdtBalance : maxBtcBalance, currency);
                if (isValid) {
                    // Solo enviamos si pasa la validación de límites.
                    sendConfigToBackend();
                } 
            });
            
            // Añadir un listener 'blur' para re-validar cuando el usuario sale del campo (mejor UX)
            input.addEventListener('blur', () => {
                 validateAmountInput(id, currency === 'USDT' ? maxUsdtBalance : maxBtcBalance, currency);
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

**
 * Función que obtiene los balances reales y actualiza la UI para los límites.
 */
async function loadBalancesAndLimits() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BACKEND_URL}/api/v1/balances/available`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch initial balances. Status: ' + response.status);
        }
        
        const data = await response.json();
        
        // 🛑 LECTURA CRÍTICA: data -> data -> exchange
        if (data.success && data.data && data.data.exchange) {
            
            const exchangeData = data.data.exchange;
            
            // 1. Asignar a las variables globales del Autobot
            // Utilizamos parseFloat() para asegurar que sean números.
            maxUsdtBalance = parseFloat(exchangeData.availableUSDT) || 0;
            maxBtcBalance = parseFloat(exchangeData.availableBTC) || 0;
            
            // 2. Actualizar la interfaz de usuario con los límites (UX)
            updateMaxBalanceDisplay('USDT', maxUsdtBalance);
            updateMaxBalanceDisplay('BTC', maxBtcBalance);
            
            // Opcional: Establecer el atributo 'max' en los inputs
            document.getElementById('auamount-usdt')?.setAttribute('max', maxUsdtBalance.toFixed(2));
            document.getElementById('auamount-btc')?.setAttribute('max', maxBtcBalance.toFixed(5));
            
        } else {
            console.error('Estructura de datos de balance inicial incorrecta o faltan claves.', data);
            // Si la estructura falla, nos aseguramos de que los límites se queden en 0
            maxUsdtBalance = 0;
            maxBtcBalance = 0;
            updateMaxBalanceDisplay('USDT', 0);
            updateMaxBalanceDisplay('BTC', 0);
        }

    } catch (error) {
        console.error("Fallo al cargar los límites de balance para validación:", error);
        displayMessage('Error: No se pudieron cargar los límites de balance de BitMart.', 'error');
    }
}

// --- FUNCIÓN DE INICIALIZACIÓN ---
export async function initializeAutobotView() {
    console.log("Inicializando vista del Autobot...");
    
    // 🛑 CORRECCIÓN: 1. Llamada NO BLOQUEANTE para cargar los balances.
    // Esto se ejecuta en segundo plano. La interfaz carga inmediatamente.
    await loadBalancesAndLimits(); 

    // 2. Configura todos los listeners de los campos de configuración.
    setupConfigListeners();

    let currentTab = 'opened';
    
    const austartBtn = document.getElementById('austart-btn');
    const auresetBtn = document.getElementById('aureset-btn');
    const auorderTabs = document.querySelectorAll('#autobot-section [id^="tab-"]');
    
    // 3. Inicializa el gráfico de TradingView (ya no está bloqueado)
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
    
    // 4. Configura los listeners de las pestañas de órdenes
    auorderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            const auOrderList = document.getElementById('au-order-list');
            fetchOrders(currentTab, auOrderList);
        });
    });

    // 5. Carga inicial de órdenes y configuración de sockets/intervalos
    setOrdersActiveTab('tab-opened');
    const auOrderList = document.getElementById('au-order-list');
    fetchOrders(currentTab, auOrderList);
    
    const socket = io(SOCKET_SERVER_URL);    

    socket.on('bot-state-update', (state) => {
        updateBotUI(state);
    });    
    
    // 💡 NUEVO: Listener de WebSocket para la actualización de Balances
// Recibe la información del caché de balances del backend
socket.on('balance-update', (balances) => {
    // 1. Actualizar las variables globales del frontend con los nuevos valores
    maxUsdtBalance = balances.lastAvailableUSDT;
    maxBtcBalance = balances.lastAvailableBTC;
    
    // 2. Actualizar la interfaz de usuario
    updateMaxBalanceDisplay('USDT', maxUsdtBalance);
    updateMaxBalanceDisplay('BTC', maxBtcBalance);

    // 3. Opcional: Re-validar los campos si el balance ha cambiado y el usuario está en la vista.
    // Esto es importante para que el botón START/STOP funcione correctamente si el balance cambió
    // mientras el usuario estaba en la vista.
    validateAmountInput('auamount-usdt', maxUsdtBalance, 'USDT');
    validateAmountInput('auamount-btc', maxBtcBalance, 'BTC');
});

    // 6. Configura los intervalos de actualización
    //intervals.autobot = setInterval(getBalances, 10000);
    intervals.orders = setInterval(() => {
        const auOrderList = document.getElementById('au-order-list');
        if (auOrderList) {
            fetchOrders(currentTab, auOrderList);
        }
    }, 15000);
}