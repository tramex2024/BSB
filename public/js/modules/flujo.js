import { currentBotState } from '../main.js';

export function initializeFlujoView() {
    console.log("🛠️ Inicializando Vista de Flujo...");
    
    const priceDisplay = document.getElementById('flujo-price');
    if (priceDisplay && currentBotState.price > 0) {
        // Renderizado inmediato al entrar a la pestaña
        priceDisplay.textContent = `$${Number(currentBotState.price).toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        })}`;
    }
}