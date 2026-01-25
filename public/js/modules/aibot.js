// public/js/modules/aibot.js

import { socket } from '../main.js';

export function initializeAibotView() {
    console.log("🚀 Sistema IA: Conectando interfaz...");
    
    if (socket) {
        // Limpieza de listeners para evitar duplicidad
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

    // Estado inicial al cargar la página o conectar
    socket.on('ai-status-init', (state) => {
        const btn = document.getElementById('btn-start-ai');
        const balanceEl = document.getElementById('ai-virtual-balance');
        
        if (balanceEl && state.virtualBalance !== undefined) {
            balanceEl.textContent = `$${state.virtualBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        }

        if (btn) {
            // Si está corriendo pero aún en fase de análisis (<30 velas)
            if (state.isRunning && state.historyCount < 30) {
                btn.textContent = `ANALIZANDO... (${state.historyCount}/30)`;
                btn.className = "w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs animate-pulse";
                btn.disabled = false;
            } else {
                setBtnUI(btn, state.isRunning);
            }
        }
    });

    // Actualizaciones de estado en tiempo real (progreso y toggle)
    socket.on('ai-status-update', (data) => {
        const btn = document.getElementById('btn-start-ai');
        if (btn) {
            if (data.isRunning && (data.historyCount < 30)) {
                btn.textContent = `ANALIZANDO... (${data.historyCount}/30)`;
                btn.className = "w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs animate-pulse";
            } else {
                setBtnUI(btn, data.isRunning);
            }
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
        updateAIUI(data); // Actualiza círculo de confianza y logs
    });

    socket.on('ai-order-executed', (data) => {
        updateAIBalance(data);
        appendOrderToTable(data);
        showAiToast(data); // Notificación visual
        playNeuralSound(data.side);
    });
}

function setupAIControls() {
    const btn = document.getElementById('btn-start-ai');
    if (!btn) return;

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', () => {
        // Detectamos si el botón está en modo STOP (rojo) o START (azul/verde)
        const isRunning = newBtn.classList.contains('bg-red-600') || newBtn.classList.contains('bg-emerald-500');
        const action = isRunning ? 'stop' : 'start';

        newBtn.disabled = true;
        newBtn.textContent = "PROCESANDO...";
        newBtn.className = "w-full py-4 bg-gray-600 text-white rounded-2xl font-black text-xs animate-pulse cursor-wait";

        socket.emit('toggle-ai', { action: action });
    });
}

function updateAIUI(data) {
    const confidenceEl = document.getElementById('ai-confidence-value');
    const circle = document.getElementById('ai-confidence-circle');
    const predictionText = document.getElementById('ai-prediction-text');
    const logContainer = document.getElementById('ai-log-container');

    if (confidenceEl && circle) {
        const percent = (data.confidence || 0) * 100;
        confidenceEl.textContent = `${Math.round(percent)}%`;
        
        // 1. CÁLCULO DE COLOR DINÁMICO
        let circleColor = "#3b82f6"; // Azul (Baja confianza/Neutral)
        
        if (percent >= 85) {
            circleColor = "#a855f7"; // Púrpura (¡Confianza Extrema!)
        } else if (percent >= 70) {
            circleColor = "#f97316"; // Naranja (Señal Fuerte)
        } else if (percent >= 50) {
            circleColor = "#10b981"; // Verde (Tendencia estable)
        }

        // 2. APLICAR COLOR Y SOMBRA (GLOW)
        circle.style.stroke = circleColor;
        circle.style.filter = `drop-shadow(0 0 8px ${circleColor}66)`;
        confidenceEl.style.color = circleColor;

        // 3. ACTUALIZAR OFFSET DEL CÍRCULO (Perímetro 364.4)
        const offset = 364.4 - (percent / 100) * 364.4;
        circle.style.strokeDashoffset = offset;
    }

    if (predictionText) predictionText.textContent = data.message || "Analizando mercado...";

    if (logContainer && data.message) {
        const log = document.createElement('div');
        log.className = "text-[9px] border-l-2 border-blue-500 pl-2 mb-1 py-1 bg-blue-500/5 animate-fadeIn";
        log.innerHTML = `<span class="text-blue-500 font-bold">[${new Date().toLocaleTimeString()}]</span> <span class="text-gray-300">${data.message}</span>`;
        logContainer.prepend(log);
        if (logContainer.childNodes.length > 20) logContainer.lastChild.remove();
    }
}

function updateAIBalance(data) {
    const balanceEl = document.getElementById('ai-virtual-balance');
    const val = data.virtualBalance;
    if (balanceEl && val !== undefined) {
        balanceEl.textContent = `$${val.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    }
}

function setBtnUI(btn, isRunning) {
    btn.disabled = false;
    if (isRunning) {
        // Modo Activo (STOP)
        btn.textContent = "STOP AI";
        btn.className = "w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black text-xs transition-all shadow-xl shadow-red-900/40 border border-red-400/30 uppercase tracking-widest active:scale-95 cursor-pointer";
    } else {
        // Modo Detenido (START)
        btn.textContent = "ACTIVAR NÚCLEO IA";
        btn.className = "w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs transition-all shadow-xl shadow-blue-900/40 border border-blue-400/30 uppercase tracking-widest active:scale-95 cursor-pointer";
    }
}

function showAiToast(order) {
    const toast = document.createElement('div');
    const isBuy = order.side === 'BUY';
    toast.className = `fixed bottom-5 right-5 z-50 p-4 rounded-2xl shadow-2xl border ${isBuy ? 'bg-emerald-900/90 border-emerald-400' : 'bg-red-900/90 border-red-400'} text-white animate-bounceIn`;
    toast.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="p-2 bg-white/10 rounded-full">🤖</div>
            <div>
                <p class="text-[10px] font-bold uppercase tracking-tighter">IA Ejecución Virtual</p>
                <p class="text-xs font-black">${order.side} BTC @ $${parseFloat(order.price).toLocaleString()}</p>
            </div>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.replace('animate-bounceIn', 'animate-fadeOut');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

function appendOrderToTable(order) {
    const tableBody = document.getElementById('ai-history-table-body');
    if (!tableBody) return;
    if (tableBody.innerText.includes("Esperando")) tableBody.innerHTML = '';

    const row = document.createElement('tr');
    row.className = 'hover:bg-blue-500/5 transition-colors border-b border-blue-500/5';
    
    const time = new Date(order.timestamp).toLocaleTimeString();
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