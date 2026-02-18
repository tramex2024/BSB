import { currentBotState, BACKEND_URL } from '../main.js';
import aiBotUI from './aiBotUI.js';
import { fetchOrders } from './orders.js';

export function initializeAibotView() {
    console.log("🚀 AI System: Syncing card-style interface...");
    
    // BLINDAJE: Asegurar que el objeto config exista para evitar crash
    if (!currentBotState.config) currentBotState.config = {};
    if (!currentBotState.config.ai) currentBotState.config.ai = { amountUsdt: 0, stopAtCycle: false };

    setupAIControls();
    
    const aiInput = document.getElementById('ai-amount-usdt');
    const stopAtCycleCheck = document.getElementById('ai-stop-at-cycle');

    if (aiInput) {
        aiInput.value = currentBotState.config.ai.amountUsdt || "";
    }
    if (stopAtCycleCheck) {
        stopAtCycleCheck.checked = currentBotState.config.ai.stopAtCycle || false;
    }

    // Usamos aistate para determinar si está corriendo específicamente la IA
    const isAiRunning = currentBotState.aistate === 'RUNNING';

    aiBotUI.setRunningStatus(
        isAiRunning, 
        currentBotState.config.ai.stopAtCycle,
        currentBotState.historyCount || 0
    );

    const aiOrderCont = document.getElementById('ai-order-list'); 
    if (aiOrderCont) {
        fetchOrders('ai', aiOrderCont);
        setupAiOrderTabs();
    }
}

// ... setupAiOrderTabs se mantiene igual ...

function setupAIControls() {
    const aiInput = document.getElementById('ai-amount-usdt');
    const stopCycleCheck = document.getElementById('ai-stop-at-cycle');
    const btnStartAi = document.getElementById('btn-start-ai');

    if (aiInput) {
        aiInput.onchange = async () => {
            const val = parseFloat(aiInput.value);
            if (isNaN(val) || val <= 0) return;
            await saveAIConfig({ amountUsdt: val });
        };
    }

    if (stopCycleCheck) {
        stopCycleCheck.onchange = async () => {
            await saveAIConfig({ stopAtCycle: stopCycleCheck.checked });
        };
    }

    if (btnStartAi) {
        const newBtn = btnStartAi.cloneNode(true);
        btnStartAi.parentNode.replaceChild(newBtn, btnStartAi);
        
        newBtn.addEventListener('click', async () => {
            // Cambio crítico: Leer de aistate
            const isCurrentlyEnabled = currentBotState.aistate === 'RUNNING';
            const action = isCurrentlyEnabled ? 'stop' : 'start';
            
            newBtn.disabled = true;
            newBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> ${action.toUpperCase()}ING...`;

            try {
                const response = await fetch(`${BACKEND_URL}/api/ai/toggle`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ action })
                });

                const result = await response.json();
                if (result.success) {
                    // Sincronizamos el estado global con la respuesta real del server
                    currentBotState.aistate = result.aistate; 
                    aiBotUI.setRunningStatus(
                        result.isRunning, 
                        currentBotState.config.ai.stopAtCycle,
                        result.historyCount || 0
                    );
                }
            } catch (error) {
                console.error("❌ AI Toggle Error:", error);
            } finally {
                newBtn.disabled = false;
            }
        });
    }
}

async function saveAIConfig(payload) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/ai/config`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        if (data.success) {
            // IMPORTANTE: Actualizar con lo que el servidor DIGA (por las validaciones de balance)
            if (data.virtualBalance !== undefined) {
                currentBotState.aibalance = data.virtualBalance;
            }
            if (data.config) {
                currentBotState.config.ai = data.config;
            }

            if (aiBotUI.addLogEntry) {
                aiBotUI.addLogEntry(data.message || "Config Updated", 0.5);
            }
        }
    } catch (error) {
        console.error("❌ Error saving AI config:", error);
    }
}

/**
 * Notificaciones Visuales (Toasts)
 */
export function showAiToast(order) {
    const toast = document.createElement('div');
    const isBuy = order.side.toUpperCase() === 'BUY';
    toast.className = `fixed bottom-5 right-5 z-50 p-4 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-500 transform translate-y-0 ${
        isBuy ? 'bg-emerald-900/90 border-emerald-400' : 'bg-red-900/90 border-red-400'
    } text-white animate-bounceIn`;

    toast.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="p-2 bg-white/10 rounded-full text-lg">${isBuy ? '🚀' : '💰'}</div>
            <div>
                <p class="text-[10px] font-bold uppercase tracking-tighter opacity-70">AI Core Execution</p>
                <p class="text-xs font-black">${order.side} BTC @ $${parseFloat(order.price).toLocaleString()}</p>
            </div>
        </div>`;

    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-10');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

/**
 * Sonido de ejecución (Feedback auditivo)
 */
export function playNeuralSound(side) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.setValueAtTime(side.toUpperCase() === 'BUY' ? 880 : 440, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {}
}