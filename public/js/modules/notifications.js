/**
 * notifications.js - Real-time Push & UI Alerts (with Audio & Pro UI)
 */

// Sonido estándar de notificación
const NOTIF_SOUND = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');

export function initializeNotifications(socket) {
    const bellContainer = document.getElementById('bell-container');
    const dot = document.getElementById('notif-dot');

    if (!bellContainer) {
        console.error("Notification bell container not found in DOM");
        return;
    }

    // Escuchar mensajes del servidor
    socket.on('admin-broadcast', (data) => {
        // Mostrar el punto rojo (dot)
        if (dot) dot.classList.remove('hidden');
        
        // Reproducir sonido
        NOTIF_SOUND.play().catch(e => console.log("Audio play blocked until user interacts."));
        
        // Mostrar el aviso flotante (Toast)
        showToast(data.message);
        
        // Guardar en el historial local
        saveNotification(data);
    });

    // Abrir/Cerrar Dropdown al hacer click en la campana
    bellContainer.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Evita que el evento 'click' del document cierre el menú inmediatamente
        
        // Ocultar el punto de notificación al revisar
        if (dot) dot.classList.add('hidden');
        
        renderNotificationsDropdown(bellContainer);
    });

    // Cerrar dropdown si se hace click en cualquier otra parte de la pantalla
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('notif-dropdown');
        if (dropdown && !dropdown.contains(e.target)) {
            dropdown.remove();
        }
    });
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-5 right-5 bg-blue-600 text-white px-6 py-4 rounded-2xl shadow-2xl border border-blue-400 z-[9999] flex items-center space-x-3 cursor-pointer transition-all duration-500`;
    toast.style.animation = "bounceIn 0.5s ease-out";
    
    toast.innerHTML = `
        <i class="fas fa-bell text-xl"></i>
        <div class="text-sm font-bold">${msg}</div>
    `;
    
    document.body.appendChild(toast);
    
    // Quitar al hacer click
    toast.onclick = () => toast.remove();

    // Auto-eliminar después de 6 segundos
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 500);
        }
    }, 6000);
}

function saveNotification(data) {
    let history = JSON.parse(localStorage.getItem('bsb_notifications') || '[]');
    history.unshift({ 
        message: data.message, 
        date: new Date().toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) 
    });
    
    // Guardar solo las últimas 10 notificaciones
    localStorage.setItem('bsb_notifications', JSON.stringify(history.slice(0, 10)));
}

function renderNotificationsDropdown(container) {
    const history = JSON.parse(localStorage.getItem('bsb_notifications') || '[]');
    const existing = document.getElementById('notif-dropdown');
    
    // Si ya está abierto, lo cerramos
    if (existing) {
        return existing.remove();
    }

    const dropdown = document.createElement('div');
    dropdown.id = 'notif-dropdown';
    
    // Clases de diseño BSB (Dark mode, bordes redondeados, sombra fuerte)
    dropdown.className = `absolute right-0 mt-4 w-72 bg-[#1a1c24] border border-gray-700 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] z-[1000] overflow-hidden`;
    dropdown.style.animation = "fadeIn 0.2s ease-out";
    
    let itemsHTML = history.length === 0 
        ? `<div class="p-8 text-center text-gray-500 text-xs italic">No messages yet</div>`
        : history.map(item => `
            <div class="p-4 border-b border-gray-800/50 hover:bg-white/5 transition-colors cursor-default">
                <p class="text-gray-200 text-[11px] leading-relaxed mb-1">${item.message}</p>
                <span class="text-[8px] text-blue-400 font-bold tracking-tighter uppercase">${item.date}</span>
            </div>
        `).join('');

    dropdown.innerHTML = `
        <div class="px-4 py-3 bg-[#242731] border-b border-gray-700 flex justify-between items-center">
            <h4 class="text-[10px] font-black text-white uppercase tracking-widest">Notifications</h4>
            <button id="clear-notifs" class="text-[9px] text-gray-500 hover:text-white uppercase font-bold transition-colors">Clear All</button>
        </div>
        <div class="max-h-60 overflow-y-auto custom-scrollbar">
            ${itemsHTML}
        </div>
    `;

    container.appendChild(dropdown);

    // Evento para el botón "Clear All"
    dropdown.querySelector('#clear-notifs').addEventListener('click', (e) => {
        e.stopPropagation();
        localStorage.setItem('bsb_notifications', '[]');
        dropdown.remove();
    });
}