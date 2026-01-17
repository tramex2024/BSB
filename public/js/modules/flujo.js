import { currentBotState } from '../main.js';

export function initializeFlujoView(initialState) {
    console.log("📍 Inicializando Vista Flujo...");
    
    const priceDisplay = document.getElementById('flujo-price');
    
    // 1. SINCRONIZACIÓN INICIAL (El "Empujón")
    // Usamos el initialState que viene directamente del argumento enviado por main.js
    if (priceDisplay && initialState && initialState.price > 0) {
        priceDisplay.textContent = `$${Number(initialState.price).toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        })}`;
        console.log("✅ Precio recuperado de memoria al entrar:", initialState.price);
    } else {
        console.warn("⚠️ No se recibió precio inicial o es 0");
    }

    // Nota: Ya no necesitamos setInterval aquí. 
    // El socket en main.js se encarga de llamar a updateBotUI() 
    // y actualizar este mismo ID mientras la pestaña esté abierta.
}