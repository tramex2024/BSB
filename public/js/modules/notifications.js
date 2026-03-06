/**
 * notifications.js - Real-time Push & UI Alerts
 * Ubicación: Debajo de la Log-Bar
 */

const NOTIF_SOUND = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');

export function initializeNotifications(socket) {
    const bellContainer = document.getElementById('bell-container');
    const dot = document.getElementById('notif-dot');

    if (!bellContainer) return;

    // Escuchar historial del servidor
    socket.on('notification-history', (serverHistory) => {
        syncWithServer(serverHistory, dot);
    });

    // Escuchar mensajes en tiempo real
    socket.on('admin-broadcast', (data) => {
        if (dot) dot.classList.remove('hidden');
        NOTIF_SOUND.play().catch(() => {});
        showToast(data.message);
        saveNotification(data);
    });

    bellContainer.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const existing = document.getElementById('notif-dropdown');
        if (existing) {
            existing.remove();
        } else {
            if (dot) dot.classList.add('hidden');
            renderNotificationsDropdown(); // Ya no necesita el container como hijo
        }
    });

    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('notif-dropdown');
        const bell = document.getElementById('bell-container');
        if (dropdown && !dropdown.contains(e.target) && !bell.contains(e.target)) {
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

    const newItems = formattedServer.filter(s => !localHistory.some(l => l.message === s.message));

    if (newItems.length > 0) {
        let finalHistory = [...newItems, ...localHistory].slice(0, 15);
        localStorage.setItem('bsb_notifications', JSON.stringify(finalHistory));
        if (dot) dot.classList.remove('hidden');
    }
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-20 right-5 bg-blue-600/90 backdrop-blur-md text-white px-6 py-4 rounded-xl shadow-2xl border border-blue-400/30 z-[10000] flex items-center space-x-3 cursor-pointer transition-all duration-500`;
    toast.innerHTML = `<i class="fas fa-bell text-lg"></i><div class="text-xs font-bold">${msg}</div>`;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 5000);
}

function saveNotification(data) {
    let history = JSON.parse(localStorage.getItem('bsb_notifications') || '[]');
    history.unshift({ 
        message: data.message, 
        date: new Date().toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) 
    });
    localStorage.setItem('bsb_notifications', JSON.stringify(history.slice(0, 15)));
}

function renderNotificationsDropdown() {
    const history = JSON.parse(localStorage.getItem('bsb_notifications') || '[]');
    const dropdown = document.createElement('div');
    dropdown.id = 'notif-dropdown';
    
    // CAMBIO CLAVE: fixed, top-[65px] (ajusta según la altura de tu logbar + header) y right-4
    // Esto lo saca del flujo de la campana y lo pone debajo de la barra principal.
    dropdown.className = `fixed top-[70px] right-4 w-80 bg-[#1a1c24]/95 backdrop-blur-xl border border-gray-700/50 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[9999] overflow-hidden animate-fadeIn`;
    
    let itemsHTML = history.length === 0 
        ? `<div class="p-10 text-center text-gray-500 text-[10px] uppercase font-bold tracking-widest">No messages</div>`
        : history.map(item => `
            <div class="p-4 border-b border-gray-800/40 hover:bg-blue-500/5 transition-colors">
                <p class="text-gray-300 text-[11px] leading-relaxed mb-1">${item.message}</p>
                <span class="text-[8px] text-blue-400 font-black uppercase tracking-tighter">${item.date}</span>
            </div>
        `).join('');

    dropdown.innerHTML = `
        <div class="px-4 py-3 bg-[#242731]/80 border-b border-gray-700/50 flex justify-between items-center">
            <h4 class="text-[10px] font-black text-white uppercase tracking-widest">Activity Feed</h4>
            <button id="clear-notifs" class="text-[9px] text-gray-500 hover:text-rose-400 uppercase font-bold">Clear All</button>
        </div>
        <div class="max-h-80 overflow-y-auto custom-scrollbar">${itemsHTML}</div>
    `;

    document.body.appendChild(dropdown); // Lo inyectamos al body directamente

    dropdown.querySelector('#clear-notifs').addEventListener('click', (e) => {
        e.stopPropagation();
        localStorage.setItem('bsb_notifications', '[]');
        dropdown.remove();
    });
}