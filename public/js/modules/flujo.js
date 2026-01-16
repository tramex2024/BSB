import { currentBotState } from '../main.js';

export function initializeFlujoView() {
    console.log("📍 Monitor de Flujo Activo");
    
    // Función local para refrescar el DOM
    const refresh = () => {
        const el = document.getElementById('flujo-price');
        if (el && currentBotState.price > 0) {
            el.textContent = `$${Number(currentBotState.price).toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            })}`;
        }
    };

    // Ejecutamos una vez al cargar
    refresh();

    // Creamos un intervalo de seguridad solo para esta prueba
    // Esto asegura que la pestaña lea la memoria del main cada segundo
    const intervalId = setInterval(refresh, 1000);
    
    // Guardamos el intervalo para que main.js pueda limpiarlo al cambiar de pestaña
    window.currentInterval = intervalId; 
}