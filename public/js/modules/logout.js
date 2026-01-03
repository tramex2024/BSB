// public/js/modules/logout.js

export function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    // Forzamos recarga para limpiar sockets y estados del bot
    window.location.reload();
}