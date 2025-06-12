// public/js/main.js
document.addEventListener('DOMContentLoaded', () => {
    // Referencias a los elementos de navegación y contenido
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    // Función para mostrar la pestaña activa
    function showTab(tabId) {
        // Remover 'active' de todas las pestañas de navegación
        navTabs.forEach(tab => tab.classList.remove('active'));

        // Ocultar todos los contenidos de las pestañas
        tabContents.forEach(content => content.classList.remove('active'));

        // Añadir 'active' a la pestaña de navegación correspondiente
        const activeNavTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
        if (activeNavTab) {
            activeNavTab.classList.add('active');
        }

        // Mostrar el contenido de la pestaña correspondiente
        const activeContent = document.getElementById(`${tabId}-section`);
        if (activeContent) {
            activeContent.classList.add('active');
        }
    }

    // Event listener para los clics en las pestañas de navegación
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault(); // Prevenir el comportamiento por defecto del enlace
            const tabId = tab.dataset.tab; // Obtener el ID de la pestaña del atributo data-tab
            showTab(tabId); // Mostrar la pestaña
        });
    });

    // Inicializar la aplicación: Mostrar la pestaña activa por defecto al cargar
    // Buscar si alguna pestaña ya tiene la clase 'active' en el HTML
    let initialTab = 'dashboard'; // Por defecto, muestra el dashboard
    const activeTabInMarkup = document.querySelector('.nav-tab.active');
    if (activeTabInMarkup) {
        initialTab = activeTabInMarkup.dataset.tab;
    }
    showTab(initialTab); // Mostrar la pestaña inicial
});
