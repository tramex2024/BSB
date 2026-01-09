import { fetchEquityCurveData, fetchCycleKpis } from './apiService.js'; 
import { renderEquityCurve } from './chart.js';
import { socket } from '../main.js'; 

let cycleHistoryData = []; 
let currentChartParameter = 'accumulatedProfit'; 

export function initializeDashboardView() {
    setupSocketListeners();
    setupChartSelector();
    
    // Cargas iniciales de datos históricos y estadísticas
    loadAndRenderEquityCurve();
    loadAndDisplayKpis();
}

// --- CONFIGURACIÓN DEL GRÁFICO ---
function setupChartSelector() {
    const selector = document.getElementById('chart-param-selector');
    if (selector) {
        selector.addEventListener('change', (e) => {
            currentChartParameter = e.target.value;
            if (cycleHistoryData && cycleHistoryData.length > 0) {
                renderEquityCurve(cycleHistoryData, currentChartParameter);
            }
        });
    }
}

// --- SOCKETS (Solo para eventos de cierre de ciclo) ---
function setupSocketListeners() {
    if (!socket) return;

    // Cuando el bot cierra un ciclo, refrescamos los gráficos históricos
    socket.on('cycle-closed', () => {
        console.log("Ciclo cerrado detectado. Actualizando analíticas...");
        loadAndRenderEquityCurve();
        loadAndDisplayKpis();
    });

    // Nota: El profit y los estados (LState/SState) ya los actualiza main.js y uiManager.js
    // No añadimos listeners duplicados aquí para evitar parpadeos de color.
}

// --- CARGA DE DATOS DESDE API (Analíticas) ---
async function loadAndDisplayKpis() {
    try {
        const kpis = await fetchCycleKpis();
        if (!kpis) return;

        const avgVal = kpis.averageProfitPercentage || 0;
        
        // Promedio de rendimiento (Color Amarillo/Naranja de Dashboard)
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
        }
    } catch (e) { 
        console.error("Error cargando curva de capital:", e); 
    }
}

/**
 * Función auxiliar para actualizar la UI de forma segura
 */
function updateElementText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el && text !== undefined && text !== null) {
        el.textContent = text;
        if (className) el.className = className;
    }
}