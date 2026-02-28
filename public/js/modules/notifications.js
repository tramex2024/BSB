/**
 * notifications.js - Real-time Push & UI Alerts (with Server Sync)
 */

const NOTIF_SOUND = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');

export function initializeNotifications(socket) {
    const bellContainer = document.getElementById('bell-container');
    const dot = document.getElementById('notif-dot');

    if (!bellContainer) return;

    // --- NUEVO: ESCUCHAR HISTORIAL DEL SERVIDOR ---
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
        if (dot) dot.classList.add('hidden');
        renderNotificationsDropdown(bellContainer);
    });

    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('notif-dropdown');
        if (dropdown && !dropdown.contains(e.target)) dropdown.remove();
    });
}

// Fusión inteligente: Une lo que tiene el servidor con lo que hay en LocalStorage
function syncWithServer(serverData, dot) {
    let localHistory = JSON.parse(localStorage.getItem('bsb_notifications') || '[]');
    
    // Convertimos serverData al formato que usa tu UI
    const formattedServer = serverData.map(item => ({
        id: item._id, // Usamos el ID de Mongo para evitar duplicados
        message: item.message,
        date: new Date(item.date).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
    }));

    // Filtrar: Solo agregar si el mensaje no existe ya en el local (basado en mensaje y fecha)
    const newItems = formattedServer.filter(s => 
        !localHistory.some(l => l.message === s.message)
    );

    if (newItems.length > 0) {
        let finalHistory = [...newItems, ...localHistory].slice(0, 15);
        localStorage.setItem('bsb_notifications', JSON.stringify(finalHistory));
        // Si hay cosas nuevas que no ha visto, prender el punto rojo
        if (dot) dot.classList.remove('hidden');
    }
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-5 right-5 bg-blue-600 text-white px-6 py-4 rounded-2xl shadow-2xl border border-blue-400 z-[9999] flex items-center space-x-3 cursor-pointer transition-all duration-500`;
    toast.style.animation = "bounceIn 0.5s ease-out";
    toast.innerHTML = `<i class="fas fa-bell text-xl"></i><div class="text-sm font-bold">${msg}</div>`;
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
    const existing = document.getElementById('notif-dropdown');
    if (existing) return existing.remove();

    const dropdown = document.createElement('div');
    dropdown.id = 'notif-dropdown';
    dropdown.className = `absolute right-0 mt-4 w-72 bg-[#1a1c24] border border-gray-700 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] z-[1000] overflow-hidden`;
    
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
        <div class="max-h-60 overflow-y-auto custom-scrollbar">${itemsHTML}</div>
    `;

    container.appendChild(dropdown);
    dropdown.querySelector('#clear-notifs').addEventListener('click', (e) => {
        e.stopPropagation();
        localStorage.setItem('bsb_notifications', '[]');
        dropdown.remove();
    });
}