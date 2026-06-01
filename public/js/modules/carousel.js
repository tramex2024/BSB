/**
 * carousel.js - Controlador especializado del carrusel
 */

// Declaramos la variable global dentro del módulo para que sea accesible
let carouselInterval = null;

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

    // Limpiamos cualquier intervalo previo usando la variable declarada arriba
    stopAutoCarousel(); 

    carouselInterval = setInterval(() => {
        if (container.scrollLeft + container.clientWidth >= container.scrollWidth - 10) {
            container.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
            container.scrollBy({ left: 200, behavior: 'smooth' });
        }
    }, 4000);
}

export function stopAutoCarousel() {
    if (carouselInterval) {
        clearInterval(carouselInterval);
        carouselInterval = null;
    }
}

export function checkAndHideGuide(state) {
    console.log("🔍 [DEBUG] Estado recibido en checkAndHideGuide:", state);
    
    const config = state?.config || {};
    // Vamos a imprimir qué valor tiene realmente la propiedad
    console.log("🔍 [DEBUG] ¿Qué contiene config?:", config);
    console.log("🔍 [DEBUG] Valor de apiKeysConfigured:", config.apiKeysConfigured);

    const hasApiKeys = config.apiKeysConfigured === true;
    const carouselContainer = document.querySelector('#step-carousel-body');
    
    if (carouselContainer) {
        if (hasApiKeys) {
            carouselContainer.style.display = 'none';
            carouselContainer.classList.add('hidden');
        } else {
            carouselContainer.style.display = 'block';
            carouselContainer.classList.remove('hidden');
        }
    }
}