// public/js/modules/autobot.js (VERSIÓN FINAL CON VALIDACIÓN DE FONDOS Y FIX CONEXIÓN)

// 🛑 ELIMINADAS: getBalances y fetchAvailableBalancesForValidation ya no se necesitan.
// Los balances iniciales se cargarán desde la DB del backend (más rápido),
// y las actualizaciones serán por WebSocket.
import { initializeChart } from './chart.js';
// 🛑 CORRECCIÓN: Usar updateOpenOrdersTable importada desde orders.js
import { fetchOrders, setActiveTab as setOrdersActiveTab, updateOpenOrdersTable } from './orders.js';
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

// =========================================================================
// FUNCIÓN NUEVA: ACTUALIZA EL BALANCE GENERAL (Reemplaza la lógica de balance.js)
// =========================================================================

/**
 * Actualiza el elemento con el ID 'aubalance' con el saldo real de USDT y BTC
 * del exchange en el formato "USDT: X | BTC: Y".
 * Esta función es llamada por el socket 'balance-update' para el tiempo real.
 * @param {number} usdt - Saldo USDT disponible.
 * @param {number} btc - Saldo BTC disponible.
 */
function updateMainBalanceDisplay(usdt, btc) {
    // USDT: 2 decimales
    const usdtValue = parseFloat(usdt || 0).toFixed(2);
    // BTC: 5 decimales
    const btcValue = parseFloat(btc || 0).toFixed(5);
    
    // CONSTRUIR EL FORMATO REQUERIDO
    const formattedBalance = `USDT: ${usdtValue} | BTC: ${btcValue}`;

    // ASIGNAR AL ID DEL FRONTEND
    const totalBalanceEl = document.getElementById('aubalance');
    if (totalBalanceEl) {
        totalBalanceEl.textContent = formattedBalance;
    }
}

// =========================================================================
// FIN FUNCIÓN NUEVA
// =========================================================================


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

/**
 * Función que obtiene los balances (últimos conocidos de la DB) y actualiza la UI para los límites.
 * 🛑 MODIFICADO: Ahora llama a un endpoint DB-backed, eliminando la llamada innecesaria al Exchange.
 */
async function loadBalancesAndLimits() {
    try {
        const token = localStorage.getItem('token');
        // 🚀 NUEVO ENDPOINT ASUMIDO: Llama a una ruta que devuelve el último balance conocido guardado en la DB del bot.
        // El backend debe asegurar que esta ruta es barata y no llama al exchange.
        const response = await fetch(`${BACKEND_URL}/api/v1/bot-state/balances`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch initial balances from DB. Status: ' + response.status);
        }
        
        const data = await response.json();
        
        // 🛑 ASUMIMOS que la respuesta de este nuevo endpoint es la estructura del socket:
        // { success: true, data: { lastAvailableUSDT: X, lastAvailableBTC: Y } }
        if (data.success && data.data) {
            
            const dbData = data.data;
            
            // 1. Asignar a las variables globales del Autobot
            maxUsdtBalance = parseFloat(dbData.lastAvailableUSDT) || 0;
            maxBtcBalance = parseFloat(dbData.lastAvailableBTC) || 0;
            
            // 2. Actualizar la interfaz de usuario con los límites (UX)
            updateMaxBalanceDisplay('USDT', maxUsdtBalance);
            updateMaxBalanceDisplay('BTC', maxBtcBalance);

            // 3. Actualizar el balance general (aubalance) con el estado inicial de la DB
            updateMainBalanceDisplay(maxUsdtBalance, maxBtcBalance);

            // Opcional: Establecer el atributo 'max' en los inputs
            document.getElementById('auamount-usdt')?.setAttribute('max', maxUsdtBalance.toFixed(2));
            document.getElementById('auamount-btc')?.setAttribute('max', maxBtcBalance.toFixed(5));
            
        } else {
            console.error('Estructura de datos de balance inicial incorrecta o faltan claves.', data);
            maxUsdtBalance = 0;
            maxBtcBalance = 0;
            updateMaxBalanceDisplay('USDT', 0);
            updateMaxBalanceDisplay('BTC', 0);
            updateMainBalanceDisplay(0, 0);
        }

    } catch (error) {
        console.error("Fallo al cargar los límites de balance para validación:", error);
        displayMessage('Error: No se pudieron cargar los límites de balance de la DB.', 'error');
    }
}

// --- FUNCIÓN DE INICIALIZACIÓN (CORREGIDA) ---
export async function initializeAutobotView() {
    console.log("Inicializando vista del Autobot...");

    // 🛑 1. Llamada NO BLOQUEANTE para cargar los balances. Ahora usa la DB, no el Exchange.
    await loadBalancesAndLimits();

    // 2. Configura todos los listeners de los campos de configuración.
    setupConfigListeners();

    let currentTab = 'opened';
    
    // 💡 Declaraciones ÚNICAS de elementos del DOM
    const austartBtn = document.getElementById('austart-btn');
    const auresetBtn = document.getElementById('aureset-btn');
    const auorderTabs = document.querySelectorAll('#autobot-section [id^="tab-"]');
    // Declaración única para el contenedor de órdenes
    const auOrderList = document.getElementById('au-order-list'); 

    // 3. Inicializa el gráfico de TradingView
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
            // Usamos la variable 'auOrderList' ya declarada
            fetchOrders(currentTab, auOrderList);
        });
    });

    // 5. Carga inicial de órdenes (solo una vez al cargar la vista)
    setOrdersActiveTab('tab-opened');
    fetchOrders(currentTab, auOrderList); // Usamos la variable 'auOrderList' ya declarada
    
    // 6. Conexión de Socket.io
    const socket = io(SOCKET_SERVER_URL); 

    socket.on('bot-state-update', (state) => {
        updateBotUI(state);
    }); 
    
    // Listener de WebSocket para la actualización de Balances (ELIMINA EL POLLING HTTP)
    socket.on('balance-update', (balances) => {
        console.log('[Socket.io] Balance en tiempo real recibido:', balances);
        
        // 1. Actualizar las variables globales del frontend con los nuevos valores
        maxUsdtBalance = balances.lastAvailableUSDT;
        maxBtcBalance = balances.lastAvailableBTC;
        
        // 2. Actualizar la interfaz de usuario con los límites (Max: X)
        updateMaxBalanceDisplay('USDT', maxUsdtBalance);
        updateMaxBalanceDisplay('BTC', maxBtcBalance);

        // 3. Actualizar el balance general (USDT: X | BTC: Y)
        updateMainBalanceDisplay(maxUsdtBalance, maxBtcBalance);

        // 4. Re-validar los campos
        validateAmountInput('auamount-usdt', maxUsdtBalance, 'USDT');
        validateAmountInput('auamount-btc', maxBtcBalance, 'BTC');
    });

    // 🛑 MEJORA DE DEBUGGING: Muestra el tipo y contenido exacto de la variable ordersData
    socket.on('open-orders-update', (ordersData) => {
        // La función updateOpenOrdersTable se encarga de verificar el tab activo y buscar el contenedor.
        console.log(`[Socket.io] Recibidas órdenes abiertas/actualizadas. Tipo de payload: ${typeof ordersData}. Contenido:`, ordersData);
        updateOpenOrdersTable(ordersData); 
    });

}