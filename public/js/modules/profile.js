/**
 * profile.js - User Profile & Identity Management (Role-Based 2026)
 */
export function initializeProfile() {
    const profileIcon = document.getElementById('user-profile-icon');
    
    if (!document.getElementById('profile-modal')) {
        createProfileModal();
    }

    const modal = document.getElementById('profile-modal');
    const closeBtn = document.getElementById('close-profile');

    if (profileIcon && modal) {
        profileIcon.addEventListener('click', () => {
            updateProfileData(); 
            modal.style.display = 'flex';
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.style.display = 'none');
    }
}

function updateProfileData() {
    const userStr = localStorage.getItem('user');
    let userData = {};
    
    try {
        userData = userStr ? JSON.parse(userStr) : {};
    } catch (e) {
        console.error("Error parsing user data");
    }

    const email = userData.email || localStorage.getItem('userEmail') || 'User@BSB.com';
    const uid = userData.id || userData._id || localStorage.getItem('userId') || 'Not Set';
    const role = (userData.role || localStorage.getItem('userRole') || 'current').toLowerCase();

    // --- CÁLCULO DE DÍAS CORREGIDO (BSB 2026) ---
    let daysLeft = 0;
    
    // 1. Buscamos la fecha en el objeto parseado o en el storage directamente como respaldo
    const expiryDateStr = userData.roleExpiresAt || localStorage.getItem('roleExpiresAt');

    if (expiryDateStr) {
        const expiryDate = new Date(expiryDateStr);
        const today = new Date();
        
        // 2. Validamos que la fecha sea válida (evita NaN)
        if (!isNaN(expiryDate.getTime())) {
            // Calculamos la diferencia en milisegundos
            const diffInMs = expiryDate - today;
            
            // 3. Convertimos a días (86,400,000 ms = 1 día)
            // Usamos Math.ceil para que si queda medio día, cuente como 1
            daysLeft = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));
            
            // 4. Escudo de seguridad: si la suscripción expiró, no mostrar negativos
            if (daysLeft < 0) daysLeft = 0;
        }
    }

    // 5. Verificación de Rol: Si el usuario es 'current' (Free), forzamos a 0 por coherencia
    if (role === 'current') {
        daysLeft = 0;
    }    

    // --- ACTUALIZACIÓN DE UI ---
    document.getElementById('prof-email').textContent = email;
    document.getElementById('prof-id').textContent = uid;
    
    const roleBadge = document.getElementById('prof-role-badge');
    const daysCount = document.getElementById('prof-days-count');
    const daysContainer = document.getElementById('prof-days-container');
    const upgradeSection = document.getElementById('upgrade-section');

    if (role === 'admin') {
        roleBadge.textContent = 'ADMINISTRATOR';
        roleBadge.className = 'text-[10px] bg-amber-500 px-2 py-0.5 rounded text-black font-bold uppercase shadow-[0_0_10px_rgba(251,191,36,0.5)]';
        if(daysContainer) daysContainer.style.display = 'none';
        if(upgradeSection) upgradeSection.style.display = 'none';
    } 
    else if (role === 'advanced') {
        roleBadge.textContent = 'ADVANCED';
        roleBadge.className = 'text-[10px] bg-emerald-500 px-2 py-0.5 rounded text-black font-bold uppercase';
        
        if(daysContainer) daysContainer.style.display = 'block';
        if(daysCount) daysCount.textContent = `${daysLeft} Days left`;
        if(upgradeSection) upgradeSection.style.display = 'none';
    } 
    else {
        roleBadge.textContent = 'CURRENT (FREE)';
        roleBadge.className = 'text-[10px] bg-gray-600 px-2 py-0.5 rounded text-white font-bold uppercase';
        if(daysContainer) daysContainer.style.display = 'none';
        if(upgradeSection) upgradeSection.style.display = 'block';
    }
}
function createProfileModal() {
    const modalHtml = `
    <div id="profile-modal" class="modal">
        <div class="modal-content border border-emerald-900/30 max-w-sm">
            <div class="flex justify-between items-start mb-6">
                <div class="flex items-center space-x-4">
                    <div class="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center border-2 border-emerald-500">
                        <i class="fas fa-user text-2xl text-emerald-500"></i>
                    </div>
                    <div>
                        <h2 class="text-lg font-bold truncate w-40" id="prof-email">Loading...</h2>
                        <div class="flex items-center space-x-2">
                            <span id="prof-role-badge">CURRENT</span>
                            <div id="prof-days-container" style="display:none">
                                <span id="prof-days-count" class="text-[9px] text-amber-400 font-mono"></span>
                            </div>
                        </div>
                    </div>
                </div>
                <i class="fas fa-times cursor-pointer hover:text-red-400" id="close-profile"></i>
            </div>

            <div class="space-y-3">
                <div class="bg-gray-900/80 p-3 rounded-xl border border-gray-800">
                    <p class="text-[10px] text-gray-500 uppercase font-bold">Account UID</p>
                    <p class="font-mono text-sm text-emerald-400" id="prof-id">---</p>
                </div>

                <div id="upgrade-section" class="bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/20">
                    <h3 class="text-xs font-bold text-emerald-400 mb-2 uppercase italic">🔥 Unlock Advanced Mode</h3>
                    <ul class="text-[10px] text-gray-400 space-y-1 mb-3">
                        <li><i class="fas fa-check text-emerald-500 mr-1"></i> Full access to AI Bot & Autobot</li>
                        <li><i class="fas fa-check text-emerald-500 mr-1"></i> Advanced Risk Management</li>
                        <li><i class="fas fa-check text-emerald-500 mr-1"></i> 24/7 Server Priority</li>
                    </ul>
                    <button id="btn-upgrade-info" class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition">
                        GET ADVANCED ACCESS ($15/mo)
                    </button>
                </div>

                <button id="btn-profile-logout" class="w-full mt-2 py-2 text-gray-500 hover:text-red-400 text-[10px] font-bold transition flex items-center justify-center">
                    <i class="fas fa-sign-out-alt mr-2"></i> SIGN OUT
                </button>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Evento para abrir el sistema de pagos desde el perfil
    document.getElementById('btn-upgrade-info')?.addEventListener('click', () => {
        const profileModal = document.getElementById('profile-modal');
        if (profileModal) profileModal.style.display = 'none';
        
        const paymentBtn = document.getElementById('btn-upgrade');
        if (paymentBtn) {
            paymentBtn.click();
        } else {
            const paymentModal = document.getElementById('payment-modal');
            if (paymentModal) paymentModal.style.display = 'flex';
        }
    });

    document.getElementById('btn-profile-logout')?.addEventListener('click', () => {
        document.getElementById('profile-modal').style.display = 'none';
        document.getElementById('login-logout-icon')?.click();
    });
}