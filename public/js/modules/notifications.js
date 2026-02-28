/**
 * notifications.js - Real-time Push & UI Alerts (with Audio & Pro UI)
 */

// Sonido estándar de notificación (Suave y moderno)
const NOTIF_SOUND = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');

export function initializeNotifications(socket) {
    const bellIcon = document.querySelector('.fa-bell').parentElement;
    const dot = bellIcon.querySelector('span');

    socket.on('admin-broadcast', (data) => {
        if (dot) dot.classList.remove('hidden');
        
        // Reproducir sonido (con manejo de error por si el navegador bloquea el auto-play)
        NOTIF_SOUND.play().catch(e => console.log("Audio play blocked until user interacts."));
        
        showToast(data.message);
        saveNotification(data);
    });

    bellIcon.addEventListener('click', (e) => {
        e.stopPropagation(); // Evita cerrar el dropdown al hacer click en el icono
        if (dot) dot.classList.add('hidden');
        renderNotificationsDropdown(bellIcon);
    });

    // Cerrar dropdown si se hace click fuera
    document.addEventListener('click', () => {
        const existing = document.getElementById('notif-dropdown');
        if (existing) existing.remove();
    });
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-5 right-5 bg-blue-600 text-white px-6 py-4 rounded-2xl shadow-2xl border border-blue-400 z-[9999] animate-bounce-in flex items-center space-x-3 cursor-pointer`;
    toast.innerHTML = `
        <i class="fas fa-bell text-xl"></i>
        <div class="text-sm font-bold">${msg}</div>
    `;
    document.body.appendChild(toast);
    
    toast.onclick = () => toast.remove();

    setTimeout(() => {
        if(toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            toast.style.transition = 'all 0.5s ease';
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
    localStorage.setItem('bsb_notifications', JSON.stringify(history.slice(0, 10)));
}

function renderNotificationsDropdown(container) {
    const history = JSON.parse(localStorage.getItem('bsb_notifications') || '[]');
    const existing = document.getElementById('notif-dropdown');
    if (existing) return existing.remove();

    const dropdown = document.createElement('div');
    dropdown.id = 'notif-dropdown';
    // Estilo adaptado al header de BSB
    dropdown.className = `absolute right-0 mt-4 w-72 bg-[#1a1c24] border border-gray-700 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-[1000] overflow-hidden animate-fade-in`;
    
    let itemsHTML = history.length === 0 
        ? `<div class="p-6 text-center text-gray-500 text-xs italic">No messages yet</div>`
        : history.map(item => `
            <div class="p-4 border-b border-gray-800/50 hover:bg-white/5 transition-colors cursor-default">
                <p class="text-gray-200 text-[11px] leading-relaxed mb-1">${item.message}</p>
                <span class="text-[8px] text-blue-400 font-bold tracking-tighter uppercase">${item.date}</span>
            </div>
        `).join('');

    dropdown.innerHTML = `
        <div class="px-4 py-3 bg-[#242731] border-b border-gray-700 flex justify-between items-center">
            <h4 class="text-[10px] font-black text-white uppercase tracking-widest">Notifications</h4>
            <button class="text-[9px] text-gray-500 hover:text-white uppercase font-bold" onclick="localStorage.setItem('bsb_notifications', '[]'); this.closest('#notif-dropdown').remove();">Clear All</button>
        </div>
        <div class="max-h-60 overflow-y-auto custom-scrollbar">
            ${itemsHTML}
        </div>
    `;

    container.appendChild(dropdown);
}