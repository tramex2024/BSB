/**
 * carousel.js - Controlador especializado del carrusel
 */

export function initCarousel() {
    // 1. Conectar botón de toggle
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

    // 2. Iniciar auto-scroll
    startAutoCarousel();

    // 3. Pausar en hover
    const container = document.querySelector('.custom-scrollbar');
    if (container) {
        container.addEventListener('mouseenter', stopAutoCarousel);
        container.addEventListener('mouseleave', startAutoCarousel);
    }
}

export function startAutoCarousel() {
    const container = document.querySelector('.custom-scrollbar');
    if (!container) return;

    stopAutoCarousel(); // Limpiar previo

    carouselInterval = setInterval(() => {
        if (container.scrollLeft + container.clientWidth >= container.scrollWidth - 10) {
            container.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
            container.scrollBy({ left: 200, behavior: 'smooth' });
        }
    }, 4000);
}

export function stopAutoCarousel() {
    if (carouselInterval) clearInterval(carouselInterval);
}

// Nueva versión robusta de checkAndHideGuide
export function checkAndHideGuide(state) {
    const config = state?.config || {};
    const hasApiKeys = config.apiKeysConfigured === true;
    const carouselContainer = document.querySelector('#step-carousel-body');
    
    if (carouselContainer) {
        // Si NO tiene llaves, lo mostramos. Si tiene, lo mantenemos oculto (el CSS ya lo hizo).
        if (!hasApiKeys) {
            carouselContainer.style.display = 'block'; 
            carouselContainer.classList.remove('hidden');
        } else {
            carouselContainer.style.display = 'none';
            carouselContainer.classList.add('hidden');
        }
    }
}