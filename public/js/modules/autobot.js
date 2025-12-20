// public/js/modules/autobot.js (VERSIÓN FINAL CON SINCRONIZACIÓN DE ESTADO COMPLETA)



import { initializeChart } from './chart.js';

// 🛑 CORRECCIÓN: Usar updateOpenOrdersTable importada desde orders.js

import { fetchOrders, setActiveTab as setOrdersActiveTab, updateOpenOrdersTable } from './orders.js';

import { updateBotUI, displayMessage } from './uiManager.js';

import { getBotConfiguration, sendConfigToBackend, toggleBotState } from './apiService.js';



// 🛑 ¡CORRECCIÓN CRÍTICA DE SINTAXIS! Se listan todas las importaciones necesarias de main.js, separadas por coma.

import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, currentChart, intervals, BACKEND_URL, socket } from '../main.js';



// Constantes de mínimos de BitMart

const MIN_USDT_AMOUNT = 5.00;

const MIN_BTC_AMOUNT = 0.00005;



// NUEVAS VARIABLES GLOBALES PARA LOS LÍMITES REALES

let maxUsdtBalance = 0;

let maxBtcBalance = 0;



// =========================================================================

// FUNCIÓN NUEVA: ACTUALIZA EL BALANCE GENERAL

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



// =========================================================================

// FUNCIÓN NUEVA: ACTUALIZA VALORES DINÁMICOS DEL BOT (Cobertura/Órdenes)

// =========================================================================



/**

 * Actualiza la UI con los valores de lcoverage y lnorder provenientes del backend.

 * @param {object} botState - El objeto Autobot completo.

 */

function updateDynamicBotMetrics(botState) {

    // 1. Actualizar LCOVERAGE

    const lcoverageEl = document.getElementById('au-lcoverage');

    const lcoverage = parseFloat(botState.lcoverage || 0);



    if (lcoverageEl) {

        lcoverageEl.textContent = `$${lcoverage.toFixed(2)}`;

    }



    // 2. Actualizar LNORDER

    const lnorderEl = document.getElementById('au-lnorder');

    const lnorder = parseInt(botState.lnorder || 0, 10);



    if (lnorderEl) {

        lnorderEl.textContent = lnorder;

    }

    

    // 3. Actualizar PPC (Precio Promedio de Compra, si está disponible)

    const ppcEl = document.getElementById('au-ppc');

    const ppc = parseFloat(botState.lStateData?.ppc || 0);



    if (ppcEl) {

        // Muestra el PPC solo si es > 0, sino muestra un guión o N/A

        ppcEl.textContent = ppc > 0 ? `$${ppc.toFixed(2)}` : 'N/A';

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

            // 4. Re-validar los campos
            validateAmountInput('auamount-usdt', maxUsdtBalance, 'USDT');
            validateAmountInput('auamount-btc', maxBtcBalance, 'BTC');
        });

        // Listener de WebSocket para la actualización de Órdenes Abiertas
        socket.on('open-orders-update', (ordersData) => {
            console.log(`[Socket.io] Recibidas órdenes abiertas/actualizadas para Autobot.`);
            updateOpenOrdersTable(ordersData, 'au-order-list', currentTab);
        });
        
    //    socket.on('full-state-sync', (data) => {
    //	console.log("Dato real del servidor -> LNOrder:", data.botState.lnorder); // <--- MIRA ESTO
    //	const botState = data.botState;
    //	updateBotUI(botState);
    //	updateDynamicBotMetrics(botState);
    //	}); 

        // 🛑 ELIMINADO: Listener 'bot-state-update'. Ahora se usa 'full-state-sync'.
        
    } else {
        console.error("El socket principal no está disponible. No se pueden recibir actualizaciones en tiempo real del Autobot.");
    }
}