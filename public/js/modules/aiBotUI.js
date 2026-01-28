/**
 * Módulo de Interfaz para el AI Bot - Versión Optimizada
 */

const aiBotUI = {
    updateConfidence: (confidence) => {
        const circle = document.getElementById('ai-confidence-circle');
        const valueText = document.getElementById('ai-confidence-value');
        const predictionText = document.getElementById('ai-prediction-text');
        
        if (!circle || !valueText || !predictionText) return;

        const percent = confidence <= 1 ? confidence * 100 : confidence;
        const offset = 364.4 - (percent / 100) * 364.4;
        circle.style.strokeDashoffset = offset;
        valueText.innerText = `${Math.round(percent)}%`;

        // Ajuste de clases más robusto
        predictionText.classList.remove('text-blue-300', 'text-emerald-400', 'text-gray-500');

        if (percent > 75) {
            predictionText.innerText = ">> FUERTE IMPULSO: EJECUTANDO ESTRATEGIA";
            predictionText.classList.add('text-emerald-400');
        } else if (percent > 50) {
            predictionText.innerText = ">> SEÑAL EN FORMACIÓN: MONITOREANDO";
            predictionText.classList.add('text-blue-300');
        } else {
            predictionText.innerText = ">> CALIBRANDO: SIN SEÑAL CLARA";
            predictionText.classList.add('text-gray-500');
        }
    },

    addLog: (message) => {
        const container = document.getElementById('ai-log-container');
        if (!container) return;

        const time = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = "text-[9px] border-l-2 border-blue-500 pl-2 mb-1 py-1 bg-blue-500/5 animate-fadeIn";
        logEntry.innerHTML = `<span class="text-blue-700 font-bold">[${time}]</span> <span class="text-gray-300">${message}</span>`;
        
        container.prepend(logEntry);

        if (container.children.length > 20) {
            container.removeChild(container.lastChild);
        }
    },

    updateHistoryTable: (trades) => {
        const tbody = document.getElementById('ai-history-table-body');
        if (!tbody) return;

        // Si trades viene dentro de un objeto 'data' (común en tu controlador)
        const tradesList = Array.isArray(trades) ? trades : (trades.data || []);
        if (tradesList.length === 0) return;

        tbody.innerHTML = tradesList.map(trade => {
            const isBuy = trade.side.toLowerCase() === 'buy';
            // Normalizar el score para evitar NaN
            const score = trade.confidenceScore || trade.confidence || 0;
            const displayScore = score <= 1 ? score * 100 : score;

            return `
                <tr class="hover:bg-blue-500/5 transition-colors border-b border-blue-500/5">
                    <td class="px-6 py-3 text-gray-400 text-[9px]">${new Date(trade.timestamp).toLocaleString()}</td>
                    <td class="px-6 py-3">
                        <span class="px-2 py-0.5 rounded ${isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'} font-black text-[8px]">
                            ${trade.side.toUpperCase()}
                        </span>
                    </td>
                    <td class="px-6 py-3 text-right font-mono text-white">$${(trade.price || 0).toFixed(2)}</td>
                    <td class="px-6 py-3 text-right font-mono text-gray-300">$${(trade.amount || 0).toFixed(2)}</td>
                    <td class="px-6 py-3 text-center">
                        <span class="text-blue-400 font-bold">${Math.round(displayScore)}%</span>
                    </td>
                </tr>
            `;
        }).join('');
    },

    setRunningStatus: (isRunning) => {
        const btn = document.getElementById('btn-start-ai');
        const dot = document.getElementById('ai-status-dot');
        const syncDot = document.getElementById('ai-sync-dot');
        const syncText = document.getElementById('ai-sync-text');

        if (isRunning) {
            if (btn) {
                btn.innerText = "DETENER NÚCLEO IA";
                btn.className = "w-full py-4 bg-red-600/90 hover:bg-red-500 text-white rounded-2xl font-black text-xs transition-all uppercase shadow-lg shadow-red-900/20";
            }
            if (dot) dot.className = "w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]";
            if (syncDot) syncDot.className = "w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse";
            if (syncText) syncText.innerText = "CORE ONLINE";
        } else {
            if (btn) {
                btn.innerText = "ACTIVAR NÚCLEO IA";
                btn.className = "w-full py-4 bg-blue-600/90 hover:bg-blue-500 text-white rounded-2xl font-black text-xs transition-all uppercase shadow-lg shadow-blue-900/40";
            }
            if (dot) dot.className = "w-2.5 h-2.5 bg-gray-500 rounded-full shadow-none";
            if (syncDot) syncDot.className = "w-1.5 h-1.5 bg-gray-500 rounded-full";
            if (syncText) syncText.innerText = "CORE OFFLINE";
        }
    }
};

export default aiBotUI;