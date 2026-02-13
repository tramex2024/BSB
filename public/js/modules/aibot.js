/**
 * File: public/js/modules/aibot.js
 * AI Core - View Management (Segmented Version)
 * Integration: Segregated Strategy Fetching 2026
 */

import { currentBotState, BACKEND_URL } from '../main.js';
import aiBotUI from './aiBotUI.js';
import { socket } from './socket.js';
import { fetchOrders } from './orders.js'; // Importación vital para el nuevo plan

/**
 * Inicializa la vista de IA y sincroniza componentes
 */
export function initializeAibotView() {
    console.log("🚀 AI System: Syncing segregated interface...");
    
    // 1. Configurar listeners de inputs y botones
    setupAIControls();
    
    // 2. Sincronización de UI con el estado global (currentBotState)
    const aiInput = document.getElementById('ai-amount-usdt');
    const stopAtCycleCheck = document.getElementById('ai-stop-at-cycle');

    if (aiInput) {
        aiInput.value = currentBotState.config.ai.amountUsdt || "";
    }
    if (stopAtCycleCheck) {
        stopAtCycleCheck.checked = currentBotState.config.ai.stopAtCycle || false;
    }

    // Aplicar estado visual al botón START/STOP
    aiBotUI.setRunningStatus(currentBotState.isRunning, currentBotState.stopAtCycle);

    // 3. CARGA DE ÓRDENES SEGMENTADAS
    // Buscamos el contenedor de la lista de órdenes en la pestaña AI
    const aiOrderList = document.getElementById('ai-order-list');
    if (aiOrderList) {
        // Al entrar, cargamos por defecto todas las órdenes con estrategia 'ai'
        fetchOrders('aibot', 'all', aiOrderList);
        
        // Inicializamos las pestañas internas de la sección AI (Opened, Filled, etc)
        setupAiOrderTabs(aiOrderList);
    }
}

/**
 * Gestiona los clics en las pestañas de filtros dentro de AIBOT
 */
function setupAiOrderTabs(container) {
    const tabs = document.querySelectorAll('.aibot-tabs button');
    if (!tabs.length || !container) return;

    tabs.forEach(tab => {
        tab.onclick = (e) => {
            // Extraemos el estado del ID del botón (ej: ai-tab-opened -> opened)
            const status = e.currentTarget.id.replace('ai-tab-', '');
            
            // Llamamos al fetch especificando que somos la pestaña 'aibot'
            fetchOrders('aibot', status, container);
            
            // Lógica visual para activar la pestaña seleccionada
            tabs.forEach(t => t.classList.remove('active-tab-style')); // Ajustar según tus clases CSS
            e.currentTarget.classList.add('active-tab-style');
        };
    });
}

/**
 * Configuración de controles: Inputs, Checkboxes y Botón Principal
 */
function setupAIControls() {
    const aiInputs = [
        document.getElementById('ai-amount-usdt'),
        document.getElementById('auamountai-usdt')
    ];
    
    const stopCycleChecks = [
        document.getElementById('au-stop-ai-at-cycle'),
        document.getElementById('ai-stop-at-cycle')
    ];

    const btnStartAi = document.getElementById('btn-start-ai');

    // Sincronización de Inputs de Capital
    aiInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('change', async () => {
            const val = parseFloat(input.value);
            if (isNaN(val) || val <= 0) return;
            // Espejo visual entre inputs si existen en varios sitios
            aiInputs.forEach(i => { if(i && i !== input) i.value = val; });
            await saveAIConfig({ amountUsdt: val });
        });
    });

    // Sincronización de Checkboxes (Stop at Cycle)
    stopCycleChecks.forEach(check => {
        if (!check) return;
        check.addEventListener('change', async () => {
            const state = check.checked;
            stopCycleChecks.forEach(c => { if(c && c !== check) c.checked = state; });
            await saveAIConfig({ stopAtCycle: state });
        });
    });

    // Botón de Encendido/Apagado (Toggle)
    if (btnStartAi) {
        const newBtn = btnStartAi.cloneNode(true);
        btnStartAi.parentNode.replaceChild(newBtn, btnStartAi);
        
        newBtn.addEventListener('click', async () => {
            const isCurrentlyEnabled = currentBotState.isRunning;
            const action = isCurrentlyEnabled ? 'stop' : 'start';
            
            newBtn.disabled = true;
            newBtn.textContent = "PROCESSING...";

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
                    currentBotState.isRunning = result.isRunning;
                    aiBotUI.setRunningStatus(result.isRunning, currentBotState.stopAtCycle);
                }
            } catch (error) {
                console.error("❌ AI Toggle Error:", error);
            } finally {
                newBtn.disabled = false;
            }
        });
    }
}

/**
 * Guarda la configuración de la IA en el backend
 */
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
        if (data.success && aiBotUI.addLogEntry) {
            const key = Object.keys(payload)[0];
            const msg = key === 'stopAtCycle' 
                ? `Smart Cycle: ${payload[key] ? 'ENABLED' : 'DISABLED'}`
                : `AI: Capital updated to $${payload[key]}`;
            aiBotUI.addLogEntry(msg, 0.5);
        }
    } catch (error) {
        console.error("❌ Error saving AI config:", error);
    }
}

/**
 * Notificaciones Visuales y Sonoras
 */
function showAiToast(order) {
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

function playNeuralSound(side) {
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