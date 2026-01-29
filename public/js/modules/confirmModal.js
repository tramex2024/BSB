// public/js/modules/confirmModal.js

export function askConfirmation(sideName) {
    const modal = document.getElementById('confirm-modal');
    const btnAccept = document.getElementById('modal-accept');
    const btnDeny = document.getElementById('modal-deny');
    const msgEl = document.getElementById('modal-message');

    // Si por error el modal no está en el HTML actual, dejamos pasar la acción
    if (!modal) return Promise.resolve(true);

    return new Promise((resolve) => {
        msgEl.innerText = `¿Estás seguro de que deseas DETENER la estrategia ${sideName.toUpperCase()}? Esto podría dejar órdenes huérfanas en el exchange.`;
        
        // Mostrar modal
        modal.classList.remove('hidden');

        // Definir qué pasa al hacer clic
        btnAccept.onclick = () => {
            modal.classList.add('hidden');
            resolve(true);
        };

        btnDeny.onclick = () => {
            modal.classList.add('hidden');
            resolve(false);
        };
    });
}