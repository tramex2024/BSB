// public/js/modules/bot.js
import { isLoggedIn, fetchFromBackend, displayLogMessage } from './auth.js';
import { purchaseInput, incrementInput, decrementInput, triggerInput, stopAtCycleEndCheckbox, botStateDisplay, cycleDisplay, profitDisplay, cycleProfitDisplay, startBtn, resetBtn } from '../main.js';
import { actualizarCalculos } from './calculations.js'; // Importar si se necesita para los cálculos del bot

export let isRunning = false; // Estado del bot

export async function loadBotConfigAndState() {
    if (!isLoggedIn) {
        console.log('[FRONTEND] No logueado, no se carga la configuración del bot.');
        if (botStateDisplay) botStateDisplay.textContent = 'STOPPED';
        if (botStateDisplay) botStateDisplay.className = 'text-yellow-400';
        if (startBtn) startBtn.textContent = 'START';
        if (resetBtn) resetBtn.disabled = false;
        if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.disabled = false;
        if (cycleDisplay) cycleDisplay.textContent = '0';
        if (profitDisplay) profitDisplay.textContent = '0.00';
        if (cycleProfitDisplay) cycleProfitDisplay.textContent = '0.00';
        displayLogMessage('Bot configuration not loaded. User not logged in.', 'info');
        return;
    }

    console.log('[FRONTEND] Cargando configuración y estado del bot...');
    try {
        const botData = await fetchFromBackend('/api/user/bot-config-and-state');
        if (botData) {
            console.log('[FRONTEND] Datos del bot cargados:', botData);

            if (purchaseInput) purchaseInput.value = botData.purchase || 5.00;
            if (incrementInput) incrementInput.value = botData.increment || 100;
            if (decrementInput) decrementInput.value = botData.decrement || 1.0;
            if (triggerInput) triggerInput.value = botData.trigger || 1.5;
            if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.checked = botData.stopAtCycleEnd || false;

            isRunning = (botData.state === 'RUNNING');
            if (botStateDisplay) {
                botStateDisplay.textContent = botData.state;
                botStateDisplay.className = isRunning ? 'text-green-400' : 'text-yellow-400';
            }
            if (startBtn) startBtn.textContent = isRunning ? 'STOP' : 'START';
            if (resetBtn) resetBtn.disabled = isRunning;
            if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.disabled = isRunning;

            if (cycleDisplay) cycleDisplay.textContent = botData.cycle || 0;
            if (profitDisplay) profitDisplay.textContent = (botData.profit || 0).toFixed(2);
            if (cycleProfitDisplay) cycleProfitDisplay.textContent = (botData.cycleProfit || 0).toFixed(2);

            actualizarCalculos(); // Recalcula con los nuevos valores del bot
            displayLogMessage(`Bot configuration loaded. State: ${botData.state}.`, 'success');

        } else {
            console.warn('[FRONTEND] No se pudieron cargar los datos del bot. Usando valores predeterminados de la UI.');
            actualizarCalculos();
            displayLogMessage('Failed to load bot configuration. Using default UI values.', 'warning');
        }
    } catch (error) {
        console.error('Error al cargar la configuración y estado del bot:', error);
        actualizarCalculos();
        displayLogMessage(`Error loading bot config: ${error.message}`, 'error');
    }
}

export async function toggleBotState() {
    if (!isLoggedIn) {
        alert("Please login first to control the bot.");
        displayLogMessage("Login required to control the bot.", "warning");
        return;
    }
    if (!startBtn || !resetBtn || !botStateDisplay || !stopAtCycleEndCheckbox) {
        console.warn("Faltan elementos DOM para controlar el estado del bot.");
        displayLogMessage("UI elements missing for bot control.", "error");
        return;
    }

    const purchase = parseFloat(purchaseInput.value);
    const increment = parseFloat(incrementInput.value);
    const decrement = parseFloat(decrementInput.value);
    const trigger = parseFloat(triggerInput.value);
    const stopAtCycleEnd = stopAtCycleEndCheckbox.checked;

    const action = startBtn.textContent === 'START' ? 'start' : 'stop';
    displayLogMessage(`Sending request to ${action} bot...`, 'info');

    try {
        const response = await fetchFromBackend('/api/user/toggle-bot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, params: { purchase, increment, decrement, trigger, stopAtCycleEnd } })
        });

        if (response && response.success) {
            const newBotState = response.botState.state;
            isRunning = (newBotState === 'RUNNING'); // Actualiza el estado local

            cycleDisplay.textContent = response.botState.cycle || 0;
            profitDisplay.textContent = (response.botState.profit || 0).toFixed(2);
            cycleProfitDisplay.textContent = (response.botState.cycleProfit || 0).toFixed(2);

            if (botStateDisplay) {
                botStateDisplay.textContent = newBotState;
                botStateDisplay.className = isRunning ? 'text-green-400' : 'text-yellow-400';
            }
            if (startBtn) startBtn.textContent = isRunning ? 'STOP' : 'START';
            if (resetBtn) resetBtn.disabled = isRunning;
            if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.disabled = isRunning;
            displayLogMessage(`Bot state changed to: ${newBotState}.`, 'success');
        } else {
            throw new Error(response.message || 'Failed to toggle bot state.');
        }
    } catch (error) {
        console.error('Error toggling bot state:', error);
        alert(`Error: ${error.message}`);
        displayLogMessage(`Error toggling bot: ${error.message}`, 'error');
        // Restore previous state on error
        const previousIsRunning = isRunning; // Use the value before the failed attempt
        if (botStateDisplay) {
            botStateDisplay.textContent = previousIsRunning ? 'RUNNING' : 'STOPPED';
            botStateDisplay.className = previousIsRunning ? 'text-green-400' : 'text-yellow-400';
        }
        if (startBtn) startBtn.textContent = previousIsRunning ? 'STOP' : 'START';
        if (resetBtn) resetBtn.disabled = previousIsRunning;
        if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.disabled = previousIsRunning;
    }
}

export function resetBot() {
    if (purchaseInput) purchaseInput.value = 5.00;
    if (incrementInput) incrementInput.value = 100;
    if (decrementInput) decrementInput.value = 1.0;
    if (triggerInput) triggerInput.value = 1.5;
    if (stopAtCycleEndCheckbox) stopAtCycleEndCheckbox.checked = false;
    actualizarCalculos(); // Recalcula con los valores de reinicio
    displayLogMessage('Bot parameters reset to default values.', 'info');
}