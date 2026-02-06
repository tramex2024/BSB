// public/js/modules/aiBotUI.js

/**
 * AI Bot Interface Module - Optimized 2026
 * Integration: Balance Input Control & Neural Sync
 */

const aiBotUI = {
    /**
     * Updates the confidence circle and descriptive text
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
   
    updateHistoryTable: (trades) => {
        const tbody = document.getElementById('ai-history-table-body');
        if (!tbody) return; // Guardia silenciosa

        const tradesList = Array.isArray(trades) ? trades : (trades.data || []);
        
        if (tradesList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center italic text-gray-600 uppercase text-[10px]">No trades in this session</td></tr>`;
            return;
        }

        tbody.innerHTML = tradesList.map(trade => {
            const isBuy = (trade.side || '').toUpperCase() === 'BUY';
            const score = trade.confidenceScore || (trade.confidence * 100) || 0;
            const rawTime = trade.orderTime || trade.updateTime || trade.timestamp;
            const time = rawTime ? new Date(Number(rawTime)).toLocaleTimeString() : '---';

            return `
                <tr class="hover:bg-blue-500/5 transition-colors border-b border-blue-500/5 group">
                    <td class="px-6 py-3 text-gray-500 text-[9px] group-hover:text-gray-300">
                        ${time}
                    </td>
                    <td class="px-6 py-3">
                        <span class="px-2 py-0.5 rounded ${isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'} font-black text-[8px] border ${isBuy ? 'border-emerald-500/20' : 'border-red-500/20'}">
                            ${trade.side ? trade.side.toUpperCase() : 'N/A'}
                        </span>
                    </td>
                    <td class="px-6 py-3 text-right font-mono text-white text-[10px]">
                        $${parseFloat(trade.price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </td>
                    <td class="px-6 py-3 text-right font-mono text-gray-400 text-[10px]">
                        $${parseFloat(trade.amount || trade.size || 0).toFixed(2)}
                    </td>
                    <td class="px-6 py-3 text-center">
                        <span class="${score >= 85 ? 'text-emerald-400' : 'text-blue-400'} font-bold">${Math.round(score)}%</span>
                    </td>
                </tr>
            `;
        }).join('');
    },

    /**
     * MÉTODOS PARA ÓRDENES ABIERTAS (Sincronización WebSocket)
     */
    updateOpenOrdersTable: function(orders) {
        const tbody = document.getElementById('ai-open-orders-body'); 
        
        // 🛡️ GUARDIA SILENCIOSA: No lanzamos error si no está en el DOM actual
        if (!tbody) return;

        const ordersList = Array.isArray(orders) ? orders : (orders.orders || []);

        if (ordersList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500 uppercase text-[9px] tracking-widest opacity-50">No Open Positions</td></tr>`;
            return;
        }

tbody.innerHTML = ordersList.map(order => {
    // 🛡️ Normalización agresiva de campos
    const id = order.orderId || order.order_id || 'N/A';
    const side = (order.side || 'BUY').toUpperCase();
    const isBuy = side === 'BUY';
    
    // BitMart a veces envía 'notional' como el monto en USDT
    const price = parseFloat(order.price || order.orderPrice || 0);
    const amount = parseFloat(order.size || order.amount || order.filledSize || 0);
    
    return `
        <tr class="border-b border-blue-500/5 hover:bg-white/[0.02]">
            <td class="px-6 py-3 font-mono text-[9px] text-blue-400">
                ${id.toString().slice(-6)}
            </td>
            <td class="px-6 py-3">
                <span class="px-2 py-0.5 rounded ${isBuy ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'} font-bold text-[8px]">
                    ${side}
                </span>
            </td>
            <td class="px-6 py-3 text-right text-white font-mono">$${price.toFixed(2)}</td>
            <td class="px-6 py-3 text-right text-gray-400 font-mono">${amount}</td>
            <td class="px-6 py-3 text-right">
                 <button onclick="cancelOrder('${id}')" class="text-red-500 hover:text-red-400">
                    <i class="fas fa-times-circle"></i>
                 </button>
            </td>
        </tr>
    `;
}).join('');
    },

    /**
     * GLOBAL SYNC: UI state driven by Backend
     */
    setRunningStatus: (isRunning, stopAtCycle = null) => {
        // IDs que manejamos
        const elements = {
            btn: document.getElementById('btn-start-ai'),
            dot: document.getElementById('ai-status-dot'),
            syncDot: document.getElementById('ai-sync-dot'),
            syncText: document.getElementById('ai-sync-text'),
            aiInput: document.getElementById('ai-amount-usdt'),
            stopCycleCheck: document.getElementById('ai-stop-at-cycle')
        };

        if (elements.stopCycleCheck && stopAtCycle !== null) {
            elements.stopCycleCheck.checked = stopAtCycle;
        }

        if (isRunning) {
            if (elements.btn) {
                elements.btn.innerText = "STOP AI CORE";
                elements.btn.className = "w-full py-4 bg-red-600/90 hover:bg-red-500 text-white rounded-2xl font-black text-xs transition-all uppercase shadow-lg shadow-red-900/40 active:scale-95";
            }
            if (elements.dot) elements.dot.className = "w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.7)]";
            if (elements.syncDot) elements.syncDot.className = "w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse";
            if (elements.syncText) elements.syncText.innerText = "AI CORE ACTIVE";
            
            if (elements.aiInput) {
                elements.aiInput.disabled = true;
                elements.aiInput.classList.add('opacity-40', 'cursor-not-allowed');
            }
        } else {
            if (elements.btn) {
                elements.btn.innerText = "START AI CORE";
                elements.btn.className = "w-full py-4 bg-blue-600/90 hover:bg-blue-500 text-white rounded-2xl font-black text-xs transition-all uppercase shadow-lg shadow-blue-900/40 active:scale-95";
            }
            if (elements.dot) elements.dot.className = "w-2.5 h-2.5 bg-gray-500 rounded-full shadow-none";
            if (elements.syncDot) elements.syncDot.className = "w-1.5 h-1.5 bg-gray-500 rounded-full";
            if (elements.syncText) elements.syncText.innerText = "STANDBY";
            
            if (elements.aiInput) {
                elements.aiInput.disabled = false;
                elements.aiInput.classList.remove('opacity-40', 'cursor-not-allowed');
            }

            const circle = document.getElementById('ai-confidence-circle');
            if (circle) circle.style.strokeDashoffset = 364.4;
        }
    }
};

export default aiBotUI;