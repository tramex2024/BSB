// BSB/public/js/modules/dashboard.js

import { fetchEquityCurveData, fetchCycleKpis } from './apiService.js'; 
import { renderEquityCurve } from './chart.js';
import { socket } from '../main.js'; 

let cycleHistoryData = []; 
let currentChartParameter = 'accumulatedProfit'; 

// =========================================================================
// 🚀 EVENTOS DE BOTONES DEL AUTOBOT
// =========================================================================

/**
 * Conecta los botones START y RESET de tu HTML con el servidor.
 */
function setupAutobotButtonListeners() {
    const startBtn = document.getElementById('austart-btn');
    const resetBtn = document.getElementById('aureset-btn');

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            // Enviamos la orden de encender el Autobot al servidor
            socket.emit('update-autobot-config', { 
                longEnabled: true, 
                shortEnabled: true 
            });
            console.log("🚀 Solicitud de START enviada al servidor.");
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm("⚠️ ¿Deseas resetear el ciclo del Autobot? Se borrarán los promedios y el conteo actual.")) {
                socket.emit('reset-autobot-cycle');
            }
        });
    }
}

// =========================================================================
// 📡 ACTUALIZACIONES EN TIEMPO REAL (SOCKET.IO)
// =========================================================================

function setupSocketListeners() {
    if (!socket) return;

    // 1. ESCUCHA EL ESTADO DEL BOT (Emitido por autobotLogic.js)
    socket.on('bot-state-update', (state) => {
        
        // Actualizar Profit y color
        const profitEl = document.getElementById('auprofit');
        if (profitEl) {
            const val = parseFloat(state.lprofit || 0).toFixed(2);
            profitEl.textContent = val;
            profitEl.className = val >= 0 ? 'text-green-400' : 'text-red-400';
        }

        // Actualizar Balances de Estrategia
        if (document.getElementById('aulbalance')) 
            document.getElementById('aulbalance').textContent = parseFloat(state.lbalance || 0).toFixed(2);
        if (document.getElementById('ausbalance')) 
            document.getElementById('ausbalance').textContent = parseFloat(state.sbalance || 0).toFixed(2);
        
        // Actualizar Contadores de Ciclo
        if (document.getElementById('aulcycle')) 
            document.getElementById('aulcycle').textContent = state.lcycle || 0;
        if (document.getElementById('auscycle')) 
            document.getElementById('auscycle').textContent = state.scycle || 0;

        // Actualizar Etiquetas de Estado (LState / SState)
        const lstateEl = document.getElementById('aubot-lstate');
        const sstateEl = document.getElementById('aubot-sstate');
        
        if (lstateEl) {
            lstateEl.textContent = state.lstate;
            lstateEl.className = (state.lstate === 'STOPPED') ? 'text-red-400' : 'text-green-400';
        }
        if (sstateEl) {
            sstateEl.textContent = state.sstate;
            sstateEl.className = (state.sstate === 'STOPPED') ? 'text-red-400' : 'text-green-400';
        }

        // Control de seguridad del botón RESET
        const resetBtn = document.getElementById('aureset-btn');
        if (resetBtn) {
            // Solo habilitar reset si el bot está detenido
            resetBtn.disabled = (state.lstate !== 'STOPPED');
            resetBtn.style.opacity = resetBtn.disabled ? "0.5" : "1";
            resetBtn.style.cursor = resetBtn.disabled ? "not-allowed" : "pointer";
        }
    });

    // 2. ESCUCHA EL PRECIO (Market Data)
    socket.on('marketData', (data) => {
        const priceEl = document.getElementById('auprice');
        if (priceEl) {
            priceEl.textContent = parseFloat(data.price).toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            });
        }
    });

    // 3. ESCUCHA BALANCES REALES Y ESTADO DE CONEXIÓN
    socket.on('balance-real-update', (data) => {
        const balanceEl = document.getElementById('aubalance');
        if (balanceEl) balanceEl.textContent = parseFloat(data.lastAvailableUSDT).toFixed(2);

        // Actualizar "Bolita" de estado (en el header o donde esté el ID status-dot)
        const dot = document.getElementById('status-dot');
        if (dot) {
            dot.className = `h-3 w-3 rounded-full ${data.source === 'API_SUCCESS' ? 'bg-green-500' : 'bg-purple-500'}`;
        }
    });

    // 4. RECARGA DE GRÁFICA CUANDO SE CIERRA UN CICLO
    socket.on('cycle-closed', () => {
        loadAndRenderEquityCurve();
        loadAndDisplayKpis();
    });
}

// =========================================================================
// 🚀 CARGA DE DATOS E INICIALIZACIÓN
// =========================================================================

export function initializeDashboardView() {
    setupSocketListeners();
    setupAutobotButtonListeners();
    
    // Configurar el selector de parámetros de la gráfica
    const selector = document.getElementById('chart-param-selector');
    if (selector) {
        selector.addEventListener('change', (e) => {
            currentChartParameter = e.target.value;
            if (cycleHistoryData.length > 0) {
                renderEquityCurve(cycleHistoryData, currentChartParameter);
            }
        });
    }

    // Cargas iniciales de API
    loadAndRenderEquityCurve();
    loadAndDisplayKpis();
}

async function loadAndDisplayKpis() {
    try {
        const kpis = await fetchCycleKpis();
        const avgProfitEl = document.getElementById('cycle-avg-profit');
        const totalCyclesEl = document.getElementById('total-cycles-closed');

        if (avgProfitEl) avgProfitEl.textContent = `${(kpis.averageProfitPercentage || 0).toFixed(2)} %`;
        if (totalCyclesEl) totalCyclesEl.textContent = kpis.totalCycles || 0;
    } catch (e) {
        console.error("Error cargando KPIs:", e);
    }
}

async function loadAndRenderEquityCurve() {
    try {
        const curveData = await fetchEquityCurveData();
        if (curveData && curveData.length > 0) {
            cycleHistoryData = curveData;
            renderEquityCurve(cycleHistoryData, currentChartParameter);
        }
    } catch (e) {
        console.error("Error cargando curva:", e);
    }
}