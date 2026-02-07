/**
 * File: public/js/modules/aibot.js
 * AI Core Sync & Interface Management - Final Sync 2026
 */

import { socket, currentBotState, BACKEND_URL } from '../main.js';
import aiBotUI from './aiBotUI.js';

export function initializeAibotView() {
    console.log("🚀 AI System: Syncing interface...");
    
    // 1. Clean up existing listeners to prevent duplicates
    if (socket) {
        socket.off('ai-status-update');
        socket.off('ai-history-data');
        socket.off('open-orders-update');
        socket.off('ai-order-executed');
        socket.off('ai-decision-update');
        socket.off('market-signal-update');
    }

    setupAISocketListeners();
    setupAIControls();
    
    // 2. Initial sync from Global State
    const { isRunning, stopAtCycle, amountUsdt } = currentBotState.config?.ai || {};

    const aiInput = document.getElementById('ai-amount-usdt');
    if (aiInput && amountUsdt !== undefined) aiInput.value = amountUsdt;

    // Apply visual status
    aiBotUI.setRunningStatus(isRunning, stopAtCycle);

    // 3. Request fresh data if connected
    if (socket && socket.connected) {
        socket.emit('get-ai-status');
        socket.emit('get-ai-history');
        socket.emit('get-open-orders'); 
    }
}

function setupAISocketListeners() {
    if (!socket) return;

    // Status and Virtual Balance
    socket.on('ai-status-update', (data) => {
        currentBotState.aibalance = data.virtualBalance;
        currentBotState.config.ai.enabled = data.isRunning;

        const balEl = document.getElementById('ai-virtual-balance');
        if (balEl && data.virtualBalance !== undefined) {
            balEl.innerText = `$${parseFloat(data.virtualBalance).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        }

        const btnAi = document.getElementById('btn-start-ai');
        
        // Warming up logic (Initial analysis phase)
        if (data.isRunning && data.historyCount < 50) {
            if (btnAi) {
                btnAi.textContent = `ANALYZING... (${data.historyCount}/50)`;
                btnAi.className = "w-full py-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded-2xl font-black text-xs animate-pulse";
            }
        } else {
            aiBotUI.setRunningStatus(data.isRunning, data.stopAtCycle);
        }
    });

    // Neural Decisions & Logs
    socket.on('ai-decision-update', (data) => {
        if (aiBotUI.updateConfidence) aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        if (aiBotUI.addLogEntry) aiBotUI.addLogEntry(data.message, data.confidence);
    });

    // Market Signals (ADX / Stoch)
    socket.on('market-signal-update', (data) => {
        const adxEl = document.getElementById('ai-adx-val');
        const stochEl = document.getElementById('ai-stoch-val');
        if (adxEl && data.adx !== undefined) {
            adxEl.innerText = data.adx.toFixed(1);
            adxEl.className = `text-[10px] font-mono ${data.adx > 25 ? 'text-emerald-400' : 'text-blue-400'}`;
        }
        if (stochEl && data.stochK !== undefined) {
            stochEl.innerText = data.stochK.toFixed(1);
        }
    });

    // Real-time Open Orders
    socket.on('open-orders-update', (orders) => {
        console.log("📥 [AIBOT] Open orders received:", orders);
        if (aiBotUI.updateOpenOrdersTable) aiBotUI.updateOpenOrdersTable(orders);
    });

    // Trade History
    socket.on('ai-history-data', (history) => {
        if (aiBotUI.updateHistoryTable) aiBotUI.updateHistoryTable(history);
    });

    // Execution feedback
    socket.on('ai-order-executed', (order) => {
        showAiToast(order);
        playNeuralSound(order.side);
        socket.emit('get-ai-history'); 
    });
}

function setupAIControls() {
    const aiInputs = [
        document.getElementById('ai-amount-usdt'),
        document.getElementById('auamountai-usdt')
    ].filter(Boolean);
    
    const stopCycleChecks = [
        document.getElementById('au-stop-ai-at-cycle'),
        document.getElementById('ai-stop-at-cycle')
    ].filter(Boolean);

    const btnStartAi = document.getElementById('btn-start-ai');

    // Sync Amount Inputs
    aiInputs.forEach(input => {
        input.addEventListener('change', async () => {
            const val = parseFloat(input.value);
            if (isNaN(val) || val <= 0) return;
            aiInputs.forEach(i => { if(i !== input) i.value = val; });
            await saveAIConfig({ amountUsdt: val });
        });
    });

    // Sync Checkboxes
    stopCycleChecks.forEach(check => {
        check.addEventListener('change', async () => {
            const state = check.checked;
            stopCycleChecks.forEach(c => { if(c !== check) c.checked = state; });
            await saveAIConfig({ stopAtCycle: state });
        });
    });

    // Start/Stop Toggle
    if (btnStartAi) {
        // Remove old listeners by cloning
        const newBtn = btnStartAi.cloneNode(true);
        btnStartAi.parentNode.replaceChild(newBtn, btnStartAi);
        
        newBtn.addEventListener('click', async () => {
            const isRunning = currentBotState.config.ai.enabled;
            const action = isRunning ? 'stop' : 'start';
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
                    currentBotState.config.ai.enabled = result.isRunning;
                    aiBotUI.setRunningStatus(result.isRunning, stopCycleChecks[0]?.checked);
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
        if (data.success && aiBotUI.addLogEntry) {
            const key = Object.keys(payload)[0];
            const msg = key === 'stopAtCycle' 
                ? `Smart Cycle: ${payload[key] ? 'ENABLED' : 'DISABLED'}`
                : `Config: Amount updated to $${payload[key]} USDT`;
            aiBotUI.addLogEntry(msg, 0.5);
        }
    } catch (error) {
        console.error("❌ Error saving AI config:", error);
    }
}

function showAiToast(order) {
    const toast = document.createElement('div');
    const isBuy = order.side.toUpperCase() === 'BUY';
    
    toast.className = `fixed bottom-5 right-5 z-[100] p-4 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-500 transform translate-y-0 ${
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
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(side.toUpperCase() === 'BUY' ? 880 : 440, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {}
}
