/**
 * public/js/modules/autobot.js
 * Gestión de la vista del Autobot con Lógica Exponencial y Sincronización Blindada.
 */

import { initializeChart } from './chart.js';
import { fetchOrders } from './orders.js';
import { displayMessage, updateControlsState, updateBotUI } from './uiManager.js';
import { toggleBotSideState, sendConfigToBackend } from './apiService.js'; 
import { socket, currentBotState, TRADE_SYMBOL_TV, logStatus, BACKEND_URL } from '../main.js';

const MIN_USDT_AMOUNT = 6.00;
let currentTab = 'opened';
let saveTimeout; 

/**
 * Pinta los valores de la DB en los inputs de la UI (Protección de foco activa)
 */
export function updateAutobotInputs(state) {
    if (!state || !state.config) return;
    const cfg = state.config;

    const mapping = {
        'auamountl-usdt': cfg.long?.amountUsdt,
        'aupurchasel-usdt': cfg.long?.purchaseUsdt,
        'auincrementl': cfg.long?.size_var,
        'audecrementl': cfg.long?.price_var,
        'autriggerl': cfg.long?.profit_percent,
        'aupricestep-l': cfg.long?.price_step_inc,
        
        'auamounts-usdt': cfg.short?.amountUsdt,
        'aupurchases-usdt': cfg.short?.purchaseUsdt,
        'auincrements': cfg.short?.size_var,
        'audecrements': cfg.short?.price_var,
        'autriggers': cfg.short?.profit_percent,
        'aupricestep-s': cfg.short?.price_step_inc
    };

    for (const [id, value] of Object.entries(mapping)) {
        const el = document.getElementById(id);
        if (el && value !== undefined && document.activeElement !== el) {
            el.value = value;
        }
    }

    const stopL = document.getElementById('au-stop-long-at-cycle');
    if (stopL && document.activeElement !== stopL) stopL.checked = !!cfg.long?.stopAtCycle;

    const stopS = document.getElementById('au-stop-short-at-cycle');
    if (stopS && document.activeElement !== stopS) stopS.checked = !!cfg.short?.stopAtCycle;
}

function setupConfigListeners() {
    const configIds = [
        'auamountl-usdt', 'auamounts-usdt', 'aupurchasel-usdt', 'aupurchases-usdt', 
        'auincrementl', 'auincrements', 'audecrementl', 'audecrements', 
        'autriggerl', 'autriggers', 'au-stop-long-at-cycle', 'au-stop-short-at-cycle',
        'aupricestep-l', 'aupricestep-s'
    ];
    
    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(async () => {
                logStatus("💾 Auto-guardando configuración...", "info");
                await sendConfigToBackend(); // Usamos la función centralizada de apiService
            }, 800); 
        });
    });
}

export async function initializeAutobotView(initialState) {
    const auOrderList = document.getElementById('au-order-list');
    
    setupConfigListeners();

    // Estado inicial para evitar parpadeo
    if (initialState) {
        updateAutobotInputs(initialState);
        updateBotUI(initialState);
        updateControlsState(initialState);
    }

    // Inicialización de Gráfico
    setTimeout(() => {
        if (document.getElementById('au-tvchart')) {
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 400);

    // --- SISTEMA DE CLONADO DE BOTONES (Garantía de Evento Único) ---
    const activateButton = (id, side) => {
        const btn = document.getElementById(id);
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const isRunning = newBtn.textContent.includes('STOP');
                logStatus(isRunning ? `🛑 Deteniendo ${side}...` : `🚀 Iniciando ${side}...`);
                
                try {
                    // El bloqueo y desbloqueo ocurre dentro de toggleBotSideState (apiService)
                    await toggleBotSideState(isRunning, side);
                } catch (err) {
                    console.error(`❌ Error en ${side}:`, err);
                }
            });
            return true;
        }
        return false;
    };

    const setupAllButtons = () => {
        const l = activateButton('austartl-btn', 'long');
        const s = activateButton('austarts-btn', 'short');
        return l && s;
    };

    if (!setupAllButtons()) {
        const retry = setInterval(() => { if (setupAllButtons()) clearInterval(retry); }, 200);
        setTimeout(() => clearInterval(retry), 3000);
    }

    // --- GESTIÓN DE PESTAÑAS (Estilo Unificado de la Versión Funcional) ---
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

    // Carga inicial de órdenes y estilo
    setActiveTabStyle('tab-opened');
    fetchOrders('opened', auOrderList);

    // --- LIMPIEZA Y ESCUCHA DE SOCKETS ---
    if (socket) {
        socket.off('bot-state-update'); // Limpieza vital
        socket.on('bot-state-update', (state) => {
            updateAutobotInputs(state);
            updateBotUI(state);
            updateControlsState(state);
        });
        
        if (socket.connected) socket.emit('get-bot-state');
    }
}