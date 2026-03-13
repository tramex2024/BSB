/**
 * confirmModal.js - Safety dialog management (Data-Aware Version)
 * Ahora permite mostrar información técnica del validador o reportes de PnL.
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
            ? "This action may leave orphan orders on the exchange and require manual cleanup."
            : "The system will begin automated trading based on your current configuration.";

        // --- INYECCIÓN DE DATOS DEL VALIDADOR / PREVIEW ---
        let extraInfoHtml = '';
        if (extraData) {
            // Si es un START (viene del strategyValidator)
            if (extraData.coverage) {
                extraInfoHtml = `
                    <div class="mt-3 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-[11px] text-emerald-200">
                        <p><i class="fas fa-shield-alt mr-1"></i> ${extraData.coverage}</p>
                        <p><i class="fas fa-wallet mr-1"></i> ${extraData.netAvailable}</p>
                        <p class="font-bold mt-1 text-white">${extraData.liquidity}</p>
                    </div>
                `;
            } 
            // Si es un STOP (viene del exitReport/PnL)
            else if (extraData.pnlUsdt !== undefined) {
                const pnlColor = extraData.pnlUsdt >= 0 ? 'text-emerald-400' : 'text-red-400';
                extraInfoHtml = `
                    <div class="mt-3 p-2 bg-black/40 border border-white/10 rounded text-[11px]">
                        <p class="uppercase font-bold mb-1">Current Position Report:</p>
                        <div class="flex justify-between">
                            <span>Current PnL:</span>
                            <span class="${pnlColor} font-bold">${extraData.pnlPercentage}% ($${extraData.pnlUsdt})</span>
                        </div>
                        <div class="flex justify-between opacity-70">
                            <span>Assets to Liquidate:</span>
                            <span>${extraData.liquidationAmount} ${extraData.liquidationAsset || 'BTC'}</span>
                        </div>
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
        
        // Estilo del botón
        if (isPanic) {
            btnAccept.classList.replace('bg-emerald-600', 'bg-red-600');
            btnAccept.textContent = "YES, STOP EVERYTHING";
        } else {
            btnAccept.classList.replace('bg-red-600', 'bg-emerald-600');
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