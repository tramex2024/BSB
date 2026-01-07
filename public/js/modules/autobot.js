// public/js/modules/autobot.js

import { initializeChart } from './chart.js';
import { fetchOrders, updateOpenOrdersTable } from './orders.js';
import { updateBotUI, displayMessage } from './uiManager.js';
import { sendConfigToBackend, toggleBotState } from './apiService.js';
import { TRADE_SYMBOL_TV, BACKEND_URL, socket } from '../main.js';

// Ahora todo se valida contra USDT
const MIN_USDT_AMOUNT = 5.00;
let currentTab = 'opened';

/**
 * Valida los nuevos inputs de USDT (L y S)
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
 * Escucha cambios en los nuevos IDs para auto-guardado
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
            // Validamos visualmente mientras escribe
            if (el.type === 'number') {
                const val = parseFloat(el.value);
                el.classList.toggle('border-red-500', isNaN(val) || val < 0);
            }
            sendConfigToBackend();
        });
    });
}

export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');

    // Inicializar listeners de los nuevos IDs
    setupConfigListeners();

    // Gráfico
    setTimeout(() => {
        if (document.getElementById('au-tvchart')) {
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 400);

    // --- ACTIVACIÓN DEL BOTÓN CON LOS NUEVOS IDS ---
    const activateStartBtn = () => {
        const startBtn = document.getElementById('austart-btn');
        if (startBtn) {
            console.log("🚀 [UI] Botón localizado. Usando IDs: AmountL/S y PurchaseL/S");
            const newBtn = startBtn.cloneNode(true);
            startBtn.parentNode.replaceChild(newBtn, startBtn);

            newBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                const isRunning = newBtn.textContent.includes('STOP');
                
                // Si vamos a arrancar, validamos que los montos en USDT sean correctos
                if (!isRunning && !validateStrategyInputs()) {
                    displayMessage(`Min amount is $${MIN_USDT_AMOUNT} USDT`, 'error');
                    return;
                }
                
                try {
                    console.log("🔥 [EVENT] Ejecutando Toggle...");
                    await toggleBotState(isRunning);
                } catch (err) {
                    console.error("❌ Error:", err);
                }
            });
            return true;
        }
        return false;
    };

    // Reintento (Modo Bulldozer)
    if (!activateStartBtn()) {
        const retry = setInterval(() => {
            if (activateStartBtn()) clearInterval(retry);
        }, 200);
        setTimeout(() => clearInterval(retry), 3000);
    }

    // --- MANEJO DE PESTAÑAS DE ÓRDENES CON RESALTADO VISUAL ---
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    
    orderTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // 1. Limpiar el estilo de todas las pestañas para quitar el "verde"
            orderTabs.forEach(btn => {
                btn.classList.remove('bg-emerald-600', 'text-white', 'border-emerald-500');
                btn.classList.add('bg-gray-800/50', 'text-gray-400', 'border-transparent');
            });

            // 2. Aplicar el resaltado a la pestaña clickeada
            const selectedTab = e.currentTarget;
            selectedTab.classList.add('bg-emerald-600', 'text-white', 'border-emerald-500');
            selectedTab.classList.remove('bg-gray-800/50', 'text-gray-400', 'border-transparent');

            // 3. Cargar los datos correspondientes
            currentTab = selectedTab.id.replace('tab-', '');
            fetchOrders(currentTab, auOrderList);
        });
    });

    // Carga inicial (por defecto 'opened')
    fetchOrders('opened', auOrderList);

    // Sockets
    if (socket) {
        socket.off('bot-state-update');
        socket.on('bot-state-update', (state) => updateBotUI(state));
    }
}