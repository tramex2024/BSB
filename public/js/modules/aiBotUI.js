/**
 * Módulo de Interfaz para el AI Bot
 * Maneja el círculo de confianza, logs y tabla de operaciones.
 */

const aiBotUI = {
    // 1. Actualiza el Círculo de Progreso y el Texto de Predicción
    updateConfidence: (confidence) => {
        const circle = document.getElementById('ai-confidence-circle');
        const valueText = document.getElementById('ai-confidence-value');
        const predictionText = document.getElementById('ai-prediction-text');
        
        if (!circle || !valueText) return;

        // Convertir de 0-1 a 0-100 si es necesario
        const percent = confidence <= 1 ? confidence * 100 : confidence;
        
        // Cálculo del offset (364.4 es el perímetro total)
        const offset = 364.4 - (percent / 100) * 364.4;
        circle.style.strokeDashoffset = offset;
        valueText.innerText = `${Math.round(percent)}%`;

        // Mensajes dinámicos según confianza
        if (percent > 75) {
            predictionText.innerText = ">> FUERTE IMPULSO: EJECUTANDO ESTRATEGIA";
            predictionText.classList.replace('text-blue-300', 'text-emerald-400');
        } else if (percent > 50) {
            predictionText.innerText = ">> SEÑAL EN FORMACIÓN: MONITOREANDO";
            predictionText.classList.replace('text-emerald-400', 'text-blue-300');
        } else {
            predictionText.innerText = ">> CALIBRANDO: SIN SEÑAL CLARA";
            predictionText.className = "mt-4 text-[9px] font-mono text-center text-gray-500 italic uppercase";
        }
    },

    // 2. Añade una línea al LOG negro de la IA
    addLog: (message) => {
        const container = document.getElementById('ai-log-container');
        if (!container) return;

        const time = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = "text-[9px] border-l-2 border-blue-500 pl-2 mb-1 py-1 bg-blue-500/5 animate-fadeIn";
        logEntry.innerHTML = `<span class="text-blue-700 font-bold">[${time}]</span> <span class="text-gray-300">${message}</span>`;
        
        container.prepend(logEntry);

        // Mantener solo los últimos 20 logs para no saturar la memoria
        if (container.children.length > 20) {
            container.removeChild(container.lastChild);
        }
    },

    // 3. Actualiza la tabla de historial de trades
    updateHistoryTable: (trades) => {
        const tbody = document.getElementById('ai-history-table-body');
        if (!tbody) return;

        if (!trades || trades.length === 0) return;

        tbody.innerHTML = trades.map(trade => {
            const isBuy = trade.side.toLowerCase() === 'buy';
            return `
                <tr class="hover:bg-blue-500/5 transition-colors border-b border-blue-500/5">
                    <td class="px-6 py-3 text-gray-400 text-[9px]">${new Date(trade.timestamp).toLocaleString()}</td>
                    <td class="px-6 py-3">
                        <span class="px-2 py-0.5 rounded ${isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'} font-black text-[8px]">
                            ${trade.side.toUpperCase()}
                        </span>
                    </td>
                    <td class="px-6 py-3 text-right font-mono text-white">$${trade.price.toFixed(2)}</td>
                    <td class="px-6 py-3 text-right font-mono text-gray-300">$${trade.amount.toFixed(2)}</td>
                    <td class="px-6 py-3 text-center">
                        <span class="text-blue-400 font-bold">${((trade.confidence || trade.confidenceScore || 0) * (trade.confidence <= 1 ? 100 : 1)).toFixed(0)}%</span>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // 4. Cambia el estado visual del botón y luces
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

// Exportamos para usarlo en el script principal
export default aiBotUI;