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
    const email = localStorage.getItem('userEmail') || 'User@BSB.com';
    const uid = localStorage.getItem('userId') || 'Not Set';
    const role = localStorage.getItem('userRole') || 'CURRENT'; // CURRENT o ADVANCED
    const daysLeft = localStorage.getItem('subscriptionDays') || '0';
    
    document.getElementById('prof-email').textContent = email;
    document.getElementById('prof-id').textContent = uid;
    
    // Actualizar etiqueta de rol visualmente
    const roleBadge = document.getElementById('prof-role-badge');
    if (role === 'ADVANCED') {
        roleBadge.textContent = 'ADVANCED';
        roleBadge.className = 'text-[10px] bg-amber-500 px-2 py-0.5 rounded text-black font-bold uppercase';
        document.getElementById('prof-days-container').style.display = 'block';
        document.getElementById('prof-days-count').textContent = `${daysLeft} Days left`;
    } else {
        roleBadge.textContent = 'CURRENT (FREE)';
        roleBadge.className = 'text-[10px] bg-gray-600 px-2 py-0.5 rounded text-white font-bold uppercase';
        document.getElementById('prof-days-container').style.display = 'none';
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

    // Eventos
    document.getElementById('btn-upgrade-info')?.addEventListener('click', () => {
        // Aquí conectamos con el soporte para el pago semi-automático
        const modal = document.getElementById('profile-modal');
        modal.style.display = 'none';
        
        // Simula click en soporte o abre WhatsApp directamente
        const phone = "529625198814";
        const msg = encodeURIComponent("I want to upgrade my BSB account to ADVANCED. My UID is: " + localStorage.getItem('userId'));
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
    });

    document.getElementById('btn-profile-logout')?.addEventListener('click', () => {
        document.getElementById('profile-modal').style.display = 'none';
        document.getElementById('login-logout-icon')?.click();
    });
}