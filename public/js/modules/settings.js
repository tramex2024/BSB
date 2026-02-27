/**
 * settings.js - General App Settings
 */
export function initializeSettings() {
    const settingsIcon = document.getElementById('settings-icon');
    
    // Creamos el modal dinámicamente si no existe para no ensuciar el HTML
    if (!document.getElementById('settings-modal')) {
        createSettingsModal();
    }

    const modal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('close-settings');

    if (settingsIcon && modal) {
        settingsIcon.addEventListener('click', () => {
            modal.style.display = 'flex';
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    // Cerrar al hacer clic fuera
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}

function createSettingsModal() {
    const modalHtml = `
    <div id="settings-modal" class="modal">
        <div class="modal-content border border-gray-700">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-bold flex items-center">
                    <i class="fas fa-cog mr-3 text-emerald-500"></i> Settings
                </h2>
                <i class="fas fa-times cursor-pointer hover:text-red-400" id="close-settings"></i>
            </div>
            
            <div class="space-y-6">
                <div class="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                    <div>
                        <p class="font-medium">Interface Theme</p>
                        <p class="text-xs text-gray-500">Customize your view</p>
                    </div>
                    <select class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm outline-none">
                        <option value="dark">Dark Mode (Default)</option>
                        <option value="light" disabled>Light Mode (Soon)</option>
                    </select>
                </div>

                <div class="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                    <div>
                        <p class="font-medium">Language</p>
                    </div>
                    <select class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm outline-none">
                        <option value="en">English</option>
                        <option value="es">Español</option>
                    </select>
                </div>

                <div class="pt-4 border-t border-gray-800 text-[10px] text-gray-500 text-center">
                    BSB Platform v2.0.26 - Build 4402
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}