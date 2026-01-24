// public/js/modules/aibot.js
import { socket } from '../main.js';

export function initializeAibotView() {
    console.log("🚀 Sistema IA: Conectando interfaz...");
    
    if (socket) {
        socket.off('ai-status-init');
        socket.off('ai-status-update');
        socket.off('ai-history-data');
        socket.off('ai-decision-update');
        socket.off('ai-order-executed');
    }

    setupAISocketListeners();
    setupAIControls();
    
    if (socket && socket.connected) {
        socket.emit('get-ai-status');
        socket.emit('get-ai-history');
    }
}

function setupAISocketListeners() {
    if (!socket) return;

    socket.on('ai-status-init', (state) => {
        const btn = document.getElementById('btn-start-ai');
        const balanceEl = document.getElementById('ai-virtual-balance');
        if (btn) setBtnUI(btn, state.isRunning);
        if (balanceEl && state.virtualBalance !== undefined) {
            balanceEl.textContent = `$${state.virtualBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        }
    });

    socket.on('ai-status-update', (data) => {
        const btn = document.getElementById('btn-start-ai');
        if (btn) {
            setBtnUI(btn, data.isRunning);
            btn.disabled = false;
        }
        updateAIBalance(data);
    });

    socket.on('ai-history-data', (history) => {
        const tableBody = document.getElementById('ai-history-table-body');
        if (tableBody && Array.isArray(history)) {
            tableBody.innerHTML = ''; 
            history.forEach(order => appendOrderToTable(order));
        }
    });

    socket.on('ai-decision-update', (data) => {
        updateAIUI(data);
    });

    socket.on('ai-order-executed', (data) => {
        updateAIBalance(data);
        appendOrderToTable(data);
        playNeuralSound(data.side);
    });
}

function setupAIControls() {
    const btn = document.getElementById('btn-start-ai');
    if (!btn) return;

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', () => {
        const isCurrentlyRunning = newBtn.textContent.includes("DETENER");
        const action = isCurrentlyRunning ? 'stop' : 'start';
        newBtn.disabled = true;
        newBtn.textContent = "PROCESANDO...";
        socket.emit('toggle-ai', { action: action });
    });
}

function updateAIUI(data) {
    const confidenceEl = document.getElementById('ai-confidence-value');
    const circle = document.getElementById('ai-confidence-circle');
    const predictionText = document.getElementById('ai-prediction-text');
    const logContainer = document.getElementById('ai-log-container');

    if (confidenceEl && circle) {
        const percent = data.confidence * 100;
        confidenceEl.textContent = `${Math.round(percent)}%`;
        
        // Mover el círculo (Perímetro 364.4)
        const offset = 364.4 - (percent / 100) * 364.4;
        circle.style.strokeDashoffset = offset;
    }

    if (predictionText) predictionText.textContent = data.message || "Analizando mercado...";

    if (logContainer && data.message) {
        const log = document.createElement('div');
        log.className = "text-[9px] border-l-2 border-blue-500 pl-2 mb-1 py-1 bg-blue-500/5 animate-fadeIn";
        log.innerHTML = `<span class="text-blue-500 font-bold">[${new Date().toLocaleTimeString()}]</span> <span class="text-gray-300">${data.message}</span>`;
        logContainer.prepend(log);
        if (logContainer.childNodes.length > 30) logContainer.lastChild.remove();
    }
}

function updateAIBalance(data) {
    const balanceEl = document.getElementById('ai-virtual-balance');
    const val = data.currentVirtualBalance || data.virtualBalance;
    if (balanceEl && val !== undefined) {
        balanceEl.textContent = `$${val.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    }
}

function setBtnUI(btn, isRunning) {
    if (isRunning) {
        btn.textContent = "DETENER NÚCLEO IA";
        btn.className = "w-full py-4 bg-red-600/90 hover:bg-red-500 text-white rounded-2xl font-black text-xs transition-all shadow-xl shadow-red-900/40 border border-red-400/30 uppercase tracking-widest active:scale-95";
    } else {
        btn.textContent = "ACTIVAR NÚCLEO IA";
        btn.className = "w-full py-4 bg-blue-600/90 hover:bg-blue-500 text-white rounded-2xl font-black text-xs transition-all shadow-xl shadow-blue-900/40 border border-blue-400/30 uppercase tracking-widest active:scale-95";
    }
}

function appendOrderToTable(order) {
    const tableBody = document.getElementById('ai-history-table-body');
    if (!tableBody) return;
    if (tableBody.innerText.includes("Esperando")) tableBody.innerHTML = '';

    const row = document.createElement('tr');
    row.className = 'hover:bg-blue-500/5 transition-colors border-b border-blue-500/5';
    
    const time = new Date(order.timestamp || Date.now()).toLocaleTimeString();
    const isBuy = order.side === 'BUY';
    
    row.innerHTML = `
        <td class="px-6 py-4 text-gray-500">${time}</td>
        <td class="px-6 py-4 font-black ${isBuy ? 'text-emerald-400' : 'text-red-400'}">${order.side}</td>
        <td class="px-6 py-4 text-right font-mono text-white">$${parseFloat(order.price).toFixed(2)}</td>
        <td class="px-6 py-4 text-right font-mono text-gray-300">$${parseFloat(order.amount).toFixed(2)}</td>
        <td class="px-6 py-4 text-center">
            <span class="text-blue-400 font-bold">${order.confidenceScore || 0}%</span>
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
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(type === 'BUY' ? 880 : 440, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.01, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) { }
}