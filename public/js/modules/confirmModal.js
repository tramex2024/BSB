// public/js/modules/confirmModal.js

export function askConfirmation(sideName) {
    const modal = document.getElementById('confirm-modal');
    const btnAccept = document.getElementById('modal-accept');
    const btnDeny = document.getElementById('modal-deny');
    const msgEl = document.getElementById('modal-message');

    // If for some reason the modal is not in the current HTML, allow the action
    if (!modal) return Promise.resolve(true);

    return new Promise((resolve) => {
        // Updated text to English
        msgEl.innerText = `Are you sure you want to STOP the ${sideName.toUpperCase()} strategy? This may leave orphan orders on the exchange and require manual cleanup.`;
        
        // Show modal
        modal.classList.remove('hidden');

        // Handle clicks
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