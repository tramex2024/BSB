import { currentBotState } from '../main.js';

export function initializeFlujoView() {
    console.log("📍 Vista Flujo: Sincronizando con memoria del Main...");
    
    const priceDisplay = document.getElementById('flujo-price');
    const debugDisplay = document.getElementById('debug-price');

    if (priceDisplay && currentBotState.price > 0) {
        const formatted = `$${Number(currentBotState.price).toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        })}`;
        
        priceDisplay.textContent = formatted;
        if(debugDisplay) debugDisplay.textContent = currentBotState.price;
    }
}