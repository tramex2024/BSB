// public/js/modules/confirmModal.js

/**
 * confirmModal.js - Gestión de diálogos de seguridad para operaciones críticas
 * Blindado contra conflictos de CSS y sincronizado en Inglés.
 */

export function askConfirmation(sideName, action = 'STOP') { 
    const modal = document.getElementById('confirm-modal');
    const btnAccept = document.getElementById('modal-accept');
    const btnDeny = document.getElementById('modal-deny');
    const msgEl = document.getElementById('modal-message');

    // Si el modal no existe, dejamos pasar la acción por seguridad, pero avisamos.
    if (!modal) {
        console.warn("⚠️ Confirm Modal element not found in DOM. Proceeding without confirmation.");
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        // 1. Lógica de colores adaptativa
        const strategyColor = sideName.toLowerCase() === 'long' ? 'text-emerald-400' : 
                              sideName.toLowerCase() === 'short' ? 'text-orange-400' : 'text-blue-400';
        
        const isStop = action.toUpperCase() === 'STOP';
        const actionColor = isStop ? 'text-rose-500' : 'text-emerald-500';

        // 2. Definición de mensajes en Inglés
        const warningText = isStop 
            ? "This action may leave orphan orders on the exchange and require manual cleanup."
            : "The system will begin automated trading based on your current configuration.";

        // Inyección dinámica del contenido
        msgEl.innerHTML = `
            Are you sure you want to <span class="${actionColor} font-black">${action.toUpperCase()}</span> the 
            <span class="${strategyColor} font-bold">${sideName.toUpperCase()}</span> strategy? 
            <br><br>
            <p class="text-[10px] opacity-70 leading-tight">
                ${warningText}
            </p>
        `;
        
        // 3. FORZAR VISIBILIDAD (Bypass de especificidad CSS)
        // Usamos setProperty para sobreescribir cualquier 'display: none' en style.css
        modal.style.setProperty('display', 'flex', 'important');
        modal.classList.remove('hidden');

        // Función de cierre y limpieza
        const cleanup = (value) => {
            modal.style.setProperty('display', 'none', 'important');
            modal.classList.add('hidden');
            
            // Limpiamos eventos para evitar ejecuciones duplicadas en el próximo clic
            btnAccept.onclick = null;
            btnDeny.onclick = null;
            modal.onclick = null;
            
            resolve(value);
        };

        // Asignación de eventos
        btnAccept.onclick = (e) => {
            e.stopPropagation();
            cleanup(true);
        };

        btnDeny.onclick = (e) => {
            e.stopPropagation();
            cleanup(false);
        };

        // Cerrar si el usuario hace clic en el fondo oscuro (fuera del cuadro)
        modal.onclick = (e) => {
            if (e.target === modal) cleanup(false);
        };
    });
}