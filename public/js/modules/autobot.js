// public/js/modules/autobot.js

import { initializeChart } from './chart.js';
import { fetchOrders } from './orders.js';
import { updateBotUI, updateControlsState, displayMessage } from './uiManager.js';
import { sendConfigToBackend, toggleBotSideState } from './apiService.js'; 
import { TRADE_SYMBOL_TV, socket, currentBotState } from '../main.js';

const MIN_USDT_AMOUNT = 5.00;
let currentTab = 'opened';
let configDebounceTimeout = null;

/**
 * Valida los inputs de una estrategia (Long o Short)
 */
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

/**
 * Escucha cambios en los inputs y guarda con Debounce
 */
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

    // 1. LÓGICA DE BOTONES (Primero los preparamos)
    const setupSideBtn = (id, sideName) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        // Clonamos para limpiar eventos viejos
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            // Verificamos el estado actual por la clase que pone controls.js
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

    // Inicializamos los clones
    setupSideBtn('austartl-btn', 'long');
    setupSideBtn('austarts-btn', 'short');
    setupSideBtn('austartai-btn', 'ai');

    // 2. AHORA SÍ: Pintamos los botones recién creados con el estado real
    // Esto sobreescribe el verde inicial si el bot está RUNNING
    updateBotUI(currentBotState);
    updateControlsState(currentBotState);

    // 3. RESTO DE LA VISTA (Gráfico y Órdenes)
    setTimeout(() => {
        const chartContainer = document.getElementById('au-tvchart');
        if (chartContainer) {
            if (window.currentChart) {
                try { window.currentChart.remove(); } catch(e) {}
            }
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 500);

    // 3. LÓGICA DE BOTONES (Limpieza de listeners previos)
    const setupSideBtn = (id, sideName) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Detectamos estado actual para saber si vamos a frenar o arrancar
            const isRunning = newBtn.classList.contains('bg-red-600') || newBtn.textContent.includes('STOP');
            
            if (!isRunning && sideName !== 'ai' && !validateSideInputs(sideName)) {
                displayMessage(`Mínimo $${MIN_USDT_AMOUNT} USDT para ${sideName.toUpperCase()}`, 'error');
                return;
            }

            try {
                newBtn.disabled = true;
                newBtn.textContent = isRunning ? "Stopping..." : "Starting...";
                
                await toggleBotSideState(isRunning, sideName);
                // No tocamos nada más, el socket hará el cambio de color real.
            } catch (err) {
                displayMessage(`Error en ${sideName}`, 'error');
                updateControlsState(currentBotState); // Revertimos visualmente si falló el API
            } finally {
                newBtn.disabled = false;
            }
        });
    };

    setupSideBtn('austartl-btn', 'long');
    setupSideBtn('austarts-btn', 'short');
    setupSideBtn('austartai-btn', 'ai');

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
    
    // NOTA: Eliminamos el socket.on de aquí para que no choque con main.js
}