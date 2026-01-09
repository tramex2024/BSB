// public/js/modules/aibot.js
import { socket } from '../main.js';

export function initializeAIBotView() {
    setupAISocketListeners();
    setupAIControls();
    loadInitialAIHistory();
}

// --- EL "OÍDO" DEL SISTEMA (Socket Listeners) ---
function setupAISocketListeners() {
    socket.on('ai-decision-update', (data) => {
        updateAIUI(data);
    });

    // Esta es la parte de la "Integración":
    socket.on('ai-order-executed', (data) => {
        updateAIBalance(data);
        addTradeToLog(data);
        appendOrderToTable(data);
        
        // 🔊 Aquí le decimos que suene el pitido cada vez que opere
        playNeuralSound(data.side); 
    });

    socket.on('ai-status-update', (data) => {
        const btn = document.getElementById('btn-start-ai');
        if (!data.isRunning && btn) {
            btn.textContent = "ACTIVAR NÚCLEO IA";
            btn.className = "w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition-all text-white";
        }
    });
}

// --- FUNCIÓN DEL SONIDO ---
function playNeuralSound(type) {
    // Esto crea un sonido electrónico sin usar archivos externos
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

    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime); 
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.2);
}

// --- RESTO DE FUNCIONES VISUALES ---
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

    if (predictionText) predictionText.textContent = data.message || "Analizando...";

    if (logContainer && data.message) {
        const log = document.createElement('div');
        log.className = 'text-gray-400 border-l border-blue-900 pl-2 mb-1 text-[10px]';
        log.innerHTML = `<span class="text-blue-700">[${new Date().toLocaleTimeString()}]</span> ${data.message}`;
        logContainer.prepend(log);
        if (logContainer.childNodes.length > 50) logContainer.lastChild.remove();
    }
}

function updateAIBalance(data) {
    const balanceEl = document.querySelector('.text-emerald-400.font-mono');
    if (balanceEl && data.currentVirtualBalance) {
        balanceEl.textContent = `$${data.currentVirtualBalance.toLocaleString('en-US', {minimumFractionDigits: 2})} USDT`;
    }
}

function addTradeToLog(data) {
    const logContainer = document.getElementById('ai-log-container');
    if (logContainer) {
        const tradeLog = document.createElement('div');
        const color = data.side === 'BUY' ? 'text-emerald-400' : 'text-orange-400';
        tradeLog.className = `${color} font-bold border-l-2 border-white pl-2 my-1 animate-pulse`;
        tradeLog.innerHTML = `[TRADE] ${data.side} @ ${data.price} | PNL: ${data.pnlLastTrade || 0}`;
        logContainer.prepend(tradeLog);
    }
}

async function setupAIControls() {
    const btn = document.getElementById('btn-start-ai');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const token = localStorage.getItem('token');
        const isActivating = btn.textContent.includes("ACTIVAR");
        btn.textContent = isActivating ? "INICIANDO..." : "DETENIENDO...";
        btn.disabled = true;

        try {
            const response = await fetch('/api/ai/toggle', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const result = await response.json();
            if (result.success) {
                btn.textContent = result.isRunning ? "NÚCLEO ONLINE" : "ACTIVAR NÚCLEO IA";
                btn.className = result.isRunning ? 
                    "w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all text-white" : 
                    "w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition-all text-white";
            }
        } catch (err) {
            btn.textContent = "ERROR DE SISTEMA";
            btn.className = "w-full py-3 bg-red-600 rounded-lg font-bold text-white";
        } finally {
            btn.disabled = false;
        }
    });
}

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
    } catch (err) { console.error(err); }
}

function appendOrderToTable(order) {
    const tableBody = document.getElementById('ai-history-table-body');
    if (!tableBody) return;
    if (tableBody.innerText.includes("Esperando")) tableBody.innerHTML = '';

    const row = document.createElement('tr');
    row.className = 'hover:bg-blue-500/5 transition-colors group border-b border-gray-800/30';
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