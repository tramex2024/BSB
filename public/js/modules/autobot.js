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
        
        // Limpiamos listeners previos clonando si es necesario o usando una sola vez
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

    // 2. Inicializar gráfico (TradingView)
    setTimeout(() => {
        if (document.getElementById('au-tvchart')) {
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 400);

    // 3. Lógica de Botones Separados (Long y Short)
    const setupSeparateButtons = () => {
        const btnLong = document.getElementById('austartl-btn');
        const btnShort = document.getElementById('austarts-btn');

        if (btnLong && btnShort) {
            // Lógica para el botón de LONG
            btnLong.onclick = async (e) => {
                e.preventDefault();
                const isRunning = btnLong.textContent.includes('STOP');
                try {
                    // Llamamos a una nueva función que crearemos en apiService para manejar el lado
                    await toggleBotSideState(isRunning, 'long');
                } catch (err) {
                    console.error("❌ Error en Start Long:", err);
                }
            };

            // Lógica para el botón de SHORT
            btnShort.onclick = async (e) => {
                e.preventDefault();
                const isRunning = btnShort.textContent.includes('STOP');
                try {
                    await toggleBotSideState(isRunning, 'short');
                } catch (err) {
                    console.error("❌ Error en Start Short:", err);
                }
            };
            return true;
        }
        return false;
    };

    // Intentar configurar botones, si no existen reintentar (mantiene tu lógica original)
    if (!setupSeparateButtons()) {
        const retry = setInterval(() => { if (setupSeparateButtons()) clearInterval(retry); }, 200);
        setTimeout(() => clearInterval(retry), 3000);
    }

    // 4. GESTIÓN DE PESTAÑAS (Opened / History)
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    const setActiveTabStyle = (selectedId) => {
        orderTabs.forEach(btn => {
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

    // Carga inicial de órdenes
    setActiveTabStyle('tab-opened');
    fetchOrders('opened', auOrderList);

    // 5. SOCKETS: ACTUALIZACIÓN Y SINCRONIZACIÓN INICIAL
    if (socket) {
        // Limpieza de eventos duplicados
        socket.off('bot-state-update');
        socket.off('orders-update'); 

        // Listener para actualizaciones de estado (incluye el precio de BTC)
        socket.on('bot-state-update', (state) => {
            updateBotUI(state); 
        });

        // Listener para actualizar tabla de órdenes
        socket.on('orders-update', (data) => {
            if (document.getElementById('au-order-list')) {
                updateOpenOrdersTable(data, 'au-order-list', currentTab);
            }
        });

        /**
         * CRÍTICO: Petición activa de estado inicial.
         * Esto resuelve el problema del precio vacío al cambiar de pestaña.
         */
        if (socket.connected) {
            socket.emit('get-bot-state');
        } else {
            socket.on('connect', () => {
                socket.emit('get-bot-state');
            });
        }
    }
}