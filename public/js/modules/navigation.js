// public/js/modules/navigation.js
import { displayLogMessage } from './auth.js';

export function setupNavTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    navTabs.forEach(tab => {
        tab.addEventListener('click', function(event) {
            event.preventDefault(); // Evita el comportamiento predeterminado del enlace (cambiar la URL)
            const targetId = this.dataset.tab + '-section'; // Obtiene el ID de la sección a mostrar

            // Elimina la clase 'active' de todos los tabs de navegación
            navTabs.forEach(t => t.classList.remove('active'));
            // Agrega la clase 'active' al tab que fue clicado
            this.classList.add('active');

            // Oculta todas las secciones de contenido y muestra solo la deseada
            tabContents.forEach(content => {
                if (content.id === targetId) {
                    content.classList.add('active'); // O tu clase para mostrar
                } else {
                    content.classList.remove('active'); // O tu clase para ocultar
                }
            });
            displayLogMessage(`Switched to ${this.dataset.tab} tab.`, 'info');
        });
    });

    // Opcional: Establecer el tab activo inicialmente al cargar la página
    // Esto asegura que la pestaña correcta se muestre al cargar.
    const initialActiveTab = document.querySelector('.nav-tab.active');
    if (initialActiveTab) {
        const initialTargetId = initialActiveTab.dataset.tab + '-section';
        tabContents.forEach(content => {
            if (content.id === initialTargetId) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }
}