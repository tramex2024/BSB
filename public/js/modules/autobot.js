// public/js/modules/autobot.js

import { initializeChart } from './chart.js';
import { fetchOrders } from './orders.js';
import { updateBotUI, updateControlsState, displayMessage } from './uiManager.js';
import { sendConfigToBackend, toggleBotSideState } from './apiService.js'; 
import { TRADE_SYMBOL_TV, socket, currentBotState } from '../main.js';

const MIN_USDT_AMOUNT = 5.00;
let currentTab = 'All';
let configDebounceTimeout = null;

function validateSideInputs(side) {
    const suffix = side === 'long' ? 'l' : 's';
    const fields = [`auamount${suffix}-usdt`, `aupurchase${suffix}-usdt`];
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
        'auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l',
        'auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s',
        'auamountai-usdt', 'au-stop-long-at-cycle', 'au-stop-short-at-cycle', 'au-stop-ai-at-cycle'
    ];
    
    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const eventType = el.type === 'checkbox' ? 'change' : 'input';
        
        el.addEventListener(eventType, () => {
            if (configDebounceTimeout) clearTimeout(configDebounceTimeout);
            configDebounceTimeout = setTimeout(async () => {
                try {
                    await sendConfigToBackend();
                } catch (err) {
                    console.error("❌ Error guardando config:", err);
                }
            }, 500);
        });
    });
}

export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');
    if (configDebounceTimeout) clearTimeout(configDebounceTimeout);

    setupConfigListeners();

    // 1. DEFINICIÓN Y LIMPIEZA DE BOTONES
    const setupSideBtn = (id, sideName) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            // Verificamos si está RUNNING por la clase que pone uiManager/controls
            const isRunning = newBtn.classList.contains('bg-red-600') || newBtn.textContent.includes('STOP');
            
            if (!isRunning && sideName !== 'ai' && !validateSideInputs(sideName)) {
                displayMessage(`Mínimo $${MIN_USDT_AMOUNT} USDT para ${sideName.toUpperCase()}`, 'error');
                return;
            }

            try {
                newBtn.disabled = true;
                newBtn.textContent = isRunning ? "Stopping..." : "Starting...";
                await toggleBotSideState(isRunning, sideName);
            } catch (err) {
                displayMessage(`Error en ${sideName}`, 'error');
                updateControlsState(currentBotState); 
            } finally {
                newBtn.disabled = false;
            }
        });
    };

    // Reemplazamos los botones primero
    setupSideBtn('austartl-btn', 'long');
    setupSideBtn('austarts-btn', 'short');
    setupSideBtn('austartai-btn', 'ai');

    // 2. SINCRONIZACIÓN VISUAL INMEDIATA
    // Esto se ejecuta DESPUÉS de haber creado los botones nuevos, 
    // así que los pintará de ROJO si el bot está corriendo.
    updateBotUI(currentBotState);
    updateControlsState(currentBotState);

    // 3. GRÁFICO
    setTimeout(() => {
        const chartContainer = document.getElementById('au-tvchart');
        if (chartContainer) {
            if (window.currentChart) {
                try { window.currentChart.remove(); } catch(e) {}
            }
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 500);

    // 4. GESTIÓN DE PESTAÑAS DE ÓRDENES
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    const setActiveTabStyle = (selectedId) => {
        orderTabs.forEach(btn => {
            btn.classList.remove('text-emerald-400', 'font-bold', 'border-emerald-500/30');
            btn.classList.add('bg-gray-800/40', 'border', 'border-gray-700/50', 'text-gray-500');
            if (btn.id === selectedId) {
                btn.classList.add('text-emerald-400', 'font-bold', 'border-emerald-500/30');
                btn.classList.remove('text-gray-500');
            }
        });
    };

    orderTabs.forEach(tab => {
        tab.onclick = (e) => {
            const selectedId = e.currentTarget.id;
            setActiveTabStyle(selectedId);
            currentTab = selectedId.replace('tab-', '');
            fetchOrders(currentTab, auOrderList);
        };
    });

    setActiveTabStyle('tab-opened');
    fetchOrders('opened', auOrderList);
}