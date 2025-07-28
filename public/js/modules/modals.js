// public/js/modules/modals.js
import { authModal, apiModal, loginLogoutIcon, authMessage, emailInput, tokenInput, authButton, apiStatusMessage, connectionIndicator, connectionText, secretKeyInput } from '../main.js';

/**
 * Muestra u oculta el modal de autenticación (login/registro).
 * @param {boolean} show - `true` para mostrar el modal, `false` para ocultarlo.
 */
export function toggleAuthModal(show) {
    if (authModal) {
        if (show) {
            authModal.style.display = 'flex';
            authMessage.textContent = '';
            emailInput.value = '';
            tokenInput.value = '';
            tokenInput.style.display = 'none';
            emailInput.disabled = false;
            authButton.textContent = 'Continue';
        } else {
            authModal.style.display = 'none';
        }
    }
}

/**
 * Muestra u oculta el modal de configuración de API.
 * @param {boolean} show - `true` para mostrar el modal, `false` para ocultarlo.
 */
export function toggleApiModal(show) {
    if (apiModal) {
        if (show) {
            apiModal.style.display = 'flex';
            apiStatusMessage.textContent = '';
            connectionIndicator.classList.remove('bg-green-500', 'bg-red-500', 'bg-yellow-500');
            connectionIndicator.classList.add('bg-gray-500');
            connectionText.textContent = 'Not Connected';
            secretKeyInput.value = '';
        } else {
            apiModal.style.display = 'none';
        }
    }
}

/**
 * Actualiza la apariencia del icono de login/logout y su título
 * basado en el estado `isLoggedIn`.
 */
export function updateLoginIcon() {
    // Necesitamos importar isLoggedIn desde auth.js o pasarlo como argumento
    // Por simplicidad, lo importaremos aquí.
    const isLoggedInStatus = JSON.parse(localStorage.getItem('authToken') ? 'true' : 'false'); // O mejor, importar directamente `isLoggedIn`
    if (loginLogoutIcon) {
        if (isLoggedInStatus) { // Usamos el estado real del login
            loginLogoutIcon.classList.remove('fa-sign-in-alt');
            loginLogoutIcon.classList.add('fa-sign-out-alt');
            loginLogoutIcon.title = 'Logout';
        } else {
            loginLogoutIcon.classList.remove('fa-sign-out-alt');
            loginLogoutIcon.classList.add('fa-sign-in-alt');
            loginLogoutIcon.title = 'Login';
        }
    }
}