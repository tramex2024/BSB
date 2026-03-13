/**
 * confirmModal.js - Safety dialog management (Data-Aware Version)
 * Versión 2026: Reporte detallado de liquidación basado en DB MongoDB.
 */

export function askConfirmation(sideName, action = 'STOP', extraData = null) { 
    const modal = document.getElementById('confirm-modal');
    const btnAccept = document.getElementById('modal-accept');
    const btnDeny = document.getElementById('modal-deny');
    const msgEl = document.getElementById('modal-message');

    if (!modal) {
        console.warn("⚠️ Confirm Modal element not found.");
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        // 1. DETECTAR SI ES PANIC STOP
        const isPanic = sideName.includes('PANIC') || action.includes('PANIC');

        // 2. LÓGICA DE COLORES ADAPTATIVA
        let strategyColor = 'text-blue-400';
        if (sideName.toLowerCase() === 'long') strategyColor = 'text-emerald-400';
        if (sideName.toLowerCase() === 'short') strategyColor = 'text-orange-400';
        if (isPanic) strategyColor = 'text-red-500 font-black animate-pulse';

        const isStop = action.toUpperCase().includes('STOP');
        const actionColor = isPanic ? 'text-red-600' : (isStop ? 'text-rose-500' : 'text-emerald-500');

        // 3. DEFINICIÓN DE MENSAJES (DINÁMICOS)
        let warningText = isStop 
            ? "This action will attempt to market-sell accumulated assets and cancel pending orders."
            : "The system will begin automated trading based on your current configuration.";

        // --- INYECCIÓN DE DATOS DEL VALIDADOR / PREVIEW ---
        let extraInfoHtml = '';
        if (extraData) {
            // A. REPORTE DE INICIO (START)
            if (extraData.coverage) {
                extraInfoHtml = `
                    <div class="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[11px] text-emerald-200">
                        <div class="flex items-center mb-1"><i class="fas fa-shield-alt mr-2"></i> ${extraData.coverage}</div>
                        <div class="flex items-center mb-1"><i class="fas fa-wallet mr-2"></i> ${extraData.netAvailable}</div>
                        <div class="font-bold mt-2 text-white border-t border-white/10 pt-1">${extraData.liquidity}</div>
                    </div>
                `;
            } 
            // B. REPORTE DE LIQUIDACIÓN (STOP) - Mapeado a parámetros de tu DB
            else if (extraData.pnlUsdt !== undefined) {
                const pnlColor = parseFloat(extraData.pnlUsdt) >= 0 ? 'text-emerald-400' : 'text-red-400';
                const pnlIcon = parseFloat(extraData.pnlUsdt) >= 0 ? 'fa-chart-line' : 'fa-chart-area';

                extraInfoHtml = `
                    <div class="mt-3 p-3 bg-black/40 border border-white/10 rounded-lg shadow-inner">
                        <div class="flex justify-between items-center mb-2 border-b border-white/5 pb-2">
                            <span class="text-[10px] uppercase tracking-widest opacity-60">Neural Position Report</span>
                            <span class="${pnlColor} text-xs font-bold">
                                <i class="fas ${pnlIcon} mr-1"></i> ${extraData.pnlPercentage}%
                            </span>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-y-2 text-[11px]">
                            <div class="text-white/60">Profit/Loss (USDT):</div>
                            <div class="text-right ${pnlColor} font-mono font-bold">$${extraData.pnlUsdt}</div>
                            
                            <div class="text-white/60">Assets to Sell:</div>
                            <div class="text-right font-mono text-white">${extraData.liquidationAmount} ${extraData.liquidationAsset || 'BTC'}</div>
                            
                            <div class="text-white/60">Avg. Entry Price:</div>
                            <div class="text-right font-mono text-white">$${extraData.avgPrice || '0.00'}</div>
                            
                            <div class="text-white/60">Open Orders:</div>
                            <div class="text-right text-orange-400 font-bold">${extraData.openOrders || '0'}</div>
                        </div>

                        ${parseFloat(extraData.pnlUsdt) < 0 ? `
                            <div class="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-[9px] text-red-400 text-center animate-pulse italic">
                                <i class="fas fa-exclamation-triangle mr-1"></i> Warning: Closing position with negative PnL
                            </div>
                        ` : ''}
                    </div>
                `;
            }
        }

        let mainMessage = `Are you sure you want to <span class="${actionColor} font-black">${action.toUpperCase()}</span> the <span class="${strategyColor}">${sideName.toUpperCase()}</span> strategy?`;

        // Sobreescribir si es Pánico
        if (isPanic) {
            mainMessage = `
                <div class="text-center">
                    <i class="fas fa-radiation-alt text-4xl text-red-500 mb-3 block animate-spin-slow"></i>
                    <span class="text-red-500 text-xl font-black uppercase">CRITICAL SYSTEM HALT</span><br>
                    <span class="text-white">Are you sure you want to execute a <span class="bg-red-600 px-1 rounded">PANIC STOP</span>?</span>
                </div>
            `;
            warningText = "EMERGENCY: This will immediately stop ALL active bots and attempt to cancel all pending orders. This is a total system shutdown.";
        }

        // Inyección de contenido final
        msgEl.innerHTML = `
            ${mainMessage}
            ${extraInfoHtml}
            <br>
            <p class="text-[10px] opacity-70 leading-tight bg-black/30 p-2 rounded border border-white/10">
                ${warningText}
            </p>
        `;
        
        // Estilo del botón dinámico
        if (isPanic) {
            btnAccept.className = "flex-1 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-bold transition-all";
            btnAccept.textContent = "YES, STOP EVERYTHING";
        } else {
            const acceptColor = isStop ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700';
            btnAccept.className = `flex-1 py-2 rounded ${acceptColor} text-white font-bold transition-all`;
            btnAccept.textContent = "CONFIRM";
        }

        // 4. MOSTRAR MODAL
        modal.style.setProperty('display', 'flex', 'important');
        modal.classList.remove('hidden');

        const cleanup = (value) => {
            modal.style.setProperty('display', 'none', 'important');
            modal.classList.add('hidden');
            btnAccept.onclick = null;
            btnDeny.onclick = null;
            modal.onclick = null;
            resolve(value);
        };

        btnAccept.onclick = (e) => { e.stopPropagation(); cleanup(true); };
        btnDeny.onclick = (e) => { e.stopPropagation(); cleanup(false); };
        modal.onclick = (e) => { if (e.target === modal) cleanup(false); };
    });
}