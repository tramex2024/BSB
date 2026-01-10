// Archivo: public/js/modules/aibot.js

import { socket } from '../main.js';

export function initializeAibotView() {
    console.log("🚀 Sistema IA: Inicializando interfaz vía WebSockets...");
    setupAISocketListeners();
    setupAIControls();
    loadInitialAIHistory();
}

/**
 * 1. ESCUCHADORES DE EVENTOS (Recibir datos del servidor)
 */
function setupAISocketListeners() {
    // Respuesta inicial de estado (Saldo y si está corriendo)
    socket.on('ai-status-init', (state) => {
        console.log("📊 Estado IA recibido:", state);
        const btn = document.getElementById('btn-start-ai');
        const balanceEl = document.getElementById('ai-virtual-balance');
        
        if (btn) setBtnUI(btn, state.isRunning);
        if (balanceEl && state.virtualBalance !== undefined) {
            balanceEl.textContent = `$${state.virtualBalance.toLocaleString('en-US', {minimumFractionDigits: 2})} USDT`;
        }
    });

    // Actualización de estado (Cuando alguien pulsa el botón)
    socket.on('ai-status-update', (data) => {
        const btn = document.getElementById('btn-start-ai');
        if (btn) {
            setBtnUI(btn, data.isRunning);
            btn.disabled = false; // Reactivar tras el procesamiento
        }
        if (data.virtualBalance !== undefined) {
            updateAIBalance({ currentVirtualBalance: data.virtualBalance });
        }
    });

    // Datos del historial
    socket.on('ai-history-data', (history) => {
        const tableBody = document.getElementById('ai-history-table-body');
        if (tableBody && Array.isArray(history)) {
            tableBody.innerHTML = '';
            history.forEach(order => appendOrderToTable(order));
        }
    });

    // Decisiones en tiempo real del motor
    socket.on('ai-decision-update', (data) => {
        updateAIUI(data);
    });

    // Cuando se ejecuta una orden virtual
    socket.on('ai-order-executed', (data) => {
        updateAIBalance(data);
        addTradeToLog(data);
        appendOrderToTable(data);
        playNeuralSound(data.side);
    });
}

/**
 * 2. CONTROLES DE INTERFAZ (Enviar datos al servidor)
 */
function setupAIControls() {
    const btn = document.getElementById('btn-start-ai');
    if (!btn) return;

    // Pedir estado inicial al conectar
    socket.emit('get-ai-status');

    btn.addEventListener('click', () => {
        const isCurrentlyRunning = btn.textContent.includes("DETENER");
        const action = isCurrentlyRunning ? 'stop' : 'start';

        btn.disabled = true;
        btn.textContent = "PROCESANDO...";

        // Enviar orden de encendido/apagado vía Socket
        socket.emit('toggle-ai', { action: action });
    });
}

function loadInitialAIHistory() {
    // Pedir historial vía Socket
    socket.emit('get-ai-history');
}

/**
 * 3. FUNCIONES DE ACTUALIZACIÓN VISUAL (DOM)
 */
function updateAIUI(data) {
    const confidenceEl = document.getElementById('ai-confidence-value');
    const predictionText = document.getElementById('ai-prediction-text');
    const logContainer = document.getElementById('ai-log-container');

    if (confidenceEl) {
        const value = (data.confidence * 100).toFixed(1);
        confidenceEl.textContent = `${value}%`;
        if (value > 80) confidenceEl.className = 'text-3xl font-bold text-emerald-500 font-mono';
        else if (value < 40) confidenceEl.className = 'text-3xl font-bold text-red-500 font-mono';
        else confidenceEl.className = 'text-3xl font-bold text-blue-500 font-mono';
    }

    if (predictionText) predictionText.textContent = data.message || "Analizando mercado...";

    if (logContainer && data.message) {
        const log = document.createElement('div');
        log.className = 'text-gray-400 border-l border-blue-900 pl-2 mb-1 text-[10px]';
        log.innerHTML = `<span class="text-blue-700">[${new Date().toLocaleTimeString()}]</span> ${data.message}`;
        logContainer.prepend(log);
        if (logContainer.childNodes.length > 50) logContainer.lastChild.remove();
    }
}

function updateAIBalance(data) {
    const balanceEl = document.getElementById('ai-virtual-balance');
    if (balanceEl && data.currentVirtualBalance !== undefined) {
        balanceEl.textContent = `$${data.currentVirtualBalance.toLocaleString('en-US', {minimumFractionDigits: 2})} USDT`;
    }
}

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

function setBtnUI(btn, isRunning) {
    if (isRunning) {
        btn.textContent = "DETENER NÚCLEO IA";
        btn.className = "w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold shadow-lg shadow-red-900/40 transition-all cursor-pointer";
    } else {
        btn.textContent = "ACTIVAR NÚCLEO IA";
        btn.className = "w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg shadow-blue-900/40 transition-all cursor-pointer";
    }
}

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
}

function playNeuralSound(type) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = type === 'BUY' ? 'sine' : 'square';
        oscillator.frequency.setValueAtTime(type === 'BUY' ? 880 : 440, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.02, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) { }
}