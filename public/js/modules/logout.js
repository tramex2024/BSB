// public/js/modules/logout.js

export function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    // Al recargar la página, el updateLoginIcon() del main.js 
    // se ejecutará y verá que no hay token, poniendo la flecha hacia adentro.
    window.location.reload(); 
}