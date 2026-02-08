// public/js/modules/logout.js

/**
 * logout.js - Session Termination
 * Versión: BSB 2026 - Multiusuario
 */
import { socket } from './socket.js';

export function handleLogout() {
    // 1. Notificar y desconectar el Socket de forma limpia
    if (socket) {
        console.log("🔌 Desconectando Socket...");
        socket.disconnect();
    }

    // 2. Limpiamos TODAS las credenciales almacenadas
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    
    // Opcional: Limpiar cualquier rastro de configuración local si existiera
    // localStorage.clear(); // Usa esto si quieres una limpieza total

    console.log("✅ Session cleared. Redirecting...");
    
    // 3. Recargamos la página
    // Esto resetea el currentBotState en main.js y limpia la memoria del navegador
    window.location.reload(); 
}