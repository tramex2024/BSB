/**
 * autobot.js - Core Logic for Trading Tabs
 * Versión Purificada y Blindada 2026: Solo Autobot (Long & Short) con saneamiento integral de listeners
 */
import { initializeChart } from './chart.js';
import { fetchOrders } from './orders.js';
import { updateBotUI, updateControlsState } from './uiManager.js';
import { sendConfigToBackend } from './apiService.js'; 
import { TRADE_SYMBOL_TV, currentBotState } from '../main.js';
import { activeEdits } from './ui/controls.js';

const MIN_USDT_AMOUNT = 6.00;
let currentStrategyTab = 'all'; 
let configDebounceTimeout = null;

/**
 * Escucha cambios en los inputs exclusivamente del Autobot de forma segura
 */
function setupConfigListeners() {
    const configIds = [
        'auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l',
        'auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s',
        'au-stop-long-at-cycle', 'au-stop-short-at-cycle'
    ];
    
    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        // [BLINDAJE 2026]: Usamos propiedades directas en lugar de addEventListener.
        // Al cambiar de pestaña en la SPA, los listeners viejos quedan destruidos automáticamente de la memoria.
        const handler = () => {
            activeEdits[id] = Date.now();

            if (configDebounceTimeout) clearTimeout(configDebounceTimeout);
            
            configDebounceTimeout = setTimeout(async () => {
                // Si el input está vacío o es inválido (y no es un checkbox), abortamos el envío
                if (el.type !== 'checkbox' && (el.value === "" || isNaN(parseFloat(el.value)))) return;

                let side = id.includes('l') ? 'long' : 'short';
                const s = side === 'long' ? 'l' : 's';

                // Capturamos el valor actual del DOM o recurrimos de respaldo al estado en memoria
                const amountUsdt = parseFloat(document.getElementById(`auamount${s}-usdt`)?.value) || currentBotState.config[side]?.amountUsdt || 0;
                const purchaseUsdt = parseFloat(document.getElementById(`aupurchase${s}-usdt`)?.value) || currentBotState.config[side]?.purchaseUsdt || 0;
                const price_var = parseFloat(document.getElementById(`autrigger${s}`)?.value) || currentBotState.config[side]?.price_var || 0;
                const size_var = parseFloat(document.getElementById(`auincrement${s}`)?.value) || currentBotState.config[side]?.size_var || 0;
                const profit_percent = parseFloat(document.getElementById(`audecrement${s}`)?.value) || currentBotState.config[side]?.profit_percent || 0;
                const price_step_inc = parseFloat(document.getElementById(`aupricestep-${s}`)?.value) || currentBotState.config[side]?.price_step_inc || 0;
                const stopAtCycle = document.getElementById(`au-stop-${side}-at-cycle`) ? document.getElementById(`au-stop-${side}-at-cycle`).checked : false;

                // [BLINDAJE CONTRA SOBREESCRITURAS DESTRUCTIVAS]:
                // Armamos el payload mezclando de forma profunda el estado existente con los nuevos cambios de este bloque.
                const manualConfig = {
                    ...currentBotState.config,
                    [side]: {
                        amountUsdt,
                        purchaseUsdt,
                        price_var,
                        size_var,
                        profit_percent,
                        price_step_inc,
                        stopAtCycle
                    }
                };

                try {
                    const result = await sendConfigToBackend({
                        config: manualConfig, 
                        strategy: side,
                        applyShield: false
                    });

                    if (result && result.success && result.data) {
                        currentBotState.config = result.data;
                        // Sincronización visual inmediata de los controles por si el backend ajustó límites (ej. montos mínimos)
                        updateControlsState(currentBotState);
                    }
                } catch (err) {
                    console.error("❌ Error guardando config:", err);
                }
            }, 1000);
        };

        if (el.type === 'checkbox') {
            el.onchange = handler;
        } else {
            el.oninput = handler;
        }
    });
}

/**
 * Inicializa la vista del Autobot
 */
export async function initializeAutobotView() {
    console.log("🤖 Autobot View: Syncing strategy core...");
    const auOrderList = document.getElementById('au-order-list');
    
    if (configDebounceTimeout) clearTimeout(configDebounceTimeout);

    // Activamos los escuchadores limpios de cambios en inputs
    setupConfigListeners();

    // Sincronizamos la UI con el estado global unificado
    updateBotUI(currentBotState);
    updateControlsState(currentBotState);

    // Inicializamos el gráfico de TradingView de manera aislada
    const chartContainer = document.getElementById('au-tvchart');
    if (chartContainer) {
        setTimeout(() => {
            if (window.currentChart) {
                try { 
                    window.currentChart.remove(); 
                    window.currentChart = null;
                } catch(e) { console.warn("Chart removal mitigation:", e); }
            }
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }, 300);
    }

    if (auOrderList) {
        setupOrderTabs(auOrderList);
    }
}

/**
 * Controla el filtrado dinámico de órdenes para el Autobot
 */
function setupOrderTabs(container) {
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    if (!orderTabs.length || !container) return;

    const setActiveTabStyle = (selectedId) => {
        orderTabs.forEach(btn => {
            btn.classList.remove('text-emerald-500', 'bg-gray-800');
            btn.classList.add('text-gray-500');
            if (btn.id === selectedId) {
                btn.classList.remove('text-gray-500');
                btn.classList.add('text-emerald-500', 'bg-gray-800');
            }
        });
    };

    orderTabs.forEach(tab => {
        tab.onclick = null; // Limpieza preventiva antes de asignar
        tab.onclick = (e) => {
            const btn = e.currentTarget;
            const strategy = btn.getAttribute('data-strategy') || 'all';
            setActiveTabStyle(btn.id);
            currentStrategyTab = strategy;
            fetchOrders(strategy, container);
        };
    });

    // Estado inicial por defecto de la sub-navegación
    setActiveTabStyle('tab-all-strategies');
    fetchOrders('all', container);
}