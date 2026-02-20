/**
 * AI Bot Interface Module - Optimized 2026
 * Versión Blindada: Eliminación de parpadeos y optimización de renderizado
 */

const aiBotUI = {
    // Variable interna para evitar re-renderizados idénticos y jitter visual
    lastPercent: -1,
    lastMsg: '',

    /**
     * Actualiza el círculo de confianza y el texto descriptivo del motor neural
     */
    updateConfidence: function(confidence, serverMessage = null, isAnalyzing = false) {
        const circle = document.getElementById('ai-confidence-circle');
        const valueText = document.getElementById('ai-confidence-value');
        const predictionText = document.getElementById('ai-prediction-text');
        
        if (!circle || !valueText || !predictionText) return;

        // 1. Normalización Robusta
        let percent = confidence <= 1 ? confidence * 100 : confidence;
        percent = Math.max(0, Math.min(100, percent)); // Clamp entre 0 y 100
        if (isNaN(percent)) percent = 0;

        // 2. Filtro de Estabilidad: Si el cambio es insignificante, no movemos la aguja
        if (Math.abs(this.lastPercent - percent) < 0.5 && !isAnalyzing && this.lastPercent !== -1) {
            // Solo actualizamos el mensaje si ha cambiado
        } else {
            this.lastPercent = percent;
            const offset = 364.4 - (percent / 100) * 364.4;
            
            // Aplicamos la transición solo si es necesario mover
            circle.style.transition = "stroke-dashoffset 0.8s ease-out, stroke 0.5s ease";
            circle.style.strokeDashoffset = offset;
            valueText.innerText = `${Math.round(percent)}%`;

            // Colores dinámicos optimizados
            const color = percent >= 85 ? "#10b981" : (percent >= 50 ? "#3b82f6" : "#6366f1");
            if (circle.style.stroke !== color) circle.style.stroke = color;
        }

        // 3. Gestión de Mensajes sin parpadeo de clases
        let msg = "";
        let msgClass = "font-mono text-[10px] mt-2 transition-all duration-300 ";

        if (isAnalyzing) {
            msg = ">> ANALYZING NEURAL FLOW...";
            msgClass += "text-blue-300 animate-pulse";
        } else if (serverMessage) {
            const displayMsg = serverMessage === 'HOLD' ? 'STABLE: SCANNING TREND' : serverMessage;
            msg = `>> ${displayMsg.toUpperCase()}`;
            msgClass += (percent >= 75 ? 'text-emerald-400' : 'text-blue-300');
        } else {
            msg = percent >= 75 ? ">> STRONG MOMENTUM: ENTRY SIGNAL" : ">> NEUTRAL: SCANNING MARKET";
            msgClass += percent >= 75 ? "text-emerald-400" : "text-gray-500";
        }

        // Solo inyectamos en el DOM si el mensaje cambió realmente
        if (this.lastMsg !== msg) {
            predictionText.innerText = msg;
            predictionText.className = msgClass;
            this.lastMsg = msg;
        }
    },

    /**
     * Sistema de Logs Neuronales
     */
    addLog: function(message, type = 'info') {
        let visualConfidence = 0.01;
        if (type === 'success' || type === 'buy' || type === 'sell') visualConfidence = 0.90;
        if (type === 'warning') visualConfidence = 0.50;

        this.addLogEntry(message, visualConfidence);
    },

    addLogEntry: (message, confidence = 0) => {
        const container = document.getElementById('ai-log-container');
        if (!container) return;

        // Evitar mensajes duplicados idénticos seguidos
        if (container.firstChild && container.firstChild.innerText.includes(message)) return;

        const time = new Date().toLocaleTimeString([], { hour12: false });
        const logEntry = document.createElement('div');
        
        const isHighConf = confidence >= 0.75;
        const borderColor = isHighConf ? 'border-emerald-500' : 'border-blue-500/30';
        const textColor = isHighConf ? 'text-emerald-400' : 'text-gray-400';

        logEntry.className = `text-[9px] border-l-2 ${borderColor} pl-2 mb-1 py-1 bg-white/5 animate-fadeIn`;
        logEntry.innerHTML = `
            <span class="text-blue-500 font-mono opacity-70">[${time}]</span> 
            <span class="${textColor} font-mono">${message}</span>
        `;
        
        container.prepend(logEntry);
        if (container.children.length > 25) container.removeChild(container.lastChild);
    },

    /**
     * Sincronización de estados del Botón y Campos
     */
    setRunningStatus: (isRunning, stopAtCycle = null, historyCount = 0) => {
        const btn = document.getElementById('btn-start-ai');
        const elements = {
            dot: document.getElementById('ai-status-dot'),
            syncDot: document.getElementById('ai-sync-dot'),
            syncText: document.getElementById('ai-sync-text'),
            aiInput: document.getElementById('ai-amount-usdt'),
            stopCycleCheck: document.getElementById('ai-stop-at-cycle')
        };

        if (elements.stopCycleCheck && stopAtCycle !== null) {
            elements.stopCycleCheck.checked = !!stopAtCycle;
        }

        if (isRunning) {
            const isSyncing = (historyCount < 200);
            if (btn) {
                const targetText = isSyncing ? "INITIALIZING NEURAL CORE..." : "STOP AI CORE";
                // Solo actualizamos si el texto es diferente para no cortar animaciones CSS
                if (btn.innerText !== targetText) {
                    btn.innerText = targetText;
                    btn.className = isSyncing 
                        ? "w-full py-4 bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 rounded-2xl font-black text-xs animate-pulse cursor-wait"
                        : "w-full py-4 bg-red-600/90 hover:bg-red-500 text-white rounded-2xl font-black text-xs transition-all uppercase shadow-lg shadow-red-900/40 active:scale-95";
                }
            }

            if (elements.dot) elements.dot.className = "w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.7)]";
            if (elements.syncDot) elements.syncDot.className = "w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse";
            if (elements.syncText) elements.syncText.innerText = isSyncing ? "SYNCING DATA..." : "AI CORE ACTIVE";
            
            if (elements.aiInput && !elements.aiInput.disabled) { 
                elements.aiInput.disabled = true; 
                elements.aiInput.classList.add('opacity-40', 'cursor-not-allowed'); 
            }
        } else {
            if (btn && btn.innerText !== "START AI CORE") {
                btn.innerText = "START AI CORE";
                btn.className = "w-full py-4 bg-blue-600/90 hover:bg-blue-500 text-white rounded-2xl font-black text-xs transition-all uppercase shadow-lg shadow-blue-900/40 active:scale-95";
            }
            if (elements.dot) elements.dot.className = "w-2.5 h-2.5 bg-gray-500 rounded-full shadow-none";
            if (elements.syncDot) elements.syncDot.className = "w-1.5 h-1.5 bg-gray-500 rounded-full";
            if (elements.syncText) elements.syncText.innerText = "STANDBY";
            
            if (elements.aiInput && elements.aiInput.disabled) { 
                elements.aiInput.disabled = false; 
                elements.aiInput.classList.remove('opacity-40', 'cursor-not-allowed'); 
            }

            const circle = document.getElementById('ai-confidence-circle');
            if (circle) circle.style.strokeDashoffset = 364.4;
        }
    }
};

export default aiBotUI;