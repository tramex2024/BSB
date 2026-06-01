/**
 * carousel.js - Módulo delegado de Guía de Usuario
 */

let carouselInterval;

export function setupCarousel() {
    // 1. Conexión del botón de toggle
    const btnToggle = document.getElementById('btn-toggle-carousel');
    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            const body = document.getElementById('step-carousel-body');
            const chevron = document.getElementById('carousel-chevron');
            if (body && chevron) {
                body.classList.toggle('hidden');
                chevron.classList.toggle('rotate-180');
            }
        });
    }

    // 2. Configuración del scroll con mouse
    const container = document.querySelector('.custom-scrollbar');
    if (container) {
        container.addEventListener('mouseenter', () => clearInterval(carouselInterval));
        container.addEventListener('mouseleave', startAutoCarousel);
    }
}

export function startAutoCarousel() {
    const container = document.querySelector('.custom-scrollbar');
    if (!container) return;

    clearInterval(carouselInterval);
    carouselInterval = setInterval(() => {
        if (container.scrollLeft + container.clientWidth >= container.scrollWidth - 10) {
            container.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
            container.scrollBy({ left: 200, behavior: 'smooth' });
        }
    }, 4000);
}

export function stopAutoCarousel() {
    clearInterval(carouselInterval);
}

export function checkAndHideGuide(state) {
    console.log("🔍 Diagnóstico Carrusel: Estado del estado:", state);
    const config = state?.config || {};
    const hasApiKeys = config.apiKeysConfigured === true;
    const carouselContainer = document.querySelector('#step-carousel-body')?.parentElement;
    
    if (hasApiKeys) {
        if (carouselContainer) carouselContainer.style.display = 'none';
    } else {
        if (carouselContainer) carouselContainer.style.display = 'block';
    }
}