/**
 * carousel.js - Lógica de control del carrusel de pasos
 */

let carouselInterval;

export function initCarousel() {
    // Listener del botón de toggle
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

    // Iniciar movimiento automático
    startAutoCarousel();

    // Detener al hacer hover
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

export function checkAndHideGuide(state) {
    const config = state?.config || {};
    const hasApiKeys = config.apiKeysConfigured === true;
    const carouselContainer = document.querySelector('#step-carousel-body')?.parentElement;
    
    if (hasApiKeys) {
        if (carouselContainer) carouselContainer.style.display = 'none';
    } else {
        if (carouselContainer) carouselContainer.style.display = 'block';
    }
}