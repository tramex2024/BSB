/**
 * profile.js - User Profile & Identity Management
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
            updateProfileData(); // Refrescar datos antes de abrir
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
    
    document.getElementById('prof-email').textContent = email;
    document.getElementById('prof-id').textContent = uid;
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
                        <h2 class="text-xl font-bold" id="prof-email">Loading...</h2>
                        <span class="text-[10px] bg-emerald-600 px-2 py-0.5 rounded text-white font-bold uppercase">Pro Trader</span>
                    </div>
                </div>
                <i class="fas fa-times cursor-pointer hover:text-red-400" id="close-profile"></i>
            </div>

            <div class="space-y-3">
                <div class="bg-gray-900/80 p-3 rounded-xl border border-gray-800">
                    <p class="text-[10px] text-gray-500 uppercase font-bold">Account UID</p>
                    <p class="font-mono text-sm text-emerald-400" id="prof-id">---</p>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div class="bg-gray-900/80 p-3 rounded-xl border border-gray-800 text-center">
                        <p class="text-[10px] text-gray-500 uppercase font-bold">API Status</p>
                        <p class="text-xs text-emerald-500 font-bold"><i class="fas fa-check-circle mr-1"></i> Linked</p>
                    </div>
                    <div class="bg-gray-900/80 p-3 rounded-xl border border-gray-800 text-center">
                        <p class="text-[10px] text-gray-500 uppercase font-bold">2FA</p>
                        <p class="text-xs text-blue-400 font-bold"><i class="fas fa-shield-alt mr-1"></i> Active</p>
                    </div>
                </div>

                <button id="btn-profile-logout" class="w-full mt-4 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-xl text-sm font-bold transition flex items-center justify-center">
                    <i class="fas fa-sign-out-alt mr-2"></i> CLOSE SESSION
                </button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Conectar el botón de logout del perfil con el sistema existente
    document.getElementById('btn-profile-logout')?.addEventListener('click', () => {
        document.getElementById('profile-modal').style.display = 'none';
        document.getElementById('login-logout-icon')?.click(); // Dispara el modal de logout que ya tienes
    });
}