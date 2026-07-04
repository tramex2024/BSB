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
 * Con Actualización Optimista Inmediata [Blindaje 2026]
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
        
        const handler = () => {
            // Registramos la edición activa para mitigar colisiones en tiempo real
            activeEdits[id] = Date.now();

            // Validamos que el input no esté vacío o sea un valor roto antes de proceder
            if (el.type !== 'checkbox' && (el.value === "" || isNaN(parseFloat(el.value)))) return;

            // Identificación atómica del lado (Long / Short)
            const side = id.includes('l') ? 'long' : 'short';
            const s = side === 'long' ? 'l' : 's';

            // Capturamos el valor actual del elemento que disparó el evento
            const rawValue = el.type === 'checkbox' ? el.checked : parseFloat(el.value);

            // =========================================================================
            // 🚀 [BLINDAJE 2026]: MUTACIÓN OPTIMISTA INMEDIATA EN MEMORIA LOCAL
            // Guardamos el cambio en el estado global instantáneamente. Si un tick de
            // WebSocket entra durante el debounce de 1s, leerá este valor actualizado.
            // =========================================================================
            if (!currentBotState.config) currentBotState.config = {};
            if (!currentBotState.config[side]) currentBotState.config[side] = {};

            if (id.includes('amount')) currentBotState.config[side].amountUsdt = rawValue;
            else if (id.includes('purchase')) currentBotState.config[side].purchaseUsdt = rawValue;
            else if (id.includes('trigger')) currentBotState.config[side].price_var = rawValue;
            else if (id.includes('increment')) currentBotState.config[side].size_var = rawValue;
            else if (id.includes('decrement')) currentBotState.config[side].profit_percent = rawValue;
            else if (id.includes('pricestep')) currentBotState.config[side].price_step_inc = rawValue;
            else if (id.includes('stop')) currentBotState.config[side].stopAtCycle = rawValue;

            // --- DEBOUNCE CONTROLADO PARA REDUCIR TRAFICO HTTP A RENDER ---
            if (configDebounceTimeout) clearTimeout(configDebounceTimeout);
            
            configDebounceTimeout = setTimeout(async () => {
                // Recolectamos el set completo de variables asegurando consistencia con la memoria optimista
                const amountUsdt = parseFloat(document.getElementById(`auamount${s}-usdt`)?.value) || currentBotState.config[side]?.amountUsdt || 0;
                const purchaseUsdt = parseFloat(document.getElementById(`aupurchase${s}-usdt`)?.value) || currentBotState.config[side]?.purchaseUsdt || 0;
                const price_var = parseFloat(document.getElementById(`autrigger${s}`)?.value) || currentBotState.config[side]?.price_var || 0;
                const size_var = parseFloat(document.getElementById(`auincrement${s}`)?.value) || currentBotState.config[side]?.size_var || 0;
                const profit_percent = parseFloat(document.getElementById(`audecrement${s}`)?.value) || currentBotState.config[side]?.profit_percent || 0;
                const price_step_inc = parseFloat(document.getElementById(`aupricestep-${s}`)?.value) || currentBotState.config[side]?.price_step_inc || 0;
                const stopAtCycle = document.getElementById(`au-stop-${side}-at-cycle`) ? document.getElementById(`au-stop-${side}-at-cycle`).checked : false;

                // Reconstrucción profunda del payload mezclando el estado maestro
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
                        applyShield: true // Activamos el escudo en el backend si tu API lo soporta
                    });

                    if (result && result.success && result.data) {
                        // Sincronización final tras confirmación del servidor (límites, redondeos, etc.)
                        currentBotState.config = result.data;
                        updateControlsState(currentBotState);
                    }
                } catch (err) {
                    console.error(`❌ Error sincronizando configuración asíncrona [${side}]:`, err);
                }
            }, 1000);
        };

        // Asignación limpia de propiedades directas para evitar fugas de memoria en la SPA
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