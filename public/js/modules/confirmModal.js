// public/js/modules/confirmModal.js

/**
 * confirmModal.js - Safety dialog management for critical operations
 * Shielded against CSS conflicts and synchronized in English.
 */

export function askConfirmation(sideName, action = 'STOP') { 
    const modal = document.getElementById('confirm-modal');
    const btnAccept = document.getElementById('modal-accept');
    const btnDeny = document.getElementById('modal-deny');
    const msgEl = document.getElementById('modal-message');

    // If modal element is missing, we bypass for safety but log a warning.
    if (!modal) {
        console.warn("⚠️ Confirm Modal element not found in DOM. Proceeding without confirmation.");
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        // 1. Adaptive color logic
        const strategyColor = sideName.toLowerCase() === 'long' ? 'text-emerald-400' : 
                              sideName.toLowerCase() === 'short' ? 'text-orange-400' : 'text-blue-400';
        
        const isStop = action.toUpperCase() === 'STOP';
        const actionColor = isStop ? 'text-rose-500' : 'text-emerald-500';

        // 2. English Message Definitions
        const warningText = isStop 
            ? "This action may leave orphan orders on the exchange and require manual cleanup."
            : "The system will begin automated trading based on your current configuration.";

        // Dynamic content injection
        msgEl.innerHTML = `
            Are you sure you want to <span class="${actionColor} font-black">${action.toUpperCase()}</span> the 
            <span class="${strategyColor} font-bold">${sideName.toUpperCase()}</span> strategy? 
            <br><br>
            <p class="text-[10px] opacity-70 leading-tight">
                ${warningText}
            </p>
        `;
        
        // 3. FORCE VISIBILITY (CSS Specificity Bypass)
        // Using setProperty to override any 'display: none' in static CSS files
        modal.style.setProperty('display', 'flex', 'important');
        modal.classList.remove('hidden');

        // Cleanup and close function
        const cleanup = (value) => {
            modal.style.setProperty('display', 'none', 'important');
            modal.classList.add('hidden');
            
            // Clear events to prevent duplicate executions on next click
            btnAccept.onclick = null;
            btnDeny.onclick = null;
            modal.onclick = null;
            
            resolve(value);
        };

        // Event Assignment
        btnAccept.onclick = (e) => {
            e.stopPropagation();
            cleanup(true);
        };

        btnDeny.onclick = (e) => {
            e.stopPropagation();
            cleanup(false);
        };

        // Close if user clicks on the dark backdrop
        modal.onclick = (e) => {
            if (e.target === modal) cleanup(false);
        };
    });
}