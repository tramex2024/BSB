// public/js/modules/dashboard.js (Actualizado para el nuevo flujo de Balance/WS)

// 🛑 ELIMINADA LA IMPORTACIÓN DE getBalances (Ya no se hace polling)
import { checkBitMartConnectionAndData } from './network.js';
import { fetchEquityCurveData, fetchCycleKpis } from './apiService.js'; 
import { renderEquityCurve } from './chart.js';
// 💡 AHORA IMPORTAMOS DIRECTAMENTE LA INSTANCIA DE SOCKET CREADA EN main.js
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
 * Inicializa los listeners de Socket.IO para el Dashboard.
 *
 * NOTA CRÍTICA: Ahora usa la instancia de socket exportada de main.js, asegurando
 * que solo haya una conexión activa para toda la aplicación.
 */
function setupSocketListeners() {
    // 🛑 VERIFICACIÓN: Nos aseguramos de que la instancia global exista
    if (!socket) {
        console.error("La instancia global de Socket.IO no está disponible.");
        return;
    }
    
    // 🛑 ELIMINADA: La línea 'const socket = io(SOCKET_SERVER_URL);' ya no es necesaria.
    
    // 1. Maneja la actualización de Balance Real (USDT/BTC disponible)
    // Este listener se mantiene por si el backend no lo maneja directamente.
    socket.on('balance-real-update', (data) => {
        // Lógica de visualización del balance Real (si aplica)
    });

    // 2. Maneja la actualización de las MÉTRICAS CLAVE del Autobot (Lógico/Asignado, Profit, Estados)
    socket.on('bot-state-update', (metrics) => {
        console.log("Métricas del Autobot recibidas:", metrics);
        
        // Actualización de balances Lógico/Asignado
        document.getElementById('aubalance').textContent = metrics.totalAssignedBalance.toFixed(2);
        document.getElementById('aulbalance').textContent = metrics.longBalance.toFixed(2);
        document.getElementById('ausbalance').textContent = metrics.shortBalance.toFixed(2);
        
        // Actualización de ciclos
        document.getElementById('aulcycle').textContent = metrics.longCycleCount;
        document.getElementById('auscycle').textContent = metrics.shortCycleCount;
        
        // Actualización de Profit y Precio
        document.getElementById('auprofit').textContent = metrics.unrealizedProfit.toFixed(2);
        document.getElementById('auprice').textContent = metrics.currentPrice.toFixed(2);
        
        // Actualización de estados del Bot
        const lstateEl = document.getElementById('aubot-lstate');
        const sstateEl = document.getElementById('aubot-sstate');
        
        if (lstateEl) {
            lstateEl.textContent = metrics.longState.toUpperCase();
            lstateEl.className = getStateColorClass(metrics.longState);
        }
        if (sstateEl) {
            sstateEl.textContent = metrics.shortState.toUpperCase();
            sstateEl.className = getStateColorClass(metrics.shortState);
        }

        // Actualización del punto de conexión
        const statusDot = document.getElementById('status-dot');
        if (statusDot) {
            statusDot.classList.remove('bg-red-500', 'bg-green-500');
            statusDot.classList.add(metrics.isRunning ? 'bg-green-500' : 'bg-red-500');
        }
    });

    // 3. Maneja la actualización de las MÉTRICAS CLAVE del AIBot
    socket.on('aibot-metrics-update', (metrics) => {
        console.log("Métricas del AIBot recibidas:", metrics);
        
        // Actualización de Profit
        document.getElementById('aiprofit').textContent = metrics.unrealizedProfit.toFixed(2);
        
        // Actualización de estados del Bot
        const lstateEl = document.getElementById('aibot-lstate');
        const sstateEl = document.getElementById('aibot-sstate');
        
        if (lstateEl) {
            lstateEl.textContent = metrics.longState.toUpperCase();
            lstateEl.className = getStateColorClass(metrics.longState);
        }
        if (sstateEl) {
            sstateEl.textContent = metrics.shortState.toUpperCase();
            sstateEl.className = getStateColorClass(metrics.shortState);
        }

        // Actualización de Balances
        document.getElementById('ailbalance').textContent = metrics.longBalance.toFixed(2);
        document.getElementById('aisbalance').textContent = metrics.shortBalance.toFixed(2);
        
        // Actualización del punto de conexión
        const statusDot = document.getElementById('ai-status-dot');
        if (statusDot) {
            statusDot.classList.remove('bg-red-500', 'bg-green-500');
            statusDot.classList.add(metrics.isRunning ? 'bg-green-500' : 'bg-red-500');
        }
    });

    // 4. Actualización de Curva (Si se cierra un ciclo)
    socket.on('cycle-closed', () => {
        // Cuando un ciclo se cierra, recargamos la curva y los KPIs
        loadAndRenderEquityCurve();
        loadAndDisplayKpis();
    });
}

export function initializeDashboardView() {
    console.log("Inicializando vista del Dashboard...");
    
    // 1. Cargar datos básicos y establecer intervalo para balances (MENOS CRÍTICOS)
    // Solo dejamos la comprobación de conexión/datos que puede ser una llamada REST inicial si es necesario.
    checkBitMartConnectionAndData(); 

    // 2. Establecer los listeners de Socket.IO para las actualizaciones en tiempo real
    // ESTO AHORA USA EL SOCKET GLOBAL
    setupSocketListeners(); 

    // 3. Cargar y renderizar la Curva de Crecimiento
    loadAndRenderEquityCurve();

    // 4. Cargar y mostrar los KPIs
    loadAndDisplayKpis(); 
}

/**
 * Carga y muestra los KPIs del ciclo en las tarjetas del dashboard.
 */
async function loadAndDisplayKpis() {
    // Aquí es donde se llama a la función importada
    const kpis = await fetchCycleKpis();
    
    // Los IDs ya se adaptaron en el HTML previamente:
    const profitPercentageElement = document.getElementById('cycle-avg-profit'); 
    const totalCyclesElement = document.getElementById('total-cycles-closed'); 

    if (profitPercentageElement) {
        // Muestra el rendimiento promedio redondeado con el símbolo %
        // Se asume que kpis.averageProfitPercentage es un número (ej. 0.85)
        profitPercentageElement.textContent = `${kpis.averageProfitPercentage.toFixed(2)} %`;
    }
    
    if (totalCyclesElement) {
        // Muestra el número total de ciclos
        totalCyclesElement.textContent = kpis.totalCycles;
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
            // Aseguramos que los datos de la curva existen
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