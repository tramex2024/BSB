/**
 * AI Bot Interface Module - Optimized 2026
 * Integration: Card-Style Unification & Neural Sync
 * Fix: Removed legacy table logic to support global Card design
 */

const aiBotUI = {
    /**
     * Actualiza el círculo de confianza y el texto descriptivo
     */
    updateConfidence: (confidence, serverMessage = null, isAnalyzing = false) => {
        const circle = document.getElementById('ai-confidence-circle');
        const valueText = document.getElementById('ai-confidence-value');
        const predictionText = document.getElementById('ai-prediction-text');
        
        if (!circle || !valueText || !predictionText) return;

        const percent = confidence <= 1 ? confidence * 100 : confidence;
        const offset = 364.4 - (percent / 100) * 364.4;
        
        circle.style.strokeDashoffset = offset;
        valueText.innerText = `${Math.round(percent)}%`;

        if (percent >= 85) circle.style.stroke = "#10b981"; 
        else if (percent >= 50) circle.style.stroke = "#3b82f6"; 
        else circle.style.stroke = "#6366f1"; 

        predictionText.classList.remove('text-blue-300', 'text-emerald-400', 'text-gray-500', 'animate-pulse');

        if (isAnalyzing) {
            predictionText.innerText = serverMessage || ">> ANALYZING NEURAL FLOW...";
            predictionText.classList.add('text-blue-300', 'animate-pulse');
            return;
        }

        if (serverMessage) {
            predictionText.innerText = `>> ${serverMessage.toUpperCase()}`;
            predictionText.classList.add(percent >= 85 ? 'text-emerald-400' : 'text-blue-300');
        } else {
            if (percent >= 85) {
                predictionText.innerText = ">> STRONG MOMENTUM: ENTRY SIGNAL";
                predictionText.classList.add('text-emerald-400');
            } else {
                predictionText.innerText = ">> CALIBRATING: AWAITING VOLUME";
                predictionText.classList.add('text-gray-500');
            }
        }
    },

    /**
     * Sistema de Logs Neuronales (Mantener para estética de consola IA)
     */
    addLog: function(message, type = 'info') {
        const mockConfidence = (type === 'success') ? 0.90 : 0.50;
        this.addLogEntry(message, mockConfidence);
    },

    addLogEntry: (message, confidence = 0) => {
        const container = document.getElementById('ai-log-container');
        if (!container) return;

        const time = new Date().toLocaleTimeString([], { hour12: false });
        const logEntry = document.createElement('div');
        
        const borderColor = confidence >= 0.85 ? 'border-emerald-500' : 'border-blue-500';
        const textColor = confidence >= 0.85 ? 'text-emerald-400' : 'text-gray-300';

        logEntry.className = `text-[9px] border-l-2 ${borderColor} pl-2 mb-1 py-1 bg-white/5 animate-fadeIn`;
        logEntry.innerHTML = `
            <span class="text-blue-500 font-mono opacity-70">[${time}]</span> 
            <span class="${textColor} font-mono">${message}</span>
        `;
        
        container.prepend(logEntry);

        if (container.children.length > 25) {
            container.removeChild(container.lastChild);
        }
    },

    /**
     * Sincronización de estados del Botón y Feedback Visual
     */
    setRunningStatus: (isRunning, stopAtCycle = null, historyCount = 50) => {
        const btn = document.getElementById('btn-start-ai');
        const dot = document.getElementById('ai-status-dot');
        const syncDot = document.getElementById('ai-sync-dot');
        const syncText = document.getElementById('ai-sync-text');
        const aiInput = document.getElementById('ai-amount-usdt');
        const stopCycleCheck = document.getElementById('ai-stop-at-cycle');

        if (stopCycleCheck && stopAtCycle !== null) {
            stopCycleCheck.checked = !!stopAtCycle;
        }

        if (isRunning) {
            if (btn) {
                const isAnalyzing = (historyCount < 50);
                const targetText = isAnalyzing ? `ANALYZING... (${historyCount}/50)` : "STOP AI CORE";
                
                if (btn.innerText !== targetText) {
                    btn.innerText = targetText;
                    if (isAnalyzing) {
                        btn.className = "w-full py-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded-2xl font-black text-xs animate-pulse transition-all";
                    } else {
                        btn.className = "w-full py-4 bg-red-600/90 hover:bg-red-500 text-white rounded-2xl font-black text-xs transition-all uppercase shadow-lg shadow-red-900/40 active:scale-95";
                    }
                }
            }

            if (dot) dot.className = "w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.7)]";
            if (syncDot) syncDot.className = "w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse";
            if (syncText) syncText.innerText = "AI CORE ACTIVE";
            
            if (aiInput && !aiInput.disabled) {
                aiInput.disabled = true;
                aiInput.classList.add('opacity-40', 'cursor-not-allowed');
            }
        } else {
            if (btn && btn.innerText !== "START AI CORE") {
                btn.innerText = "START AI CORE";
                btn.className = "w-full py-4 bg-blue-600/90 hover:bg-blue-500 text-white rounded-2xl font-black text-xs transition-all uppercase shadow-lg shadow-blue-900/40 active:scale-95";
            }
            if (dot) dot.className = "w-2.5 h-2.5 bg-gray-500 rounded-full shadow-none";
            if (syncDot) syncDot.className = "w-1.5 h-1.5 bg-gray-500 rounded-full";
            if (syncText) syncText.innerText = "STANDBY";
            
            if (aiInput && aiInput.disabled) {
                aiInput.disabled = false;
                aiInput.classList.remove('opacity-40', 'cursor-not-allowed');
            }

            const circle = document.getElementById('ai-confidence-circle');
            if (circle) circle.style.strokeDashoffset = 364.4;
        }
    }
};

export default aiBotUI;