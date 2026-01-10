// public/js/modules/aibot.js

import { socket } from '../main.js';

/**
 * Función principal que arranca la lógica de la pestaña
 */
export function initializeAibotView() {
    console.log("🚀 Sistema IA: Inicializando interfaz...");
    setupAISocketListeners();
    setupAIControls();
    loadInitialAIHistory();
}

/**
 * Configura los "oídos" del sistema para recibir datos del servidor en tiempo real
 */
function setupAISocketListeners() {
    // Escucha actualizaciones de análisis (ADX, Stoch, Confianza)
    socket.on('ai-decision-update', (data) => {
        updateAIUI(data);
    });

    // Escucha cuando la IA ejecuta una operación virtual
    socket.on('ai-order-executed', (data) => {
        updateAIBalance(data);
        addTradeToLog(data);
        appendOrderToTable(data);
        playNeuralSound(data.side); // Toca el pitido
    });

    // Escucha cambios de estado (si el servidor lo apaga por seguridad)
    socket.on('ai-status-update', (data) => {
        const btn = document.getElementById('btn-start-ai');
        if (btn) setBtnUI(btn, data.isRunning);
    });
}

/**
 * Actualiza los medidores de confianza y mensajes de predicción
 */
function updateAIUI(data) {
    const confidenceEl = document.getElementById('ai-confidence-value');
    const predictionText = document.getElementById('ai-prediction-text');
    const logContainer = document.getElementById('ai-log-container');

    if (confidenceEl) {
        const value = (data.confidence * 100).toFixed(1);
        confidenceEl.textContent = `${value}%`;
        
        // Colores según el riesgo detectado
        if (value > 80) confidenceEl.className = 'text-3xl font-bold text-emerald-500 font-mono';
        else if (value < 40) confidenceEl.className = 'text-3xl font-bold text-red-500 font-mono';
        else confidenceEl.className = 'text-3xl font-bold text-blue-500 font-mono';
    }

    if (predictionText) {
        predictionText.textContent = data.message || "Analizando mercado...";
    }

    if (logContainer && data.message) {
        const log = document.createElement('div');
        log.className = 'text-gray-400 border-l border-blue-900 pl-2 mb-1 text-[10px]';
        log.innerHTML = `<span class="text-blue-700">[${new Date().toLocaleTimeString()}]</span> ${data.message}`;
        logContainer.prepend(log);
        if (logContainer.childNodes.length > 50) logContainer.lastChild.remove();
    }
}

/**
 * Actualiza el saldo virtual en pantalla
 */
function updateAIBalance(data) {
    const balanceEl = document.getElementById('ai-virtual-balance') || document.querySelector('.text-emerald-400.font-mono');
    if (balanceEl && data.currentVirtualBalance !== undefined) {
        balanceEl.textContent = `$${data.currentVirtualBalance.toLocaleString('en-US', {minimumFractionDigits: 2})} USDT`;
    }
}

/**
 * Registra la operación en la terminal negra
 */
function addTradeToLog(data) {
    const logContainer = document.getElementById('ai-log-container');
    if (logContainer) {
        const tradeLog = document.createElement('div');
        const color = data.side === 'BUY' ? 'text-emerald-400' : 'text-orange-400';
        tradeLog.className = `${color} font-bold border-l-2 border-white pl-2 my-1 animate-pulse`;
        tradeLog.innerHTML = `[SISTEMA] OPERACIÓN ${data.side} @ ${data.price} | PNL: ${data.pnlLastTrade || 0}`;
        logContainer.prepend(tradeLog);
    }
}

/**
 * Configura el botón de Activación / Desactivación
 */
async function setupAIControls() {
    const btn = document.getElementById('btn-start-ai');
    const logContainer = document.getElementById('ai-log-container');
    const balanceEl = document.getElementById('ai-virtual-balance') || document.querySelector('.text-emerald-400.font-mono');
    
    if (!btn) return;

    // Verificar estado real al entrar
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/ai/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const state = await response.json();
        setBtnUI(btn, state.isRunning);
    } catch (err) {
        console.error("Error obteniendo estado inicial:", err);
    }

    // Lógica del clic
    btn.addEventListener('click', async () => {
        const token = localStorage.getItem('token');
        const isCurrentlyRunning = btn.textContent.includes("DETENER");
        const action = isCurrentlyRunning ? 'stop' : 'start';

        btn.disabled = true;
        btn.textContent = isCurrentlyRunning ? "DESACTIVANDO..." : "INICIALIZANDO...";

        try {
            const response = await fetch('/api/ai/toggle', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action: action })
            });

            const result = await response.json();

            if (result.success) {
                setBtnUI(btn, result.isRunning);
                
                // Mostrar mensaje en el Log
                const statusMsg = document.createElement('div');
                const timestamp = new Date().toLocaleTimeString();
                
                if (result.isRunning) {
                    const currentBal = balanceEl ? balanceEl.textContent : "$---";
                    statusMsg.className = 'text-emerald-500 font-bold border-l-2 border-emerald-500 pl-2 mt-2 bg-emerald-500/5 py-1 text-[10px]';
                    statusMsg.innerHTML = `[${timestamp}] 🚀 NÚCLEO IA: ONLINE<br>💰 SALDO DE INICIO: ${currentBal}`;
                } else {
                    statusMsg.className = 'text-red-500 font-bold border-l-2 border-red-500 pl-2 mt-2 bg-red-500/5 py-1 text-[10px]';
                    statusMsg.innerHTML = `[${timestamp}] 🛑 NÚCLEO IA: OFFLINE (DETENIDO)`;
                }

                if (logContainer) logContainer.prepend(statusMsg);
            }
        } catch (err) {
            console.error("Error toggle:", err);
            btn.textContent = "ERROR DE SISTEMA";
        } finally {
            btn.disabled = false;
        }
    });
}

/**
 * Cambia visualmente el botón según el estado
 */
function setBtnUI(btn, isRunning) {
    if (isRunning) {
        btn.textContent = "DETENER NÚCLEO IA";
        btn.className = "w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold shadow-lg shadow-red-900/40 transition-all active:scale-95 cursor-pointer";
    } else {
        btn.textContent = "ACTIVAR NÚCLEO IA";
        btn.className = "w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg shadow-blue-900/40 transition-all active:scale-95 cursor-pointer";
    }
}

/**
 * Carga las últimas 10 operaciones guardadas en la base de datos
 */
async function loadInitialAIHistory() {
    const tableBody = document.getElementById('ai-history-table-body');
    const token = localStorage.getItem('token');
    try {
        const response = await fetch('/api/ai/history', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const history = await response.json();
        if (tableBody && history.length > 0) {
            tableBody.innerHTML = '';
            history.forEach(order => appendOrderToTable(order));
        }
    } catch (err) { console.error("Error historial:", err); }
}

/**
 * Agrega una fila nueva a la tabla de historial
 */
function appendOrderToTable(order) {
    const tableBody = document.getElementById('ai-history-table-body');
    if (!tableBody) return;
    if (tableBody.innerText.includes("Esperando")) tableBody.innerHTML = '';

    const row = document.createElement('tr');
    row.className = 'hover:bg-blue-500/5 transition-colors border-b border-gray-800/30';
    
    const time = new Date(order.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sideClass = order.side === 'BUY' ? 'text-emerald-400' : 'text-orange-400';
    
    row.innerHTML = `
        <td class="px-4 py-3 text-gray-500">${time}</td>
        <td class="px-4 py-3 font-bold ${sideClass}">${order.side}</td>
        <td class="px-4 py-3 text-right text-gray-300">$${parseFloat(order.price).toLocaleString()}</td>
        <td class="px-4 py-3 text-right text-gray-400">${parseFloat(order.amount).toFixed(2)}</td>
        <td class="px-4 py-3 text-center">
            <span class="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 text-[9px]">
                ${order.confidenceScore || 0}%
            </span>
        </td>
    `;
    tableBody.prepend(row);
    if (tableBody.children.length > 10) tableBody.lastElementChild.remove();
}

/**
 * Genera el sonido Cyberpunk (Compra/Venta)
 */
function playNeuralSound(type) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'BUY') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
            oscillator.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.1);
        } else {
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); 
            oscillator.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.1);
        }

        gainNode.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) { console.log("Audio en espera de interacción"); }
}