// public/js/modules/confirmModal.js

/**
 * confirmModal.js - Gestión de diálogos de seguridad para operaciones críticas
 */
// Definimos 'action' con un valor por defecto ('STOP') para no romper llamadas antiguas
export function askConfirmation(sideName, action = 'STOP') { 
    const modal = document.getElementById('confirm-modal');
    const btnAccept = document.getElementById('modal-accept');
    const btnDeny = document.getElementById('modal-deny');
    const msgEl = document.getElementById('modal-message');

    if (!modal) return Promise.resolve(true);

    return new Promise((resolve) => {
        // 1. Lógica de colores adaptativa
        const strategyColor = sideName.toLowerCase() === 'long' ? 'text-emerald-400' : 
                              sideName.toLowerCase() === 'short' ? 'text-orange-400' : 'text-blue-400';
        
        // El color de la acción depende de si es START o STOP
        const isStop = action.toUpperCase() === 'STOP';
        const actionColor = isStop ? 'text-rose-500' : 'text-emerald-500';

        // 2. Mensaje dinámico que respeta el pasado y el presente
        const warningText = isStop 
            ? "This action may leave orphan orders on the exchange and require manual cleanup."
            : "The system will begin automated trading based on your current configuration.";

        msgEl.innerHTML = `
            Are you sure you want to <span class="${actionColor} font-black">${action.toUpperCase()}</span> the 
            <span class="${strategyColor} font-bold">${sideName.toUpperCase()}</span> strategy? 
            <br><br>
            <p class="text-[10px] opacity-70 leading-tight">
                ${warningText}
            </p>
        `;
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        const cleanup = (value) => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            btnAccept.onclick = null;
            btnDeny.onclick = null;
            resolve(value);
        };

        btnAccept.onclick = () => cleanup(true);
        btnDeny.onclick = () => cleanup(false);

        modal.onclick = (e) => { if (e.target === modal) cleanup(false); };
    });
}