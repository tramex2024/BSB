// public/js/modules/auth.js

// Importa las constantes globales que necesitas de main.js
// Asegúrate de que `logMessageElement`, `loginLogoutIcon`, etc., se exporten correctamente desde main.js
// (aunque para el error actual, esto no es lo relevante)
import { BACKEND_URL, logMessageElement, loginLogoutIcon, connectionIndicator, connectionText } from '../main.js';

// Variable global para el estado de login
export let isLoggedIn = false;

/**
 * Muestra un mensaje en la barra de logs.
 * @param {string} message El mensaje a mostrar.
 * @param {string} type El tipo de mensaje (info, success, warning, error).
 */
export function displayLogMessage(message, type = 'info') {
    if (logMessageElement) {
        logMessageElement.textContent = `[Log Bar] ${message}`;
        logMessageElement.className = `log-bar-message text-${type === 'error' ? 'red' : type === 'warning' ? 'yellow' : type === 'success' ? 'green' : 'gray'}-300`;
    }
    console.log(`[Log Bar] ${message}`); // También imprime en consola para depuración
}

/**
 * Fetch seguro al backend con manejo de token y errores.
 * @param {string} endpoint El endpoint de la API (e.g., '/api/user').
 * @param {Object} options Opciones para fetch (method, headers, body, etc.).
 * @returns {Promise<Object|null>} La respuesta parseada del backend o null en caso de error.
 */
export async function fetchFromBackend(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers // Permite sobrescribir o añadir otros headers
    };

    // Esto es CRUCIAL: Añadir el token al encabezado Authorization
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, {
            ...options,
            headers: headers
        });

        let responseData = null;
        try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                responseData = await response.json();
            } else {
                responseData = { message: await response.text() };
            }
        } catch (jsonError) {
            console.warn(`Could not parse response as JSON for ${endpoint}. Trying as text.`, jsonError);
            try {
                responseData = { message: await response.text() };
            } catch (textError) {
                console.error(`Error reading response body for ${endpoint}:`, textError);
                responseData = { error: "Failed to read response body." };
            }
        }

        if (!response.ok) {
            // Maneja respuestas no exitosas (4xx o 5xx)
            // Si el backend devuelve un mensaje, úsalo. Si no, usa el estado HTTP.
            const errorMessage = responseData.message || responseData.error || `HTTP error! Status: ${response.status}`;
            console.error(`Backend error for ${endpoint}:`, errorMessage, responseData);
            displayLogMessage(`Backend communication error: ${errorMessage}`, 'error');

            // Si el error es específicamente de autenticación (401 Unauthorized),
            // podríamos forzar un logout o pedir al usuario que inicie sesión de nuevo.
            if (response.status === 401) {
                displayLogMessage('Authentication required. Please log in.', 'warning');
                // Opcional: handleLogout(); // Podrías llamar a esto para limpiar la sesión.
            }

            return null; // Retorna null en caso de error
        }

        displayLogMessage(`Backend connection: OK.`, 'success');
        return responseData; // Retorna los datos parseados
    } catch (error) {
        console.error(`Error fetching from ${endpoint}:`, error);
        displayLogMessage(`Network error communicating with backend: ${error.message}`, 'error');
        return null;
    }
}

/**
 * Verifica el estado de inicio de sesión y actualiza la UI.
 */
export function checkLoginStatus() {
    const token = localStorage.getItem('authToken');
    if (token) {
        isLoggedIn = true;
    } else {
        isLoggedIn = false;
    }
    updateLoginIcon(); // Llama a la función para actualizar el icono
    displayLogMessage(`User login status: ${isLoggedIn ? 'Logged In' : 'Logged Out'}`, 'info');
}

/**
 * Actualiza el icono de login/logout en la UI.
 */
export function updateLoginIcon() {
    if (loginLogoutIcon) {
        if (isLoggedIn) {
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

/**
 * Maneja el cierre de sesión del usuario.
 */
export function handleLogout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail'); // También remueve el email si lo guardas
    isLoggedIn = false; // Actualiza el estado de login
    updateLoginIcon(); // Actualiza el icono
    displayLogMessage('Logged out successfully.', 'info');

    // Aquí podrías añadir lógica para limpiar la UI o redirigir
    // Por ejemplo, resetear el balance o los datos del bot a valores por defecto
    if (document.getElementById('balance')) document.getElementById('balance').textContent = 'Login to see';
    // Otras limpiezas de UI si es necesario
    if (connectionIndicator) connectionIndicator.classList.remove('bg-green-500', 'bg-yellow-500', 'bg-red-500');
    if (connectionIndicator) connectionIndicator.classList.add('bg-gray-500');
    if (connectionText) connectionText.textContent = 'Disconnected';
}