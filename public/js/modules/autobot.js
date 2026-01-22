// public/js/modules/autobot.js

import { initializeChart } from './chart.js';
import { fetchOrders, updateOpenOrdersTable } from './orders.js';
import { updateBotUI, displayMessage } from './uiManager.js';
import { sendConfigToBackend, toggleBotState } from './apiService.js';
import { TRADE_SYMBOL_TV, BACKEND_URL, socket } from '../main.js';

const MIN_USDT_AMOUNT = 5.00;
let currentTab = 'opened';

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

export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');
    setupConfigListeners();

    setTimeout(() => {
        if (document.getElementById('au-tvchart')) {
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 400);

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
                    console.error("❌ Error:", err);
                }
            });
            return true;
        }
        return false;
    };

    if (!activateStartBtn()) {
        const retry = setInterval(() => {
            if (activateStartBtn()) clearInterval(retry);
        }, 200);
        setTimeout(() => clearInterval(retry), 3000);
    }

    // --- GESTIÓN DE PESTAÑAS (UNIFICANDO RECUADRO SOMBREADO) ---
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    
    const setActiveTabStyle = (selectedId) => {
        orderTabs.forEach(btn => {
            // TODAS mantienen el recuadro sombreado y borde sutil
            btn.classList.add('bg-gray-800/40', 'border', 'border-gray-700/50', 'transition-all');

            if (btn.id === selectedId) {
                // ACTIVA: Texto Verde + Brillo sutil en el borde
                btn.classList.add('text-emerald-400', 'font-bold', 'border-emerald-500/30');
                btn.classList.remove('text-gray-500', 'font-normal');
            } else {
                // INACTIVA: Texto Gris + Borde normal
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

    // Carga inicial
    setActiveTabStyle('tab-opened');
    fetchOrders('opened', auOrderList);

    if (socket) {
        socket.off('bot-state-update');
        socket.on('bot-state-update', (state) => updateBotUI(state));
    }
}