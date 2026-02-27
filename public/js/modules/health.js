/**
 * health.js - Indicador de estado del servidor en tiempo real
 */

export function updateSystemHealth(status) {
    const healthDot = document.getElementById('system-health-dot');
    const healthText = document.getElementById('system-health-text');
    
    if (!healthDot) return;

    // Reiniciar clases
    healthDot.className = 'h-2.5 w-2.5 rounded-full transition-all duration-500';

    switch (status) {
        case 'online':
            healthDot.classList.add('bg-emerald-500', 'animate-pulse');
            if (healthText) healthText.textContent = 'Server Online';
            break;
        case 'offline':
            healthDot.classList.add('bg-red-500');
            if (healthText) healthText.textContent = 'Server Offline';
            break;
        default:
            healthDot.classList.add('bg-gray-500');
            if (healthText) healthText.textContent = 'Connecting...';
    }
}