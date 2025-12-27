// BSB/public/js/modules/dashboard.js (FINAL)

// 🛑 ELIMINADA LA IMPORTACIÓN DE checkBitMartConnectionAndData
import { fetchEquityCurveData, fetchCycleKpis } from './apiService.js'; 
import { renderEquityCurve } from './chart.js';
// Usamos el socket principal y otras variables de main.js
import { intervals, SOCKET_SERVER_URL, socket } from '../main.js'; 

// 🛑 NUEVA VARIABLE GLOBAL para almacenar los datos brutos de la curva
let cycleHistoryData = []; 
let currentChartParameter = 'accumulatedProfit'; // Parámetro inicial por defecto

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

// =========================================================================
// 🛑 FUNCIÓN: Manejo del Selector de Parámetros de la Gráfica
// =========================================================================

/**
 * Configura el listener para el selector de parámetros de la Curva de Crecimiento.
 */
function setupChartSelectorListener() {
    const selector = document.getElementById('chart-param-selector');
    if (selector) {
        selector.addEventListener('change', (event) => {
            currentChartParameter = event.target.value;
            if (cycleHistoryData.length > 0) {
                // Llama a la función de renderizado con el parámetro seleccionado
                renderEquityCurve(cycleHistoryData, currentChartParameter); 
            } else {
                console.warn("Datos de historial de ciclos aún no disponibles para renderizar el gráfico.");
            }
        });
    }
}


// =========================================================================
// 🚀 FUNCIÓN: LISTENERS DE SOCKET.IO
// =========================================================================

/**
 * Inicializa los listeners de Socket.IO para el Dashboard y actualiza las métricas.
 */
function setupSocketListeners() {
    if (!socket) {
        console.error("El socket principal no está disponible en dashboard.js.");
        return;
    }

    socket.on('connect', () => {
        console.log("Conectado al Socket.IO para actualizaciones del Dashboard.");
    });
    
    // 1. Maneja la actualización de las MÉTRICAS CLAVE del AUTOBOT
    socket.on('autobot-metrics-update', (metrics) => {
        console.log("Métricas del Autobot recibidas:", metrics);
        
        // Actualización de Profit y Precio
        const profitEl = document.getElementById('auprofit');
        if (profitEl && metrics.unrealizedProfit !== undefined) {
             const profitValue = parseFloat(metrics.unrealizedProfit).toFixed(2);
             profitEl.textContent = profitValue;
             profitEl.className = `${profitValue >= 0 ? 'text-green-400' : 'text-red-400'}`;
        }
        document.getElementById('auprice').textContent = parseFloat(metrics.currentPrice || 0).toFixed(2);
        
        // Actualización de Balances Lógico/Asignado (El balance principal 'aubalance' necesita más contexto)
        // Usamos totalAssignedBalance si existe, sino mantenemos lo que el balance-update envió
        const totalBalanceEl = document.getElementById('aubalance');
        if (totalBalanceEl && metrics.totalAssignedBalance !== undefined) {
             totalBalanceEl.textContent = parseFloat(metrics.totalAssignedBalance).toFixed(2);
        }

        document.getElementById('aulbalance').textContent = parseFloat(metrics.longBalance || 0).toFixed(2);
        document.getElementById('ausbalance').textContent = parseFloat(metrics.shortBalance || 0).toFixed(2);
        
        // Actualización de Ciclos (asumiendo LCycle y SCycle vienen en el payload)
        document.getElementById('aulcycle').textContent = metrics.LCycle || 0;
        document.getElementById('auscycle').textContent = metrics.SCycle || 0;

        // Actualización de estados del Bot
        const lstateEl = document.getElementById('aubot-lstate');
        const sstateEl = document.getElementById('aubot-sstate');
        
        if (lstateEl) {
            lstateEl.textContent = (metrics.longState || 'STOPPED').toUpperCase();
            lstateEl.className = getStateColorClass(metrics.longState || 'STOPPED');
        }
        if (sstateEl) {
            sstateEl.textContent = (metrics.shortState || 'STOPPED').toUpperCase();
            sstateEl.className = getStateColorClass(metrics.shortState || 'STOPPED');
        }

        // Actualización del punto de conexión (asumiendo 'isRunning' es el estado general del bot)
        const statusDot = document.getElementById('status-dot');
        if (statusDot) {
            statusDot.classList.remove('bg-red-500', 'bg-green-500');
            statusDot.classList.add(metrics.isRunning ? 'bg-green-500' : 'bg-red-500');
        }
    });

    // Listener para Balances Generales (si es necesario actualizar aubalance con más detalle)
    socket.on('balance-update', (balances) => {
        const totalBalanceEl = document.getElementById('aubalance');
        if (totalBalanceEl) {
            // Esto actualiza el balance general del exchange
            const usdtValue = parseFloat(balances.lastAvailableUSDT || 0).toFixed(2);
            const btcValue = parseFloat(balances.lastAvailableBTC || 0).toFixed(5);
            totalBalanceEl.textContent = `USDT: ${usdtValue} | BTC: ${btcValue}`;
        }
    });


    // 2. Maneja la actualización de las MÉTRICAS CLAVE del AIBot (Deshabilitado, pero con estructura)
    socket.on('aibot-metrics-update', (metrics) => {
        // console.log("Métricas del AIBot recibidas:", metrics);
        // Implementación pendiente para AIBot (usando aiprofit, ailbalance, aibot-lstate, etc.)
    });

    // 3. Actualización de Curva (Si se cierra un ciclo)
    socket.on('cycle-closed', () => {
        // Cuando un ciclo se cierra, recargamos la curva y los KPIs
        loadAndRenderEquityCurve();
        loadAndDisplayKpis();
    });
}

// =========================================================================
// 🚀 FUNCIÓN: INICIALIZACIÓN DE VISTA Y CARGA DE DATOS
// =========================================================================

export function initializeDashboardView() {
    console.log("Inicializando vista del Dashboard...");
    
    // 1. Establecer los listeners de Socket.IO para las actualizaciones en tiempo real
    setupSocketListeners(); 
    
    // 2. Ejecuta la carga de datos pesados en PARALELO para ahorrar tiempo
    Promise.all([
        loadAndRenderEquityCurve(),
        loadAndDisplayKpis() 
    ]).then(() => {
        console.log('Dashboard: Curva y KPIs cargados en paralelo.');
        // 🛑 Importante: Configurar el listener del selector una vez que los datos iniciales se hayan intentado cargar
        setupChartSelectorListener(); 
    }).catch(error => {
        console.error('Error al cargar datos del Dashboard:', error);
    });
}

/**
 * Carga y muestra los KPIs del ciclo en las tarjetas del dashboard.
 */
async function loadAndDisplayKpis() {
    try {
        const kpis = await fetchCycleKpis();
        
        console.log("Datos KPI recibidos:", kpis); 

        const profitPercentageElement = document.getElementById('cycle-avg-profit'); 
        const totalCyclesElement = document.getElementById('total-cycles-closed'); 

        // Asumimos que kpis es un objeto { averageProfitPercentage, totalCycles }
        const totalCycles = kpis.totalCycles || 0;
        const avgProfit = kpis.averageProfitPercentage || 0;

        if (profitPercentageElement) {
            // Muestra el rendimiento promedio redondeado con el símbolo %
            profitPercentageElement.textContent = `${avgProfit.toFixed(2)} %`;
        }
        
        if (totalCyclesElement) {
            // Muestra el número total de ciclos
            totalCyclesElement.textContent = totalCycles;
        }

        console.log(`KPIs de ciclos cargados. Rendimiento promedio: ${avgProfit}%.`);
    } catch (error) {
        console.error("Error en la carga y renderizado de KPIs:", error);
    }
}

/**
 * Orquesta la obtención y el renderizado de la Curva de Crecimiento.
 * MODIFICADO: Almacena los datos y usa el parámetro de la gráfica actual.
 */
async function loadAndRenderEquityCurve() {
    try {
        const curveData = await fetchEquityCurveData();
        
        if (curveData && curveData.length > 0) {
            // 🛑 1. ALMACENAR DATOS GLOBALES
            cycleHistoryData = curveData; 

            // 🛑 2. USAR EL PARÁMETRO ACTUAL
            if (typeof renderEquityCurve === 'function') {
                renderEquityCurve(cycleHistoryData, currentChartParameter); 
                console.log('Curva de Crecimiento renderizada.');
            } else {
                console.error("La función renderEquityCurve no está definida en chart.js o no fue importada correctamente.");
            }
        } else {
            console.warn('No hay datos suficientes de ciclos cerrados para renderizar la Curva de Crecimiento.');
        }
    } catch (error) {
        console.error("Error en la carga y renderizado de la curva:", error);
    }
}