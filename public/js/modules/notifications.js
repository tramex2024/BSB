/**
 * notifications.js - Real-time Push & UI Alerts (Unified Style)
 */

const NOTIF_SOUND = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');

export function initializeNotifications(socket) {
    const bellContainer = document.getElementById('bell-container');
    const dot = document.getElementById('notif-dot');

    if (!bellContainer) return;

    // Asegurar que el contenedor sea el punto de referencia para el dropdown
    bellContainer.classList.add('relative');

    // Escuchar historial del servidor al conectar
    socket.on('notification-history', (serverHistory) => {
        syncWithServer(serverHistory, dot);
    });

    // Escuchar mensajes en tiempo real (Admin Broadcast)
    socket.on('admin-broadcast', (data) => {
        if (dot) dot.classList.remove('hidden');
        NOTIF_SOUND.play().catch(() => {});
        showToast(data.message);
        saveNotification(data);
    });

    // Abrir/Cerrar Dropdown
    bellContainer.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const existing = document.getElementById('notif-dropdown');
        if (existing) {
            existing.remove();
        } else {
            if (dot) dot.classList.add('hidden');
            renderNotificationsDropdown(bellContainer);
        }
    });

    // Cerrar al hacer clic fuera
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('notif-dropdown');
        if (dropdown && !dropdown.contains(e.target) && !bellContainer.contains(e.target)) {
            dropdown.remove();
        }
    });
}

function syncWithServer(serverData, dot) {
    let localHistory = JSON.parse(localStorage.getItem('bsb_notifications') || '[]');
    
    const formattedServer = serverData.map(item => ({
        id: item._id,
        message: item.message,
        date: new Date(item.date).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
    }));

    // Evitar duplicados por contenido de mensaje
    const newItems = formattedServer.filter(s => 
        !localHistory.some(l => l.message === s.message)
    );

    if (newItems.length > 0) {
        let finalHistory = [...newItems, ...localHistory].slice(0, 15);
        localStorage.setItem('bsb_notifications', JSON.stringify(finalHistory));
        if (dot) dot.classList.remove('hidden');
    }
}

function showToast(msg) {
    const toast = document.createElement('div');
    // Estilo Toast unificado con la App
    toast.className = `fixed bottom-5 right-5 bg-blue-600/90 backdrop-blur-md text-white px-6 py-4 rounded-xl shadow-2xl border border-blue-400/30 z-[9999] flex items-center space-x-3 cursor-pointer transition-all duration-500`;
    toast.style.animation = "slideInUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    
    toast.innerHTML = `
        <div class="bg-white/20 p-2 rounded-lg">
            <i class="fas fa-bell text-lg"></i>
        </div>
        <div class="flex flex-col">
            <span class="text-[10px] font-black uppercase opacity-70">System Alert</span>
            <div class="text-xs font-bold">${msg}</div>
        </div>
    `;
    
    document.body.appendChild(toast);
    toast.onclick = () => toast.remove();
    
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
    localStorage.setItem('bsb_notifications', JSON.stringify(history.slice(0, 15)));
}

function renderNotificationsDropdown(container) {
    const history = JSON.parse(localStorage.getItem('bsb_notifications') || '[]');
    
    const dropdown = document.createElement('div');
    dropdown.id = 'notif-dropdown';
    
    // CLASES CLAVE: fixed (para ignorar contenedores), right-4 (para no tocar el borde), backdrop-blur
    dropdown.className = `absolute right-0 top-full mt-3 w-80 bg-[#1a1c24]/95 backdrop-blur-xl border border-gray-700/50 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[9999] overflow-hidden animate-fadeIn`;
    
    let itemsHTML = history.length === 0 
        ? `<div class="p-10 text-center">
            <i class="fas fa-envelope-open text-gray-700 text-3xl mb-3"></i>
            <p class="text-gray-500 text-[10px] uppercase font-bold tracking-widest">No notifications</p>
           </div>`
        : history.map(item => `
            <div class="p-4 border-b border-gray-800/40 hover:bg-blue-500/5 transition-colors cursor-default group">
                <p class="text-gray-300 text-[11px] leading-relaxed mb-1.5 group-hover:text-white transition-colors">${item.message}</p>
                <div class="flex items-center gap-2">
                    <span class="w-1 h-1 bg-blue-500 rounded-full"></span>
                    <span class="text-[8px] text-blue-400 font-black uppercase tracking-tighter">${item.date}</span>
                </div>
            </div>
        `).join('');

    dropdown.innerHTML = `
        <div class="px-4 py-3 bg-[#242731]/80 border-b border-gray-700/50 flex justify-between items-center">
            <div class="flex items-center gap-2">
                <span class="text-[10px] font-black text-white uppercase tracking-widest">Activity Feed</span>
                <span class="bg-blue-500 text-[8px] px-1.5 rounded text-white font-bold">${history.length}</span>
            </div>
            <button id="clear-notifs" class="text-[9px] text-gray-500 hover:text-rose-400 uppercase font-bold transition-colors">Clear All</button>
        </div>
        <div class="max-h-80 overflow-y-auto custom-scrollbar">${itemsHTML}</div>
        <div class="p-2 bg-black/20 text-center">
            <span class="text-[7px] text-gray-600 uppercase font-black">BSB Neural Link v2.6</span>
        </div>
    `;

    container.appendChild(dropdown);

    dropdown.querySelector('#clear-notifs').addEventListener('click', (e) => {
        e.stopPropagation();
        localStorage.setItem('bsb_notifications', '[]');
        dropdown.remove();
    });
}