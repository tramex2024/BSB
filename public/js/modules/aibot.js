// public/js/modules/aibot.js

import { socket, currentBotState, BACKEND_URL } from '../main.js';
import aiBotUI from './aiBotUI.js';

/**
 * Inicializa la vista de la IA cada vez que el usuario entra en la pestaña.
 */
export function initializeAibotView() {
    console.log("🚀 Sistema IA: Sincronizando interfaz...");
    
    // 1. Limpiamos listeners previos para evitar ejecuciones duplicadas
    if (socket) {
        socket.off('ai-status-update');
        socket.off('ai-history-data');
        socket.off('ai-order-executed');
    }

    // 2. Configuramos los escuchadores activos
    setupAISocketListeners();
    
    // 3. Configuramos el botón de control Start/Stop
    setupAIControls();
    
    // 4. Sincronización inmediata con el estado global (Evita el lag visual)
    aiBotUI.setRunningStatus(currentBotState.isRunning);

    // 5. Solicitamos datos frescos al servidor para llenar la tabla y el balance
    if (socket && socket.connected) {
        socket.emit('get-ai-status');
        socket.emit('get-ai-history');
    }
}

/**
 * Escucha los eventos del socket específicos para la vista de IA
 */
function setupAISocketListeners() {
    if (!socket) return;

    // Monitor de estado: Progreso (1/30), Balance y Running
    socket.on('ai-status-update', (data) => {
        // Actualizamos el balance en la UI
        const balEl = document.getElementById('ai-virtual-balance');
        if (balEl && data.virtualBalance !== undefined) {
            balEl.innerText = `$${parseFloat(data.virtualBalance).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        }

        // Lógica del botón: Si está en fase de análisis (30 velas), mostramos progreso
        const btnAi = document.getElementById('btn-start-ai');
        if (btnAi) {
            if (data.isRunning && data.historyCount < 30) {
                btnAi.textContent = `ANALIZANDO... (${data.historyCount}/30)`;
                btnAi.className = "w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs animate-pulse";
                btnAi.disabled = false;
            } else {
                // Si ya pasó el análisis o está apagado, delegamos al módulo UI principal
                aiBotUI.setRunningStatus(data.isRunning);
            }
        }
    });

    // Historial completo
    socket.on('ai-history-data', (history) => {
        aiBotUI.updateHistoryTable(history);
    });

    // Ejecución en tiempo real
    socket.on('ai-order-executed', (order) => {
        showAiToast(order);
        playNeuralSound(order.side);
        socket.emit('get-ai-history'); 
    });
}

/**
 * Configura el botón de encendido/apagado usando la API REST (Ruta blindada)
 */
function setupAIControls() {
    const btn = document.getElementById('btn-start-ai');
    if (!btn) return;

    // Clonamos para limpiar eventos viejos
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
        const action = currentBotState.isRunning ? 'stop' : 'start';

        // Feedback visual inmediato
        newBtn.disabled = true;
        newBtn.textContent = "PROCESANDO...";
        newBtn.className = "w-full py-4 bg-gray-600 text-white rounded-2xl font-black text-xs animate-pulse cursor-wait";

        try {
            // 🚀 LLAMADA A LA API DE RENDER (No a Vercel)
            const response = await fetch(`${BACKEND_URL}/api/ai/toggle`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}` // Importante para el middleware
                },
                body: JSON.stringify({ action: action })
            });

            // Validar si la respuesta es JSON antes de parsear
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error servidor: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                console.log(`✅ IA ${action} exitoso`);
                currentBotState.isRunning = result.isRunning;
                aiBotUI.setRunningStatus(result.isRunning);
            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            console.error("❌ Error API IA:", error);
            aiBotUI.setRunningStatus(currentBotState.isRunning);
            alert("Error de conexión con el núcleo de IA. Revisa la consola.");
        } finally {
            newBtn.disabled = false;
        }
    });
}

/**
 * Notificación visual tipo Toast
 */
function showAiToast(order) {
    const toast = document.createElement('div');
    const isBuy = order.side.toUpperCase() === 'BUY';
    
    toast.className = `fixed bottom-5 right-5 z-50 p-4 rounded-2xl shadow-2xl border ${
        isBuy ? 'bg-emerald-900/90 border-emerald-400' : 'bg-red-900/90 border-red-400'
    } text-white animate-bounceIn`;
    
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
        toast.classList.add('animate-fadeOut');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

/**
 * Sonido sutil
 */
function playNeuralSound(side) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(side.toUpperCase() === 'BUY' ? 880 : 440, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(0.01, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
        // Ignorar si el navegador bloquea audio
    }
}