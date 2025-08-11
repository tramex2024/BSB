// public/js/modules/bot.js

import { displayLogMessage } from './auth.js';
import { fetchFromBackend } from './api.js';
import { TRADE_SYMBOL } from '../main.js';
import { BACKEND_URL } from '../main.js'; // Importa la URL del backend

let isRunning = false;

// Las funciones para interactuar con los botones y el estado del bot
export async function toggleBotState() {
    const startBtn = document.getElementById('start-btn');
    if (!startBtn) {
        displayLogMessage("Error: Missing start button.", 'error');
        return;
    }

    const action = isRunning ? 'stop' : 'start';
    displayLogMessage(`Sending request to ${action} bot...`, 'info');

    try {
        const botState = await fetchBotState(action);
        if (botState) {
            updateUIBasedOnBotState(botState);
            displayLogMessage(`Bot state updated to: ${botState.state}`, 'success');
        }
    } catch (error) {
        displayLogMessage(`Error toggling bot state: ${error.message}`, 'error');
        console.error('Error toggling bot state:', error);
    }
}

async function fetchBotState(action) {
    // Obtener los elementos del DOM para la configuración del bot
    const purchaseInput = document.getElementById("purchase");
    const incrementInput = document.getElementById("increment");
    const decrementInput = document.getElementById("decrement");
    const triggerInput = document.getElementById("trigger");
    const stopAtCycleEndCheckbox = document.getElementById('stop-at-cycle-end');

    const params = {
        symbol: TRADE_SYMBOL,
        purchase: purchaseInput ? parseFloat(purchaseInput.value) : 0,
        increment: incrementInput ? parseFloat(incrementInput.value) : 0,
        decrement: decrementInput ? parseFloat(decrementInput.value) : 0,
        trigger: triggerInput ? parseFloat(triggerInput.value) : 0,
        stopAtCycleEnd: stopAtCycleEndCheckbox ? stopAtCycleEndCheckbox.checked : false,
    };

    const endpoint = `/api/user/toggle-bot?action=${action}`; // Usamos un endpoint más genérico
    const response = await fetchFromBackend(endpoint, 'POST', { params });
    return response.botState;
}

export function updateUIBasedOnBotState(botData) {
    const startBtn = document.getElementById('start-btn');
    const resetBtn = document.getElementById('reset-btn');
    const botStateDisplay = document.getElementById('bot-state');
    const stopAtCycleEndCheckbox = document.getElementById('stop-at-cycle-end');
    const cycleDisplay = document.getElementById('cycle');
    const profitDisplay = document.getElementById('profit');
    const cycleProfitDisplay = document.getElementById('cycleprofit');

    isRunning = (botData.state === 'RUNNING');

    if (startBtn) startBtn.textContent = isRunning ? 'STOP' : 'START';
    if (startBtn) startBtn.className = isRunning ? 'bg-red-600' : 'bg-green-600';
    if (resetBtn) resetBtn.disabled = isRunning;
    if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.disabled = isRunning;
    if (botStateDisplay) {
        botStateDisplay.textContent = botData.state;
        botStateDisplay.className = isRunning ? 'text-green-400' : 'text-yellow-400';
    }
    if (cycleDisplay) cycleDisplay.textContent = botData.cycle || 0;
    if (profitDisplay) profitDisplay.textContent = (botData.profit || 0).toFixed(2);
    if (cycleProfitDisplay) cycleProfitDisplay.textContent = (botData.cycleProfit || 0).toFixed(2);
}

export async function loadBotConfigAndState() {
    displayLogMessage('Cargando configuración y estado del bot...', 'info');

    try {
        const botData = await fetchFromBackend('/api/user/bot-config-and-state');
        if (botData) {
            const purchaseInput = document.getElementById("purchase");
            const incrementInput = document.getElementById("increment");
            const decrementInput = document.getElementById("decrement");
            const triggerInput = document.getElementById("trigger");
            const stopAtCycleEndCheckbox = document.getElementById('stop-at-cycle-end');

            if (purchaseInput) purchaseInput.value = botData.purchase || 5.00;
            if (incrementInput) incrementInput.value = botData.increment || 100;
            if (decrementInput) decrementInput.value = botData.decrement || 1.0;
            if (triggerInput) triggerInput.value = botData.trigger || 1.5;
            if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.checked = botData.stopAtCycleEnd || false;
            
            updateUIBasedOnBotState(botData);
            displayLogMessage(`Bot configuration loaded. State: ${botData.state}.`, 'success');
        } else {
            displayLogMessage('Failed to load bot configuration. Using default UI values.', 'warning');
        }
    } catch (error) {
        displayLogMessage(`Error loading bot config: ${error.message}`, 'error');
    }
}

export async function checkBotStatus() {
    const austartBtn = document.getElementById('austart-btn');
    if (!austartBtn) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/user/bot-config-and-state`);
        const data = await response.json();

        if (response.ok) {
            // Si al menos una de las estrategias está corriendo, el botón debe ser "STOP"
            if (data.lstate === 'RUNNING' || data.sstate === 'RUNNING') {
                austartBtn.textContent = 'STOP';
                austartBtn.classList.remove('bg-green-600');
                austartBtn.classList.add('bg-red-600');
            } else {
                austartBtn.textContent = 'START';
                austartBtn.classList.remove('bg-red-600');
                austartBtn.classList.add('bg-green-600');
            }
        }
    } catch (error) {
        console.error('Error fetching bot status:', error);
        // Si hay un error, dejamos el botón en el estado por defecto (START)
        austartBtn.textContent = 'START';
        austartBtn.classList.remove('bg-red-600');
        austartBtn.classList.add('bg-green-600');
    }
}

export async function resetBot() {
    const purchaseInput = document.getElementById("purchase");
    const incrementInput = document.getElementById("increment");
    const decrementInput = document.getElementById("decrement");
    const triggerInput = document.getElementById("trigger");
    const stopAtCycleEndCheckbox = document.getElementById('stop-at-cycle-end');
    
    if (purchaseInput) purchaseInput.value = 5.00;
    if (incrementInput) incrementInput.value = 100;
    if (decrementInput) decrementInput.value = 1.0;
    if (triggerInput) triggerInput.value = 1.5;
    if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.checked = false;

    // Lógica para actualizar los cálculos y el estado
    // ...
    displayLogMessage('Bot parameters reset to default values.', 'info');
}