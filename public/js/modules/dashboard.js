// public/js/modules/dashboard.js (FIX: Se añade carga de estado inicial via API)

import { checkBitMartConnectionAndData } from './network.js';
// 🛑 IMPORTANTE: Ahora importamos getBotConfiguration para cargar el estado inicial
import { getBotConfiguration, fetchEquityCurveData, fetchCycleKpis } from './apiService.js'; 
import { renderEquityCurve } from './chart.js';
import { intervals, socket } from '../main.js'; 

/**
 * Mapea los colores para el estado del bot.
 * @param {string} state - El estado recibido (e.g., 'RUNNING', 'STOPPED').
 * @returns {string} - Clase CSS de color.
 */
function getStateColorClass(state) {
    const s = state.toUpperCase();
    if (s.includes('RUNNING') || s.includes('ACTIVE')) return 'text-green-400';
    if (s.includes('PAUSED') || s.includes('WAITING')) return 'text-yellow-400';
    return 'text-red-400';
}

/**
 * Función central para actualizar las métricas del bot en la interfaz del Dashboard.
 * Se llama tanto en la inicialización (vía API) como por el socket.
 * @param {object} metrics - El objeto de estado/métricas del bot.
 */
function updateDashboardMetrics(metrics) {
    if (!metrics) return;

    // 💡 REFUERZO DE ROBUSTEZ: Uso de (metrics.property || 0) para evitar errores.
    
    // Actualización de balances Lógico/Asignado
    document.getElementById('aubalance').textContent = (metrics.totalAssignedBalance || 0).toFixed(2);
    document.getElementById('aulbalance').textContent = (metrics.longBalance || 0).toFixed(2);
    document.getElementById('ausbalance').textContent = (metrics.shortBalance || 0).toFixed(2);
    
    // Actualización de ciclos
    document.getElementById('aulcycle').textContent = metrics.longCycleCount || 0;
    document.getElementById('auscycle').textContent = metrics.shortCycleCount || 0;
    
    // Actualización de Profit y Precio (asumimos que currentPrice sigue en este payload)
    document.getElementById('auprofit').textContent = (metrics.unrealizedProfit || 0).toFixed(2);
    document.getElementById('auprice').textContent = (metrics.currentPrice || 0).toFixed(2);
    
    // Actualización de estados del Bot
    const longState = metrics.longState || 'UNKNOWN';
    const shortState = metrics.shortState || 'UNKNOWN';

    const lstateEl = document.getElementById('aubot-lstate');
    const sstateEl = document.getElementById('aubot-sstate');
    
    if (lstateEl) {
        lstateEl.textContent = longState.toUpperCase();
        lstateEl.className = getStateColorClass(longState);
    }
    if (sstateEl) {
        sstateEl.textContent = shortState.toUpperCase();
        sstateEl.className = getStateColorClass(shortState);
    }

    // Actualización del punto de conexión (indicador general)
    const statusDot = document.getElementById('status-dot');
    if (statusDot) {
        statusDot.classList.remove('bg-red-500', 'bg-green-500');
        // Asumimos que isRunning está presente en el payload
        statusDot.classList.add(metrics.isRunning ? 'bg-green-500' : 'bg-red-500');
    }
}


/**
 * Inicializa los listeners de Socket.IO para el Dashboard.
 */
function setupSocketListeners() {
    if (!socket) {
        console.error("La instancia global de Socket.IO no está disponible.");
        return;
    }
    
    // 1. Maneja la actualización de Balance Real (Exchange/Disponible)
    // Se mantiene la robustez con || 0 para evitar errores.
    socket.on('balance-real-update', (data) => {
        // console.log("[Dashboard] Balance Real actualizado recibido:", data);
        
        const usdtEl = document.getElementById('real-balance-usdt');
        const btcEl = document.getElementById('real-balance-btc');
        
        const availableUSDT = data.availableUSDT || 0;
        const availableBTC = data.availableBTC || 0;

        if (usdtEl) {
            usdtEl.textContent = availableUSDT.toFixed(2);
        }
        if (btcEl) {
            btcEl.textContent = availableBTC.toFixed(5);
        }
    });

    // 2. Maneja la actualización de las MÉTRICAS CLAVE del Autobot (via WebSocket)
    socket.on('bot-state-update', (metrics) => {
        console.log("[Dashboard] Métricas del Autobot (bot-state-update) recibidas:", metrics);
        updateDashboardMetrics(metrics);
    });

    // 3. Maneja la actualización de las MÉTRICAS CLAVE del AIBot (Se mantiene el evento original)
    socket.on('aibot-metrics-update', (metrics) => {
        console.log("Métricas del AIBot recibidas:", metrics);
        
        // Actualización de Profit
        document.getElementById('aiprofit').textContent = (metrics.unrealizedProfit || 0).toFixed(2);
        
        // Actualización de estados del Bot
        const lstateEl = document.getElementById('aibot-lstate');
        const sstateEl = document.getElementById('aibot-sstate');
        
        if (lstateEl) {
            lstateEl.textContent = (metrics.longState || 'UNKNOWN').toUpperCase();
            lstateEl.className = getStateColorClass(metrics.longState);
        }
        if (sstateEl) {
            sstateEl.textContent = (metrics.shortState || 'UNKNOWN').toUpperCase();
            sstateEl.className = getStateColorClass(metrics.shortState);
        }

        // Actualización de Balances
        document.getElementById('ailbalance').textContent = (metrics.longBalance || 0).toFixed(2);
        document.getElementById('aisbalance').textContent = (metrics.shortBalance || 0).toFixed(2);
        
        // Actualización del punto de conexión
        const statusDot = document.getElementById('ai-status-dot');
        if (statusDot) {
            statusDot.classList.remove('bg-red-500', 'bg-green-500');
            statusDot.classList.add(metrics.isRunning ? 'bg-green-500' : 'bg-red-500');
        }
    });

    // 4. Actualización de Curva (Si se cierra un ciclo)
    socket.on('cycle-closed', () => {
        loadAndRenderEquityCurve();
        loadAndDisplayKpis();
    });
}

/**
 * Carga el estado inicial del bot (configuración y métricas) y actualiza la UI.
 * Esto es necesario porque el socket no empuja datos si el bot está detenido.
 */
async function loadInitialBotState() {
    try {
        // getBotConfiguration se utiliza en autobot.js, asumimos que devuelve
        // el estado completo del bot, incluyendo métricas para el dashboard.
        const configAndState = await getBotConfiguration(); 
        
        if (configAndState) {
            console.log("[Dashboard] Estado inicial del bot cargado via API. Actualizando métricas.");
            updateDashboardMetrics(configAndState);
            // NOTA: No necesitamos cargar la configuración aquí, solo las métricas.
        }
    } catch (error) {
        console.error("Error al cargar el estado inicial del bot:", error);
    }
}


export function initializeDashboardView() {
    console.log("Inicializando vista del Dashboard...");
    
    // 1. Carga el estado inicial del bot (el FIX)
    // Esto asegura que la UI tenga datos incluso si el bot está STOPPED.
    loadInitialBotState();

    // 2. Comprobación de conexión y carga de balances reales (REST)
    checkBitMartConnectionAndData(); 

    // 3. Establecer los listeners de Socket.IO para las actualizaciones en tiempo real
    setupSocketListeners(); 

    // 4. Cargar y renderizar la Curva de Crecimiento
    loadAndRenderEquityCurve();

    // 5. Cargar y mostrar los KPIs
    loadAndDisplayKpis(); 
}

/**
 * Carga y muestra los KPIs del ciclo en las tarjetas del dashboard.
 */
async function loadAndDisplayKpis() {
    const kpis = await fetchCycleKpis();
    
    const profitPercentageElement = document.getElementById('cycle-avg-profit'); 
    const totalCyclesElement = document.getElementById('total-cycles-closed'); 

    // 💡 REFUERZO DE ROBUSTEZ: Uso de || 0.00 para los KPIs
    if (profitPercentageElement) {
        // Muestra el rendimiento promedio redondeado con el símbolo %
        profitPercentageElement.textContent = `${(kpis.averageProfitPercentage || 0.00).toFixed(2)} %`;
    }
    
    if (totalCyclesElement) {
        // Muestra el número total de ciclos
        totalCyclesElement.textContent = kpis.totalCycles || 0;
    }

    console.log(`KPIs de ciclos cargados. Rendimiento promedio: ${kpis.averageProfitPercentage}%.`);
}

/**
 * Orquesta la obtención y el renderizado de la Curva de Crecimiento.
 */
async function loadAndRenderEquityCurve() {
    try {
        const curveData = await fetchEquityCurveData();
        
        if (curveData.length > 0) {
            if (typeof renderEquityCurve === 'function') {
                renderEquityCurve(curveData); 
                console.log('Curva de Crecimiento renderizada.');
            } else {
                console.error("La función renderEquityCurve no está definida en chart.js o no fue importada correctamente.");
            }
        } else {
            console.warn('No hay datos suficientes de ciclos cerrados para renderizar la Curva de Crecimiento.');
            // Aquí puedes mostrar un mensaje en el canvas o gráfico.
        }
    } catch (error) {
        console.error("Error en la carga y renderizado de la curva:", error);
    }
}