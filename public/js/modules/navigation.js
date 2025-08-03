// public/js/modules/navigation.js
import { displayLogMessage } from './auth.js';

export function setupNavTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    navTabs.forEach(tab => {
        tab.addEventListener('click', function(event) {
            event.preventDefault(); // Evita el comportamiento predeterminado del enlace (cambiar la URL)
            const targetId = this.getAttribute('data-tab'); // Obtiene el valor del atributo data-tab

            // Elimina la clase 'active' de todos los tabs de navegación
            navTabs.forEach(t => t.classList.remove('active'));
            // Agrega la clase 'active' al tab que fue clicado
            this.classList.add('active');

            // Oculta todas las secciones de contenido y muestra solo la deseada
            tabContents.forEach(content => {
                if (content.id === targetId) {
                    content.classList.add('active'); // Muestra el contenido
                } else {
                    content.classList.remove('active'); // Oculta los demás
                }
            });
            displayLogMessage(`Switched to ${targetId} tab.`, 'info');
        });
    });

    // Opcional: Establecer el tab activo inicialmente al cargar la página
    const initialActiveTab = document.querySelector('.nav-tab.active');
    if (initialActiveTab) {
        const initialTargetId = initialActiveTab.getAttribute('data-tab');
        tabContents.forEach(content => {
            if (content.id === initialTargetId) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }
}