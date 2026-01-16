import { currentBotState } from '../main.js';

let lastFlujoPrice = 0;

export function initializeFlujoView() {
    console.log("📍 Monitor de Flujo Activo - Sincronizado con Main");
    
    const priceDisplay = document.getElementById('flujo-price');

    // Función local para refrescar el DOM desde la memoria del Main
    const refresh = () => {
        if (!priceDisplay) return;

        const currentPrice = Number(currentBotState.price);
        
        if (currentPrice > 0 && currentPrice !== lastFlujoPrice) {
            // Cambio de color visual para confirmar movimiento
            if (lastFlujoPrice > 0) {
                priceDisplay.className = currentPrice > lastFlujoPrice 
                    ? 'text-6xl font-mono font-bold text-emerald-400' 
                    : 'text-6xl font-mono font-bold text-red-400';
            }

            priceDisplay.textContent = `$${currentPrice.toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            })}`;
            
            lastFlujoPrice = currentPrice;
        }
    };

    // 1. Ejecución inmediata (quita los ceros al instante si ya hay datos en Main)
    refresh();

    // 2. Intervalo de seguridad (para asegurar la actualización visual)
    const intervalId = setInterval(refresh, 500);
    
    // 3. Registro para limpieza (Evita que el intervalo siga corriendo en otras pestañas)
    // Usamos el objeto global de intervalos definido en main.js
    import('../main.js').then(m => {
        if (m.intervals) m.intervals.flujo = intervalId;
    });
}