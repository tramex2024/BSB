// public/js/modules/autobot.js

import { initializeChart } from './chart.js';
import { fetchOrders, updateOpenOrdersTable } from './orders.js';
import { updateBotUI, displayMessage } from './uiManager.js';
// CORRECCIÓN: Importamos toggleBotSideState que es el nombre real en apiService.js
import { sendConfigToBackend, toggleBotSideState } from './apiService.js'; 
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
            // En cada cambio de input (como tu purchase de 7), se guarda en el server
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
                if (!validateStrategyInputs() && !btnLong.textContent.includes('STOP')) {
                    displayMessage("Monto mínimo 5 USDT", "error");
                    return;
                }
                const isRunning = btnLong.textContent.includes('STOP');
                try {
                    await toggleBotSideState(isRunning, 'long');
                } catch (err) {
                    console.error("❌ Error en Start Long:", err);
                }
            };

            // Lógica para el botón de SHORT
            btnShort.onclick = async (e) => {
                e.preventDefault();
                if (!validateStrategyInputs() && !btnShort.textContent.includes('STOP')) {
                    displayMessage("Monto mínimo 5 USDT", "error");
                    return;
                }
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

    if (!setupSeparateButtons()) {
        const retry = setInterval(() => { if (setupSeparateButtons()) clearInterval(retry); }, 200);
        setTimeout(() => clearInterval(retry), 3000);
    }

    // 4. GESTIÓN DE PESTAÑAS
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

    setActiveTabStyle('tab-opened');
    fetchOrders('opened', auOrderList);

    // 5. SOCKETS
    if (socket) {
        socket.off('bot-state-update');
        socket.off('orders-update'); 

        socket.on('bot-state-update', (state) => {
            updateBotUI(state); 
        });

        socket.on('orders-update', (data) => {
            if (document.getElementById('au-order-list')) {
                updateOpenOrdersTable(data, 'au-order-list', currentTab);
            }
        });

        if (socket.connected) {
            socket.emit('get-bot-state');
        } else {
            socket.on('connect', () => {
                socket.emit('get-bot-state');
            });
        }
    }
}