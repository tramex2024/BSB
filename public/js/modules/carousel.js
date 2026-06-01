/**
 * carousel.js - Controlador especializado del carrusel
 */

/**
 * carousel.js - Controlador especializado (Versión Delegada)
 */

let carouselInterval = null;
let isCarouselVisible = true;

export function initCarousel() {
    // 1. ELIMINAR CUALQUIER LISTENER ANTIGUO para evitar duplicados
    const oldBtn = document.getElementById('btn-toggle-carousel');
    const newBtn = oldBtn ? oldBtn.cloneNode(true) : null;
    if (oldBtn && newBtn) oldBtn.parentNode.replaceChild(newBtn, oldBtn);

    // 2. DELEGACIÓN DE EVENTO: Escuchamos en el documento
    // Esto funciona aunque el botón se cree después
    document.addEventListener('click', function(event) {
        if (event.target && (event.target.id === 'btn-toggle-carousel' || event.target.closest('#btn-toggle-carousel'))) {
            const body = document.getElementById('step-carousel-body');
            const chevron = document.getElementById('carousel-chevron');
            
            if (!body) return;

            isCarouselVisible = !isCarouselVisible;

            if (isCarouselVisible) {
                body.style.display = 'block';
                body.classList.remove('hidden');
                if (chevron) chevron.classList.remove('rotate-180');
                startAutoCarousel();
            } else {
                body.style.display = 'none';
                body.classList.add('hidden');
                if (chevron) chevron.classList.add('rotate-180');
                stopAutoCarousel();
            }
        }
    });

    // 3. Inicio estándar
    startAutoCarousel();
}

    // Aseguramos limpieza antes de empezar
function startAutoCarousel() {
    const container = document.querySelector('.custom-scrollbar');
    if (!container) return;

    // LIMPIEZA CRÍTICA: Evita acumulaciones al cambiar de tabs
    if (window.carouselInterval) clearInterval(window.carouselInterval);
    
    // Reset visual
    container.scrollTo({ left: 0, behavior: 'auto' });

    window.carouselInterval = setInterval(() => {
        // Lógica de movimiento...
    }, 4000);
}

export function startAutoCarousel() {
    const container = document.querySelector('.custom-scrollbar');
    if (!container) return;

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

// Mantenemos esta función para que el Dashboard la use cuando decida ocultar
// automáticamente basándose en la configuración de APIs
export function checkAndHideGuide(state) {
    const config = state?.config || {};
    const hasApiKeys = config.apiKeysConfigured === true;
    const carouselContainer = document.querySelector('#step-carousel-body');
    
    if (carouselContainer && hasApiKeys) {
        carouselContainer.style.display = 'none';
        carouselContainer.classList.add('hidden');
        isCarouselVisible = false; // Sincronizamos nuestro estado
    }
}