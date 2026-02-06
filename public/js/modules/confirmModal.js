// public/js/modules/confirmModal.js

/**
 * confirmModal.js - Gestión de diálogos de seguridad para operaciones críticas
 */
export function askConfirmation(sideName) {
    const modal = document.getElementById('confirm-modal');
    const btnAccept = document.getElementById('modal-accept');
    const btnDeny = document.getElementById('modal-deny');
    const msgEl = document.getElementById('modal-message');

    if (!modal) {
        console.warn("⚠️ ConfirmModal: No se encontró el contenedor en el DOM.");
        return Promise.resolve(true); 
    }

    return new Promise((resolve) => {
        // 1. Personalización dinámica del mensaje
        const strategyColor = sideName === 'long' ? 'text-emerald-400' : sideName === 'short' ? 'text-orange-400' : 'text-indigo-400';
        
        msgEl.innerHTML = `
            Are you sure you want to <span class="text-red-500 font-black">STOP</span> the 
            <span class="${strategyColor} font-bold">${sideName.toUpperCase()}</span> strategy? 
            <br><br>
            <p class="text-[10px] opacity-70 leading-tight">
                This may leave orphan orders on the exchange and require manual cleanup to release your balance.
            </p>
        `;
        
        // 2. Mostrar con animación (si tienes clases de Tailwind/CSS)
        modal.classList.remove('hidden');
        modal.classList.add('flex', 'animate-fadeIn');

        // 3. Limpieza de listeners previos para evitar ejecuciones múltiples
        const cleanup = (value) => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            btnAccept.onclick = null;
            btnDeny.onclick = null;
            resolve(value);
        };

        btnAccept.onclick = () => cleanup(true);
        btnDeny.onclick = () => cleanup(false);

        // 4. Cerrar al hacer clic fuera del contenido (Opcional pero recomendado)
        modal.onclick = (e) => {
            if (e.target === modal) cleanup(false);
        };
    });
}