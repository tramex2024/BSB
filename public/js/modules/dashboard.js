import { fetchEquityCurveData, fetchCycleKpis } from './apiService.js'; 
import { renderEquityCurve } from './chart.js';
import { socket } from '../main.js'; 

let cycleHistoryData = []; 
let currentChartParameter = 'accumulatedProfit'; 

export function initializeDashboardView() {
    setupSocketListeners();
    setupAutobotButtonListeners();
    setupChartSelector();
    
    // Cargas iniciales de datos históricos
    loadAndRenderEquityCurve();
    loadAndDisplayKpis();
}

// --- EVENTOS DE INTERFAZ ---
function setupAutobotButtonListeners() {
    const startBtn = document.getElementById('austart-btn');
    const resetBtn = document.getElementById('aureset-btn');

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            // Verificamos el texto para decidir la acción
            const isRunning = startBtn.textContent.includes('STOP');
            if (isRunning) {
                socket.emit('stop-autobot');
            } else {
                // Al arrancar desde el dashboard, se asume configuración por defecto o guardada
                socket.emit('start-autobot', { longEnabled: true, shortEnabled: true });
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm("⚠️ ¿Deseas resetear el ciclo actual? Se borrarán promedios e histórico local de esta sesión.")) {
                socket.emit('reset-autobot-cycle');
            }
        });
    }
}

function setupChartSelector() {
    const selector = document.getElementById('chart-param-selector');
    if (selector) {
        selector.addEventListener('change', (e) => {
            currentChartParameter = e.target.value;
            // Solo renderizar si tenemos datos para evitar errores de Chart.js
            if (cycleHistoryData && cycleHistoryData.length > 0) {
                renderEquityCurve(cycleHistoryData, currentChartParameter);
            }
        });
    }
}

// --- SOCKETS (Actualizaciones en Tiempo Real) ---
function setupSocketListeners() {
    if (!socket) return;

    socket.on('bot-state-update', (state) => {
        // 1. Actualización de Profit Total con color dinámico
        const profitEl = document.getElementById('auprofit');
        if (profitEl && state.total_profit !== undefined) {
            const val = parseFloat(state.total_profit);
            profitEl.textContent = `${val >= 0 ? '+' : '-'}$${Math.abs(val).toFixed(2)}`;
            profitEl.className = `text-2xl font-mono font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
        }

        // 2. Estados de las estrategias Long y Short
        updateElementText('aubot-lstate', state.lstate, state.lstate === 'STOPPED' ? 'font-bold text-red-400' : 'font-bold text-emerald-400');
        updateElementText('aubot-sstate', state.sstate, state.sstate === 'STOPPED' ? 'font-bold text-red-400' : 'font-bold text-emerald-400');

        // 3. Contadores de ciclos y balances de margen
        updateElementText('aulcycle', state.lcycle);
        updateElementText('auscycle', state.scycle);
        updateElementText('aulbalance', state.lbalance?.toFixed(2));
        updateElementText('ausbalance', state.sbalance?.toFixed(2));

        // 4. Transformación del botón START/STOP
        const startBtn = document.getElementById('austart-btn');
        if (startBtn) {
            const isAnyRunning = state.lstate !== 'STOPPED' || state.sstate !== 'STOPPED';
            startBtn.textContent = isAnyRunning ? 'STOP' : 'START';
            startBtn.className = isAnyRunning 
                ? 'flex-1 bg-orange-600 hover:bg-orange-700 py-3 rounded-xl font-bold transition-all shadow-lg shadow-orange-900/20' 
                : 'flex-1 bg-emerald-600 hover:bg-emerald-700 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20';
        }

        // 5. Gestión del botón Reset (Solo habilitado si el bot está detenido)
        const resetBtn = document.getElementById('aureset-btn');
        if (resetBtn) {
            const canReset = state.lstate === 'STOPPED' && state.sstate === 'STOPPED';
            resetBtn.disabled = !canReset;
            resetBtn.className = canReset 
                ? 'w-24 bg-gray-600 hover:bg-red-600 py-3 rounded-xl font-bold transition-all'
                : 'w-24 bg-gray-800 opacity-30 py-3 rounded-xl font-bold cursor-not-allowed';
        }
    });

    // Recargar gráficos cuando se cierra un ciclo de trading
    socket.on('cycle-closed', () => {
        loadAndRenderEquityCurve();
        loadAndDisplayKpis();
    });
}

// --- CARGA DE DATOS DESDE API ---
async function loadAndDisplayKpis() {
    try {
        const kpis = await fetchCycleKpis();
        const avgVal = kpis.averageProfitPercentage || 0;
        
        // Actualizamos el promedio de rendimiento con color semafórico
        updateElementText('cycle-avg-profit', 
            `${avgVal >= 0 ? '+' : ''}${avgVal.toFixed(2)}%`, 
            avgVal >= 0 ? 'text-xl font-bold text-yellow-500' : 'text-xl font-bold text-red-500'
        );
        updateElementText('total-cycles-closed', kpis.totalCycles || 0);
    } catch (e) { 
        console.error("Error cargando KPIs:", e); 
    }
}

async function loadAndRenderEquityCurve() {
    try {
        const curveData = await fetchEquityCurveData();
        if (curveData && Array.isArray(curveData) && curveData.length > 0) {
            cycleHistoryData = curveData;
            renderEquityCurve(cycleHistoryData, currentChartParameter);
        } else {
            // Caso: Sin historial todavía
            console.log("No hay datos de ciclos suficientes para el gráfico.");
        }
    } catch (e) { 
        console.error("Error cargando curva de capital:", e); 
    }
}

/**
 * Función auxiliar para actualizar texto y clases de forma segura
 */
function updateElementText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el && text !== undefined && text !== null) {
        el.textContent = text;
        if (className) el.className = className;
    }
}