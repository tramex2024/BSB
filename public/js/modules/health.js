/**
 * health.js - System Health Indicator logic
 */
export function updateSystemHealth(status) {
    const healthDot = document.getElementById('system-health-dot');
    const healthText = document.getElementById('system-health-text');
    
    if (!healthDot) return;

    // Reset classes
    healthDot.className = 'h-2 w-2 rounded-full transition-all duration-500';

    if (status === 'online') {
        healthDot.classList.add('bg-emerald-500', 'animate-pulse');
        if (healthText) healthText.textContent = 'Server Online';
    } else if (status === 'offline') {
        healthDot.classList.add('bg-red-500');
        if (healthText) healthText.textContent = 'Server Offline';
    } else {
        healthDot.classList.add('bg-gray-500');
        if (healthText) healthText.textContent = 'Connecting...';
    }
}