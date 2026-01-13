// public/js/modules/autobot.js

import { initializeChart } from './chart.js';
import { fetchOrders, updateOpenOrdersTable } from './orders.js';
import { updateBotUI, displayMessage } from './uiManager.js';
import { sendConfigToBackend, toggleBotState } from './apiService.js';
import { TRADE_SYMBOL_TV, socket } from '../main.js';

const MIN_USDT_AMOUNT = 5.00;
let currentTab = 'opened';

/**
 * Valida que los montos cumplan con el mínimo requerido por BitMart
 */
function validateStrategyInputs() {
    const fields = ['auamountl-usdt', 'auamounts-usdt', 'aupurchasel-usdt', 'aupurchases-usdt'];
    let isValid = true;
    fields.forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        const val = parseFloat(input.value);
        if (isNaN(val) || val < MIN_USDT_AMOUNT) {
            input.classList.add('border-red-500');
            isValid = false;
        } else {
            input.classList.remove('border-red-500');
        }
    });
    return isValid;
}

/**
 * Escucha cambios en los inputs para enviar la configuración al backend al instante
 */
function setupConfigListeners() {
    const configIds = [
        'auamountl-usdt', 'auamounts-usdt', 
        'aupurchasel-usdt', 'aupurchases-usdt', 
        'auincrement', 'audecrement', 'autrigger', 
        'au-stop-long-at-cycle', 'au-stop-short-at-cycle'
    ];
    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
            if (el.type === 'number') {
                const val = parseFloat(el.value);
                el.classList.toggle('border-red-500', isNaN(val) || val < 0);
            }
            sendConfigToBackend();
        });
    });
}

/**
 * Inicialización principal de la vista de Autobot
 */
export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');
    
    // 1. Configurar listeners de configuración (Inputs)
    setupConfigListeners();

    // 2. Inicializar gráfico con un pequeño retraso para asegurar el contenedor DOM
    setTimeout(() => {
        if (document.getElementById('au-tvchart')) {
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 400);

    // 3. Lógica del Botón Start/Stop (Clonación para limpiar eventos previos)
    const activateStartBtn = () => {
        const startBtn = document.getElementById('austart-btn');
        if (startBtn) {
            const newBtn = startBtn.cloneNode(true);
            startBtn.parentNode.replaceChild(newBtn, startBtn);
            newBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const isRunning = newBtn.textContent.includes('STOP');
                if (!isRunning && !validateStrategyInputs()) {
                    displayMessage(`Min amount is $${MIN_USDT_AMOUNT} USDT`, 'error');
                    return;
                }
                try {
                    await toggleBotState(isRunning);
                } catch (err) {
                    console.error("❌ Error al cambiar estado del bot:", err);
                }
            });
            return true;
        }
        return false;
    };

    // Reintento de activación si el botón no está listo inmediatamente
    if (!activateStartBtn()) {
        const retry = setInterval(() => {
            if (activateStartBtn()) clearInterval(retry);
        }, 200);
        setTimeout(() => clearInterval(retry), 3000);
    }

    // 4. GESTIÓN DE PESTAÑAS (Opened / History)
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    
    const setActiveTabStyle = (selectedId) => {
        orderTabs.forEach(btn => {
            btn.classList.add('bg-gray-800/40', 'border', 'border-gray-700/50', 'transition-all');
            if (btn.id === selectedId) {
                btn.classList.add('text-emerald-400', 'font-bold', 'border-emerald-500/30');
                btn.classList.remove('text-gray-500', 'font-normal');
            } else {
                btn.classList.remove('text-emerald-400', 'font-bold', 'border-emerald-500/30');
                btn.classList.add('text-gray-500', 'font-normal');
            }
        });
    };

    orderTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const selectedId = e.currentTarget.id;
            setActiveTabStyle(selectedId);
            currentTab = selectedId.replace('tab-', '');
            fetchOrders(currentTab, auOrderList);
        });
    });

    // Carga inicial de datos
    setActiveTabStyle('tab-opened');
    fetchOrders('opened', auOrderList);

    // 5. SOCKETS: ACTUALIZACIÓN EN TIEMPO REAL (Con Limpieza Crítica)
    if (socket) {
        // IMPORTANTE: Limpiar antes de asignar para evitar duplicados en memoria
        socket.off('bot-state-update');
        socket.off('orders-update'); 

        // Escuchar actualización de interfaz (Botones Start/Stop)
        socket.on('bot-state-update', (state) => updateBotUI(state));

        // Escuchar actualización de la tabla de órdenes
        socket.on('orders-update', (data) => {
            if (document.getElementById('au-order-list')) {
                updateOpenOrdersTable(data, 'au-order-list', currentTab);
            }
        });

        // Solicitar estado actual al backend para sincronizar la UI nada más cargar
        socket.emit('get-bot-state');
    }
}