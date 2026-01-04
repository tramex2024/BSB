// public/js/modules/logout.js

export function handleLogout() {
    // Limpiamos todas las credenciales almacenadas
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    
    console.log("Session cleared. Redirecting to login...");
    
    // Recargamos la página para resetear el estado de la App
    window.location.reload(); 
}