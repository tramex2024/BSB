/**
 * support.js - Technical Support Management (WhatsApp & Email)
 * Version: BSB Core 2026 - English Localization
 */

export function initializeSupport() {
    const btnSupport = document.getElementById('btn-support'); 
    const modalSupport = document.getElementById('support-modal');
    const btnClose = document.getElementById('close-support');
    const btnWhatsApp = document.getElementById('whatsapp-support');

    if (btnSupport && modalSupport) {
        btnSupport.addEventListener('click', () => {
            modalSupport.style.display = 'flex'; // Esto lo hace visible
        });
    }

    if (btnClose && modalSupport) {
        btnClose.addEventListener('click', () => {
            modalSupport.style.display = 'none';
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === modalSupport) {
            modalSupport.style.display = 'none';
        }
    });

    if (btnWhatsApp) {
        btnWhatsApp.addEventListener('click', () => {
            const phone = "529625198814"; 
            const message = encodeURIComponent("Hello! 👋 I need technical support with my Bitmart Spot Bots platform.");
            window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
        });
    }
}

/**
 * Generates the WhatsApp link with a predefined English message
 */
export function openWhatsApp() {
    // Your verified number: 52 962 519 8814
    const phone = "529625198814"; 
    const message = encodeURIComponent("Hello! 👋 I need technical support with my Bitmart Spot Bots platform.");
    const url = `https://wa.me/${phone}?text=${message}`;
    
    window.open(url, '_blank');
}