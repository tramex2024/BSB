/**
 * botControls.js - Gestor Centralizado de Comandos (Validación-Aware)
 * Versión 2026: Incluye Pre-visualización de Estrategia, PnL e IA Core
 */
import { askConfirmation } from './confirmModal.js';
import { updateBotUI } from './uiManager.js';
import { displayMessage } from './ui/notifications.js';
import { currentBotState, BACKEND_URL, logStatus } from '../main.js';

export function initializeGlobalButtonListeners() {
    document.addEventListener('click', async (e) => {
        // Buscamos si el clic fue en algún botón de control, incluyendo el de pánico de IA
        const target = e.target.closest('#btn-start-ai, #btn-stop-ai, #btn-panic-ai, #panic-btn, #austartl-btn, #austopl-btn, #austarts-btn, #austops-btn');

        if (!target) return;
        e.preventDefault();

        // Lógica para Pánico General
        if (target.id === 'panic-btn') {
            await handlePanicStop(target);
            return;
        }

        // Lógica para Pánico de IA
        if (target.id === 'btn-panic-ai') {
            await handleAIPanicStop(target);
            return;
        }

        // Para el resto de botones Start/Stop normales e IA Toggle
        await handleToggleBot(target);
    });
}

// Función específica para el Pánico de la IA
async function handleAIPanicStop(btn) {
    const confirmado = await askConfirmation('AI BOT', 'PANIC STOP');
    if (!confirmado) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    
    btn.classList.add('bg-red-600', 'text-white');
    btn.innerHTML = `<i class="fas fa-biohazard fa-spin mr-2"></i> HALTING CORE...`;

    try {
        const response = await fetch(`${BACKEND_URL}/api/ai/panic-stop`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const result = await response.json();
        
        if (result.success) {
            currentBotState.aistate = 'STOPPED';
            const logCont = document.getElementById('ai-log-container');
            if (logCont) {
                const p = document.createElement('p');
                p.className = "text-red-500 font-bold";
                p.textContent = `>> [CRITICAL] EMERGENCY SHUTDOWN EXECUTED`;
                logCont.prepend(p);
            }
            displayMessage("AI CORE HALTED", "error");
            import('./uiManager.js').then(m => m.updateBotUI(currentBotState));
        }
    } catch (error) {
        console.error("Panic Error:", error);
        btn.innerHTML = originalHTML;
    } finally {
        btn.disabled = false;
        btn.classList.remove('bg-red-600');
    }
}

/**
 * Lógica de Panic Stop
 */
async function handlePanicStop(btn) {
    const confirmado = await askConfirmation('ALL BOTS', 'STOP (PANIC)');
    if (!confirmado) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('bg-red-700', 'scale-95');
    btn.innerHTML = `<i class="fas fa-radiation fa-spin mr-2"></i> EXECUTING EMERGENCY STOP...`;

    try {
        const response = await fetch(`${BACKEND_URL}/api/autobot/panic-stop`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const result = await response.json();
        
        if (result.success) {
            currentBotState.lstate = 'STOPPED';
            currentBotState.sstate = 'STOPPED';
            currentBotState.aistate = 'STOPPED';
            currentBotState.isRunning = false;

            logStatus("🚨 SYSTEM HALTED: All bots and positions stopped.", "error");
            displayMessage("EMERGENCY STOP EXECUTED", "error");
            await updateBotUI(currentBotState);
        } else {
            throw new Error(result.message || "Panic command failed");
        }
    } catch (error) {
        console.error("❌ Panic Error:", error);
        logStatus("PANIC FAILED: " + error.message, "error");
        btn.innerHTML = originalHTML;
    } finally {
        btn.disabled = false;
        btn.classList.remove('bg-red-700', 'scale-95');
    }
}

/**
 * Lógica mejorada para alternar estados con Preview de Datos
 */
async function handleToggleBot(btn) {
    let side, stateKey, endpoint;
    const id = btn.id;

    if (id.includes('ai')) {
        side = 'AI'; stateKey = 'aistate'; endpoint = '/api/ai/toggle';
    } else if (id.includes('l-btn')) {
        side = 'long'; stateKey = 'lstate'; endpoint = '/api/v1/config/update-config';
    } else if (id.includes('s-btn')) {
        side = 'short'; stateKey = 'sstate'; endpoint = '/api/v1/config/update-config';
    }

    const isRunning = currentBotState[stateKey] === 'RUNNING';
    const action = isRunning ? 'stop' : 'start';
    const originalHTML = btn.innerHTML;

    // --- FASE DE ANÁLISIS (AUDITORÍA) ---
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-search-dollar fa-spin mr-2"></i> ANALYZING...`;

    let extraData = null;
    try {
        const sideLow = side.toLowerCase();
        
        // Si es START: Consultamos el preview (Ahora incluye 'ai')
        if (action === 'start') {
            const prevRes = await fetch(`${BACKEND_URL}/api/autobot/start-preview/${sideLow}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const prevResult = await prevRes.json();
            if (prevResult.success) extraData = prevResult.data;
        } 
        // Si es STOP: Consultamos reporte de liquidación y PnL (Solo para estrategias de trading)
        else if (action === 'stop' && side !== 'AI') {
            const prevRes = await fetch(`${BACKEND_URL}/api/autobot/stop-preview/${sideLow}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const prevResult = await prevRes.json();
            if (prevResult.status === 'success') extraData = prevResult.data;
        }
    } catch (e) {
        console.warn("⚠️ Preview data fetch failed, falling back to basic modal.", e);
    }

    // --- LLAMADA AL MODAL CON DATA EXTRA ---
    const confirmado = await askConfirmation(side, action, extraData);
    
    if (!confirmado) {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        return;
    }

    // --- EJECUCIÓN REAL ---
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> ${action.toUpperCase()}ING...`;

    try {
        let bodyPayload;
        let finalEndpoint = endpoint; 

        if (side === 'AI') {
            bodyPayload = { action, side: side.toLowerCase() };
        } else {
            const sideLow = side.toLowerCase();
            finalEndpoint = `/api/autobot/${action}/${sideLow}`;
            bodyPayload = { strategy: sideLow, config: { [sideLow]: { enabled: action === 'start' } } };
        }

        const response = await fetch(`${BACKEND_URL}${finalEndpoint}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(bodyPayload) 
        });

        const result = await response.json();
        
        if (result.success) {
            if (side === 'AI') {
                currentBotState.aistate = (action === 'start' ? 'RUNNING' : 'STOPPED');
            } else {
                currentBotState[stateKey] = (action === 'start' ? 'RUNNING' : 'STOPPED');
            }
            logStatus(`${side.toUpperCase()} ${action.toUpperCase()} exitoso`, "success");
            displayMessage(`Estrategia ${side.toUpperCase()}: ${action.toUpperCase()}`, action === 'start' ? 'success' : 'warning');
            await updateBotUI(currentBotState); 
        } else {
            throw new Error(result.message || "Error");
        }
    } catch (error) {
        logStatus(error.message, "error");
        displayMessage(error.message, "error");
        btn.innerHTML = originalHTML;
    } finally {
        btn.disabled = false;
        if (btn.querySelector('.fa-spin')) btn.innerHTML = originalHTML;
    }
}