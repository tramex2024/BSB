// public/js/modules/aibot.js

import { socket } from '../main.js';

export function initializeAIBotView() {
    console.log("AIBot View Inicializada");
    setupAISocketListeners();
    setupAIControls();
}

function setupAISocketListeners() {
    // Escuchamos las "decisiones" de la IA en tiempo real
    socket.on('ai-decision-update', (data) => {
        updateAIUI(data);
    });
}

function updateAIUI(data) {
    const confidenceEl = document.getElementById('ai-confidence-value');
    const logContainer = document.getElementById('ai-log-container');

    if (confidenceEl) {
        const value = (data.confidence * 100).toFixed(1);
        confidenceEl.textContent = `${value}%`;
        confidenceEl.className = value > 80 ? 'text-emerald-500' : 'text-blue-500';
    }

    if (logContainer) {
        const log = document.createElement('div');
        log.className = 'text-gray-400 border-l border-blue-500 pl-2 mb-1';
        log.innerHTML = `<span class="text-blue-800">[${new Date().toLocaleTimeString()}]</span> ${data.message}`;
        logContainer.prepend(log); // El más nuevo arriba
        if (logContainer.childNodes.length > 50) logContainer.lastChild.remove();
    }
}

async function setupAIControls() {
    const btn = document.getElementById('btn-start-ai');
    if (btn) {
        btn.addEventListener('click', async () => {
            // Aquí llamarías a tu API /api/ai/toggle
            console.log("Cambiando estado de IA...");
        });
    }
}