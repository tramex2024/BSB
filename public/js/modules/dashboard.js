// public/js/modules/dashboard.js

import { fetchEquityCurveData, fetchCycleKpis } from './apiService.js'; 
import { renderEquityCurve } from './chart.js';
import { socket } from '../main.js'; 

let cycleHistoryData = []; 
let currentChartParameter = 'accumulatedProfit'; 

// --- CONFIGURACIÓN DE AUDIO (Notificaciones) ---
const sounds = {
    buy: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'), // Sonido entrada/cobertura
    sell: new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'), // Sonido cierre/ganancia
};
// Volumen moderado para no asustar
Object.values(sounds).forEach(s => s.volume = 0.4);

export function initializeDashboardView() {
    setupSocketListeners();
    setupChartSelector();
    
    // Cargas iniciales de datos históricos y estadísticas
    loadAndRenderEquityCurve();
    loadAndDisplayKpis();

    // Al final de initializeDashboardView()
const testBtn = document.getElementById('test-notification-btn');
if (testBtn) {
    testBtn.addEventListener('click', () => {
        console.log("Botón presionado - Iniciando prueba");

        // 1. Sonido (Cambiamos a una URL de respaldo muy confiable)
        const testAudio = new Audio('https://actions.google.com/sounds/v1/foley/door_bell.ogg');
        testAudio.volume = 1.0;
        testAudio.play()
            .then(() => console.log("Sonido ok"))
            .catch(err => alert("El navegador bloqueó el sonido. Haz clic en la página primero."));

        // 2. Luz (Cambiamos a un estilo directo para que no dependa de Tailwind)
        const precioEl = document.getElementById('auprice');
        if (precioEl) {
            const contenedor = precioEl.parentElement;
            contenedor.style.transition = "all 0.5s";
            contenedor.style.backgroundColor = "#059669"; // Verde esmeralda fuerte
            
            setTimeout(() => {
                contenedor.style.backgroundColor = ""; // Vuelve al color original
            }, 1000);
        } else {
            console.error("No se encontró el elemento con ID 'auprice'");
        }
    });
}


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

// --- SOCKETS (Monitoreo de Salud, Ciclos y Notificaciones) ---
function setupSocketListeners() {
    if (!socket) return;

    // 1. MONITOR DE SALUD: Market WebSocket (Precios)
    socket.on('marketData', () => {
        updateHealthStatus('health-market-ws', 'health-market-ws-text', true);
    });

    // 2. MONITOR DE SALUD: User WebSocket (Órdenes Privadas)
    socket.on('open-orders-update', () => {
        updateHealthStatus('health-user-ws', 'health-user-ws-text', true);
    });

    // 3. MONITOR DE SALUD: Analizador RSI (Señales y Motivos)
    socket.on('market-signal-update', (analysis) => {
        const signalEl = document.getElementById('health-analyzer-signal');
        const reasonEl = document.getElementById('health-analyzer-reason');
        
        if (signalEl) {
            signalEl.textContent = `RSI: ${analysis.currentRSI.toFixed(1)} | ${analysis.action}`;
            // Color dinámico según la señal
            if (analysis.action === 'BUY') signalEl.className = 'text-[9px] font-bold text-emerald-400';
            else if (analysis.action === 'SELL') signalEl.className = 'text-[9px] font-bold text-red-400';
            else signalEl.className = 'text-[9px] font-bold text-blue-400';
        }

        if (reasonEl) {
            reasonEl.textContent = analysis.reason || 'Buscando oportunidad...';
        }
    });

    // 4. NOTIFICACIONES ACTIVAS: Compras y Ventas
    // Este evento debe ser emitido por el backend cuando una orden se llena
    socket.on('order-executed', (order) => {
        if (order.side.toLowerCase() === 'buy') {
            sounds.buy.play().catch(() => console.log("Interacción requerida para audio"));
            flashElement('auprice', 'bg-emerald-500/20'); // Destello verde en precio
        } else {
            sounds.sell.play().catch(() => console.log("Interacción requerida para audio"));
            flashElement('auprice', 'bg-orange-500/20'); // Destello naranja en precio
        }
    });

    // 5. ACTUALIZACIÓN POR CIERRE DE CICLO
    socket.on('cycle-closed', () => {
        console.log("Ciclo cerrado detectado. Actualizando analíticas...");
        sounds.sell.play().catch(() => {});
        flashElement('auprofit', 'bg-yellow-500/30'); // Destello en el profit total
        loadAndRenderEquityCurve();
        loadAndDisplayKpis();
    });

    // Fallback de desconexión
    socket.on('disconnect', () => {
        updateHealthStatus('health-market-ws', 'health-market-ws-text', false);
        updateHealthStatus('health-user-ws', 'health-user-ws-text', false);
    });
}

// --- CARGA DE DATOS DESDE API (Analíticas) ---
async function loadAndDisplayKpis() {
    try {
        const kpis = await fetchCycleKpis();
        if (!kpis) return;

        const avgVal = kpis.averageProfitPercentage || 0;
        
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

// --- FUNCIONES AUXILIARES DE UI ---

/**
 * Actualiza los indicadores visuales del Panel de Salud
 */
function updateHealthStatus(dotId, textId, isOnline) {
    const dot = document.getElementById(dotId);
    const txt = document.getElementById(textId);
    if (dot && txt) {
        dot.className = isOnline ? 'w-2 h-2 rounded-full bg-emerald-500' : 'w-2 h-2 rounded-full bg-red-500 animate-pulse';
        txt.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
        txt.className = isOnline ? 'text-[9px] font-mono text-emerald-500' : 'text-[9px] font-mono text-red-500';
    }
}

/**
 * Genera un efecto visual de parpadeo en un contenedor
 */
function flashElement(id, colorClass) {
    const el = document.getElementById(id);
    if (el && el.parentElement) {
        const parent = el.parentElement;
        parent.classList.add(colorClass, 'transition-colors', 'duration-300');
        setTimeout(() => {
            parent.classList.remove(colorClass);
        }, 1000);
    }
}

/**
 * Actualiza texto y clases de elementos de forma segura
 */
function updateElementText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el && text !== undefined && text !== null) {
        el.textContent = text;
        if (className) el.className = className;
    }
}