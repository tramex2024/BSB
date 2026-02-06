import { logStatus } from '../../main.js';

export function displayMessage(message, type = 'info') {
    logStatus(message, type);
    let container = document.getElementById('message-container');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'message-container';
        document.body.appendChild(container);
    }
    
    container.textContent = message;
    container.className = `fixed bottom-5 right-5 px-4 py-2 rounded-lg text-white text-[10px] font-bold shadow-2xl z-50 transition-all transform ${
        type === 'error' ? 'bg-red-500' : (type === 'success' ? 'bg-emerald-500' : 'bg-blue-500')
    }`;

    setTimeout(() => {
        container.classList.add('opacity-0', 'translate-y-4');
        setTimeout(() => container.remove(), 500);
    }, 3000);
}