// public/js/modules/navigation.js
const mainContentDiv = document.getElementById('main-content');
let activeTab = null;

async function loadContent(tabName, onContentLoad) {
    if (!mainContentDiv) {
        console.error("Error: Elemento 'main-content' no encontrado.");
        return;
    }

    try {
        const response = await fetch(`/${tabName}.html`);
        if (!response.ok) {
            throw new Error(`Failed to load ${tabName}.html`);
        }
        const content = await response.text();
        mainContentDiv.innerHTML = content;
        
        if (onContentLoad && typeof onContentLoad === 'function') {
            onContentLoad(tabName);
        }

    } catch (error) {
        console.error('Error loading content:', error);
        mainContentDiv.innerHTML = `<div class="p-4 text-center text-red-500">Error: No se pudo cargar el contenido de la página.</div>`;
    }
}

function setActiveTab(tabElement) {
    if (activeTab) {
        activeTab.classList.remove('active-tab');
    }
    tabElement.classList.add('active-tab');
    activeTab = tabElement;
}

export function setupNavTabs(onContentLoad) {
    const navTabs = document.querySelectorAll('#nav-tabs .nav-tab');
    
    if (!navTabs || navTabs.length === 0) {
        console.error("No se encontraron tabs de navegación. Asegúrate de que el ID 'nav-tabs' y la clase 'nav-tab' existan.");
        return;
    }

    navTabs.forEach(tab => {
        tab.addEventListener('click', (event) => {
            event.preventDefault();
            const tabName = tab.dataset.tab;
            setActiveTab(tab);
            loadContent(tabName, onContentLoad);
        });
    });

    // Cargar la vista por defecto al inicio
    const defaultTab = document.querySelector('#nav-tabs .nav-tab[data-tab="dashboard"]');
    if (defaultTab) {
        setActiveTab(defaultTab);
        loadContent('dashboard', onContentLoad);
    }
}