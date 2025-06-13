// public/js/main.js
document.addEventListener('DOMContentLoaded', async () => {
    // --- Referencias a elementos de la UI ---
    const loginSection = document.getElementById('auth-modal'); // El modal de autenticación
    const authForm = document.getElementById('auth-form');
    const emailInput = document.getElementById('email');
    const tokenInput = document.getElementById('token');
    const authButton = document.getElementById('auth-button');
    const authMessage = document.getElementById('auth-message');
    const loginLogoutIcon = document.getElementById('login-logout-icon');

    const appSection = document.getElementById('app-section'); // Contenedor principal de la app
    const logoutBtn = document.getElementById('logout-btn');

    // Elementos específicos del Autobot
    const connectApiForm = document.getElementById('connect-api-form'); // Formulario de API en la sección Autobot
    const bitmartApiKeyInput = document.getElementById('bitmart-api-key');
    const bitmartSecretKeyInput = document.getElementById('bitmart-secret-key');
    const bitmartApiMemoInput = document.getElementById('bitmart-api-memo');
    
    // Indicadores de estado de API en la sección Autobot
    const apiStatusMessageElement = document.getElementById('api-status-message'); // Renombrado para evitar conflicto
    const connectionIndicator = document.getElementById('connection-indicator');
    const connectionText = document.getElementById('connection-text');

    // Elementos de visualización del estado del bot en la sección Autobot
    const botStatusText = document.getElementById('bot-status-text');
    const cycleText = document.getElementById('cycle-text');
    const profitText = document.getElementById('profit-text');
    const cycleProfitText = document.getElementById('cycle-profit-text');
    const currentPriceText = document.getElementById('current-price-text');
    const balanceUSDTText = document.getElementById('balance-usdt');
    const balanceBTCText = document.getElementById('balance-btc');
    
    // Controles y configuraciones del bot en la sección Autobot
    const startBotBtn = document.getElementById('start-bot-btn');
    const stopBotBtn = document.getElementById('stop-bot-btn');
    const purchaseAmountInput = document.getElementById('purchase-amount');
    const incrementPercentageInput = document.getElementById('increment-percentage');
    const decrementPercentageInput = document.getElementById('decrement-percentage');
    const triggerPercentageInput = document.getElementById('trigger-percentage');
    const stopOnCycleEndCheckbox = document.getElementById('stop-on-cycle-end');

    // Referencias a elementos del modal de API (si es un modal separado)
    const apiModal = document.getElementById('api-modal');
    const apiFormModal = document.getElementById('api-form');
    const closeApiModalButton = apiModal ? apiModal.querySelector('.close-button') : null;
    const apiKeyIcon = document.getElementById('api-key-icon');


    // --- Lógica de Autenticación y Visibilidad de UI ---
    let currentToken = localStorage.getItem('token');
    let socket; // Declarar socket fuera del scope inicial para que sea accesible

    function updateAuthUI(isAuthenticated) {
        if (isAuthenticated) {
            if (loginSection) loginSection.style.display = 'none'; // Oculta el modal de login
            if (appSection) appSection.classList.remove('hidden'); // Muestra la sección principal de la app
            if (loginLogoutIcon) {
                loginLogoutIcon.classList.remove('fa-sign-in-alt');
                loginLogoutIcon.classList.add('fa-sign-out-alt');
                loginLogoutIcon.title = 'Logout';
            }
            // Conectar Socket.IO cuando el usuario está autenticado
            if (!socket || !socket.connected) {
                connectSocketIO();
            }
        } else {
            if (loginSection) loginSection.style.display = 'flex'; // Muestra el modal de login
            if (appSection) appSection.classList.add('hidden'); // Oculta la sección principal de la app
            if (loginLogoutIcon) {
                loginLogoutIcon.classList.remove('fa-sign-out-alt');
                loginLogoutIcon.classList.add('fa-sign-in-alt');
                loginLogoutIcon.title = 'Login';
            }
            // Desconectar Socket.IO si el usuario no está autenticado
            if (socket && socket.connected) {
                socket.disconnect();
            }
        }
    }

    // --- Conectar a Socket.IO con token de autenticación ---
    function connectSocketIO() {
        // Asegúrate de que el token esté disponible antes de conectar
        currentToken = localStorage.getItem('token');
        if (!currentToken) {
            console.warn("No token found for Socket.IO connection. Deferring connection.");
            return;
        }

        // Si ya hay una instancia de socket y está conectada, no crees una nueva.
        if (socket && socket.connected) {
            console.log("Socket.IO already connected.");
            return;
        }
        
        // Conectar con el token como query param (necesario para la autenticación de Socket.IO)
        // La URL del backend para el socket
        const backendUrl = window.location.origin; // O tu URL de Vercel para el backend si es diferente
        socket = io(backendUrl, {
            auth: {
                token: currentToken
            }
        });

        // --- Socket.IO Listeners ---
        socket.on('connect', () => {
            console.log('Conectado al servidor Socket.IO.');
            // Una vez conectado, solicita el estado actual del bot al servidor
            socket.emit('requestBotState');
        });

        socket.on('disconnect', (reason) => {
            console.log('Desconectado del servidor Socket.IO. Razón:', reason);
            updateConnectionStatus(false, `Desconectado del servidor Socket.IO: ${reason}.`);
        });

        socket.on('connect_error', (error) => {
            console.error('Error de conexión a Socket.IO:', error.message);
            updateConnectionStatus(false, `Error de conexión: ${error.message}.`);
        });

        socket.on('botStateUpdate', (state) => {
            console.log('Actualización del estado del bot recibida:', state);
            updateBotStateUI(state);
        });

        socket.on('balanceUpdate', (balance) => {
            console.log('Actualización de balance recibida:', balance);
            if (balanceUSDTText) balanceUSDTText.textContent = `${balance.usdt ? parseFloat(balance.usdt).toFixed(2) : '0.00'}`;
            if (balanceBTCText) balanceBTCText.textContent = `${balance.btc ? parseFloat(balance.btc).toFixed(5) : '0.00000'}`;
        });
    }

    // --- Funciones de Utilidad ---

    // Función genérica para hacer peticiones al backend (ahora con token)
    async function fetchFromBackend(endpoint, options = {}) {
        currentToken = localStorage.getItem('token'); // Asegura que siempre usamos el token más reciente

        if (!currentToken) {
            console.error("No se encontró token de autenticación. Redirigiendo al login.");
            updateAuthUI(false); // Muestra la interfaz de login
            throw new Error("No autorizado");
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}` // <-- Añadido el token
        };

        const response = await fetch(`/api${endpoint}`, { ...options, headers });

        if (response.status === 401 || response.status === 403) {
            // alert('Sesión expirada o inválida. Por favor, inicia sesión de nuevo.'); // Reemplazado por manejo de UI
            localStorage.removeItem('token');
            updateAuthUI(false); // Fuerza a mostrar la interfaz de login
            authMessage.textContent = 'Sesión expirada o inválida. Por favor, inicia sesión de nuevo.';
            authMessage.style.color = 'red';
            throw new Error("No autorizado o Prohibido");
        }

        const data = await response.json();

        if (!response.ok) {
            console.error(`Error en el backend en ${endpoint}:`, data.message || response.statusText);
            throw new Error(data.message || 'Ocurrió un error');
        }
        return data;
    }

    // Actualiza el estado de conexión de la API en la UI
    function updateConnectionStatus(connected, message = '') {
        if (connectionIndicator && connectionText && apiStatusMessageElement) { // Usar apiStatusMessageElement
            if (connected) {
                connectionIndicator.classList.remove('bg-red-500', 'bg-yellow-500');
                connectionIndicator.classList.add('bg-green-500');
                connectionText.textContent = 'Conectado';
                apiStatusMessageElement.textContent = message || 'Las claves API son válidas y están conectadas.';
                apiStatusMessageElement.style.color = 'green';
            } else {
                connectionIndicator.classList.remove('bg-green-500', 'bg-yellow-500');
                connectionIndicator.classList.add('bg-red-500');
                connectionText.textContent = 'Desconectado';
                apiStatusMessageElement.textContent = message || 'Las claves API son inválidas o la conexión falló.';
                apiStatusMessageElement.style.color = 'red';
            }
        }
    }

    // Actualiza el estado del bot y sus parámetros en la UI
    function updateBotStateUI(state) {
        if (botStatusText) botStatusText.textContent = state.state; // Solo el estado
        if (cycleText) cycleText.textContent = state.cycle;
        if (profitText) profitText.textContent = `${state.profit ? state.profit.toFixed(2) : '0.00'} USDT`;
        if (cycleProfitText) cycleProfitText.textContent = `${state.cycleProfit ? state.cycleProfit.toFixed(2) : '0.00'} USDT`;
        if (currentPriceText) currentPriceText.textContent = `${state.currentPrice ? state.currentPrice.toFixed(2) : '0.00'} USDT`;

        // Actualizar campos de configuración del bot y habilitar/deshabilitar
        if (purchaseAmountInput) purchaseAmountInput.value = state.purchaseAmount || '';
        if (incrementPercentageInput) incrementPercentageInput.value = state.incrementPercentage || '';
        if (decrementPercentageInput) decrementPercentageInput.value = state.decrementPercentage || '';
        if (triggerPercentageInput) triggerPercentageInput.value = state.triggerPercentage || '';
        if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.checked = state.stopOnCycleEnd || false;
            
        // Habilitar campos y botón de inicio solo si el bot está en STOPPED o ERROR
        const isDisabled = !(state.state === 'STOPPED' || state.state === 'ERROR' || state.state === 'NO_COVERAGE'); // Deshabilitar si no está parado, en error o sin cobertura
        
        if (purchaseAmountInput) purchaseAmountInput.disabled = isDisabled;
        if (incrementPercentageInput) incrementPercentageInput.disabled = isDisabled;
        if (decrementPercentageInput) decrementPercentageInput.disabled = isDisabled;
        if (triggerPercentageInput) triggerPercentageInput.disabled = isDisabled;
        if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.disabled = isDisabled;
        
        if (startBotBtn) startBotBtn.disabled = isDisabled;
        if (stopBotBtn) stopBotBtn.disabled = !isDisabled; // Inverso al botón de inicio
    }

    // Carga el estado inicial del bot desde el backend para el usuario autenticado
    async function loadBotState() {
        try {
            const botState = await fetchFromBackend('/bot-state');
            console.log('Estado del bot cargado para el usuario:', botState);
            updateBotStateUI(botState);
        } catch (error) {
            console.error('Error al cargar el estado del bot:', error);
            updateBotStateUI({
                state: 'ERROR', cycle: 0, profit: 0, cycleProfit: 0, currentPrice: 0,
                purchaseAmount: 0, incrementPercentage: 0, decrementPercentage: 0, triggerPercentage: 0, stopOnCycleEnd: false
            });
            if (apiStatusMessageElement) {
                apiStatusMessageElement.textContent = `Error al cargar el estado del bot: ${error.message}`;
                apiStatusMessageElement.style.color = 'red';
            }
        }
    }

    // Verifica la conexión de las API keys con BitMart para el usuario autenticado
    async function checkApiConnection() {
        try {
            // Esta ruta '/user/bitmart/balance' ahora está protegida por authMiddleware en el backend
            const balance = await fetchFromBackend('/user/bitmart/balance'); 
            console.log('API de BitMart conectada. Balance:', balance);
            updateConnectionStatus(true);
            
            const usdtBalance = balance.find(b => b.currency === 'USDT');
            const btcBalance = balance.find(b => b.currency === 'BTC');
            if (balanceUSDTText) balanceUSDTText.textContent = `${usdtBalance ? parseFloat(usdtBalance.available).toFixed(2) : '0.00'}`;
            if (balanceBTCText) balanceBTCText.textContent = `${btcBalance ? parseFloat(btcBalance.available).toFixed(5) : '0.00000'}`;

        } catch (error) {
            console.warn('API de BitMart no conectada:', error.message);
            updateConnectionStatus(false, error.message);
        }
    }

    // --- Lógica de Cambio de Pestañas ---
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    function showTab(tabId) {
        navTabs.forEach(tab => tab.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        const activeNavTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
        if (activeNavTab) {
            activeNavTab.classList.add('active');
        }

        const activeContent = document.getElementById(`${tabId}-section`);
        if (activeContent) {
            activeContent.classList.add('active');
        }
    }

    navTabs.forEach(tab => {
        tab.addEventListener('click', async (e) => { // Añadir async para usar await
            e.preventDefault();
            const tabId = tab.dataset.tab;
            showTab(tabId);

            // Cargar datos específicos cuando se navega a la pestaña autobot, SOLO si está autenticado
            if (tabId === 'autobot' && currentToken) { // Solo intenta cargar si hay token
                await checkApiConnection();
                await loadBotState();
            }
        });
    });

    // --- Inicialización de la Aplicación al cargar la página ---
    updateAuthUI(!!currentToken); // Llama al inicio para configurar la UI
    if (currentToken) {
        // Si ya hay un token, conecta Socket.IO inmediatamente
        connectSocketIO();
        // Si la pestaña inicial es 'autobot' al cargar, carga los datos del bot
        const initialTab = document.querySelector('.nav-tab.active')?.dataset.tab || 'dashboard';
        if (initialTab === 'autobot') {
            await checkApiConnection();
            await loadBotState();
        }
    }
    // Si no hay token, la función updateAuthUI(false) ya mostrará el modal de login.

    // --- Event Listeners de Autenticación (login/logout) ---
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            authMessage.textContent = ''; // Limpiar mensajes anteriores

            const email = emailInput.value;
            const token = tokenInput.value;

            if (!email) {
                authMessage.textContent = 'Por favor, introduce tu email.';
                authMessage.style.color = 'red';
                return;
            }

            // Primer paso: Solicitar token si no hay uno
            if (tokenInput.style.display === 'none') {
                try {
                    authButton.textContent = 'Sending...';
                    const response = await fetch('/api/auth/request-token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    const data = await response.json();
                    authButton.textContent = 'Continue';

                    if (response.ok) {
                        authMessage.textContent = 'Token enviado a tu email. Introduce el token para iniciar sesión.';
                        authMessage.style.color = 'green';
                        tokenInput.style.display = 'block'; // Muestra el campo de token
                        authButton.textContent = 'Login';
                    } else {
                        authMessage.textContent = data.message || 'Error al solicitar el token.';
                        authMessage.style.color = 'red';
                    }
                } catch (error) {
                    authButton.textContent = 'Continue';
                    authMessage.textContent = `Error de red: ${error.message}`;
                    authMessage.style.color = 'red';
                }
            } else { // Segundo paso: Verificar token e iniciar sesión
                if (!token) {
                    authMessage.textContent = 'Por favor, introduce el token.';
                    authMessage.style.color = 'red';
                    return;
                }
                try {
                    authButton.textContent = 'Logging in...';
                    const response = await fetch('/api/auth/verify-token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, token })
                    });
                    const data = await response.json();
                    authButton.textContent = 'Login';

                    if (response.ok && data.token) {
                        localStorage.setItem('token', data.token);
                        currentToken = data.token; // Actualiza la variable de token
                        authMessage.textContent = '¡Inicio de sesión exitoso!';
                        authMessage.style.color = 'green';
                        updateAuthUI(true); // Oculta el modal de login y muestra la app
                        // Restablecer campos para la próxima vez
                        emailInput.value = '';
                        tokenInput.value = '';
                        tokenInput.style.display = 'none';
                        authButton.textContent = 'Continue';

                        // Si la pestaña actual es autobot, carga sus datos
                        const currentTabId = document.querySelector('.nav-tab.active')?.dataset.tab;
                        if (currentTabId === 'autobot') {
                            await checkApiConnection();
                            await loadBotState();
                        }
                    } else {
                        authMessage.textContent = data.message || 'Token inválido o expirado.';
                        authMessage.style.color = 'red';
                    }
                } catch (error) {
                    authButton.textContent = 'Login';
                    authMessage.textContent = `Error de red: ${error.message}`;
                    authMessage.style.color = 'red';
                }
            }
        });
    }

    if (loginLogoutIcon) {
        loginLogoutIcon.addEventListener('click', () => {
            if (currentToken) { // Si hay un token, es un logout
                localStorage.removeItem('token');
                currentToken = null; // Limpia la variable de token
                updateAuthUI(false); // Vuelve a la interfaz de login
                // Opcional: mostrar un mensaje de logout en el modal de auth
                if (authMessage) {
                    authMessage.textContent = 'Has cerrado sesión.';
                    authMessage.style.color = 'green';
                }
            } else { // Si no hay token, es un intento de login
                updateAuthUI(false); // Muestra el modal de login
                // Limpiar mensajes anteriores al abrir para login
                if (authMessage) authMessage.textContent = '';
                if (tokenInput) tokenInput.style.display = 'none';
                if (authButton) authButton.textContent = 'Continue';
            }
        });
    }

    // --- Event Listeners de Bot y API ---

    // Manejo del formulario de conexión de API (en la sección Autobot)
    if (connectApiForm) {
        connectApiForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const apiKey = bitmartApiKeyInput ? bitmartApiKeyInput.value : '';
            const secretKey = bitmartSecretKeyInput ? bitmartSecretKeyInput.value : '';
            const apiMemo = bitmartApiMemoInput ? bitmartApiMemoInput.value : '';

            updateConnectionStatus(false, 'Conectando...');
            if (connectionIndicator) connectionIndicator.classList.add('bg-yellow-500');

            try {
                const response = await fetchFromBackend('/user/save-api-keys', { 
                    method: 'POST',
                    body: JSON.stringify({ apiKey, secretKey, apiMemo })
                });

                if (response.connected) {
                    updateConnectionStatus(true);
                    // Opcional: Limpiar los campos después de guardar si quieres
                    // if (bitmartApiKeyInput) bitmartApiKeyInput.value = '';
                    // if (bitmartSecretKeyInput) bitmartSecretKeyInput.value = '';
                    // if (bitmartApiMemoInput) bitmartApiMemoInput.value = '';
                } else {
                    updateConnectionStatus(false, response.message || 'Fallo al validar o guardar las claves API.');
                }
            } catch (error) {
                console.error('Error al enviar las claves API:', error);
                updateConnectionStatus(false, `Error: ${error.message}`);
            }
        });
    }

    // Manejo del modal de API (abrir y cerrar)
    if (apiKeyIcon && apiModal) {
        apiKeyIcon.addEventListener('click', () => {
            if (currentToken) { // Solo abre si el usuario está logueado
                apiModal.style.display = 'flex'; // Mostrar el modal
                // Opcional: precargar las API keys existentes en el modal para edición
                // if (apiStatusMessageElement) apiStatusMessageElement.textContent = ''; // Limpiar mensaje de estado del modal
            } else {
                // Si no hay token, pide al usuario que inicie sesión primero
                updateAuthUI(false);
                if (authMessage) {
                    authMessage.textContent = 'Por favor, inicia sesión para configurar tus API keys.';
                    authMessage.style.color = 'blue';
                }
            }
        });
    }

    if (closeApiModalButton && apiModal) {
        closeApiModalButton.addEventListener('click', () => {
            apiModal.style.display = 'none'; // Ocultar el modal
        });
        window.addEventListener('click', (event) => {
            if (event.target === apiModal) { // Cierra si se hace clic fuera del contenido del modal
                apiModal.style.display = 'none';
            }
        });
    }

    // Si el formulario de conexión de API está en un modal con id="api-form"
    if (apiFormModal) { 
        apiFormModal.addEventListener('submit', async (e) => {
            e.preventDefault();
            const apiKey = apiFormModal.querySelector('#api-key') ? apiFormModal.querySelector('#api-key').value : '';
            const secretKey = apiFormModal.querySelector('#secret-key') ? apiFormModal.querySelector('#secret-key').value : '';
            const apiMemo = apiFormModal.querySelector('#api-memo') ? apiFormModal.querySelector('#api-memo').value : '';

            const modalApiStatusMessage = apiFormModal.querySelector('.message-text');
            if (modalApiStatusMessage) {
                modalApiStatusMessage.textContent = 'Conectando...';
                modalApiStatusMessage.style.color = 'orange';
            }

            try {
                const response = await fetchFromBackend('/user/save-api-keys', {
                    method: 'POST',
                    body: JSON.stringify({ apiKey, secretKey, apiMemo })
                });

                if (response.connected) {
                    if (modalApiStatusMessage) {
                        modalApiStatusMessage.textContent = 'API keys validadas y guardadas con éxito.';
                        modalApiStatusMessage.style.color = 'green';
                    }
                    if (apiModal) apiModal.style.display = 'none'; // Cierra el modal si el éxito es desde el modal
                    checkApiConnection(); // Vuelve a verificar la conexión para actualizar el estado global
                } else {
                    if (modalApiStatusMessage) {
                        modalApiStatusMessage.textContent = response.message || 'Fallo al validar o guardar las claves API.';
                        modalApiStatusMessage.style.color = 'red';
                    }
                }
            } catch (error) {
                console.error('Error al enviar las claves API desde el modal:', error);
                if (modalApiStatusMessage) {
                    modalApiStatusMessage.textContent = `Error: ${error.message}`;
                    modalApiStatusMessage.style.color = 'red';
                }
            }
        });
    }

    if (startBotBtn) {
        startBotBtn.addEventListener('click', async () => {
            if (!currentToken) {
                updateAuthUI(false);
                if (authMessage) authMessage.textContent = 'Inicia sesión para iniciar el bot.';
                return;
            }

            const params = {
                purchase: parseFloat(purchaseAmountInput.value),
                increment: parseFloat(incrementPercentageInput.value),
                decrement: parseFloat(decrementPercentageInput.value),
                trigger: parseFloat(triggerPercentageInput.value),
                stopOnCycleEnd: stopOnCycleEndCheckbox.checked
            };

            if (isNaN(params.purchase) || isNaN(params.increment) || isNaN(params.decrement) || isNaN(params.trigger)) {
                alert('Por favor, introduce valores numéricos válidos en todos los campos de configuración del bot.');
                return;
            }

            // Deshabilitar campos y botón de inicio, habilitar stop (UI optimista)
            if (purchaseAmountInput) purchaseAmountInput.disabled = true;
            if (incrementPercentageInput) incrementPercentageInput.disabled = true;
            if (decrementPercentageInput) decrementPercentageInput.disabled = true;
            if (triggerPercentageInput) triggerPercentageInput.disabled = true;
            if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.disabled = true;
            if (startBotBtn) startBotBtn.disabled = true;
            if (stopBotBtn) stopBotBtn.disabled = false;

            try {
                const response = await fetchFromBackend('/toggle-bot', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'start', params })
                });
                // alert(response.message); // Usar un mensaje en UI en lugar de alert
                console.log(response.message);
                // El estado del bot se actualizará automáticamente vía Socket.IO
            } catch (error) {
                // alert(`Error al iniciar el bot: ${error.message}`); // Usar un mensaje en UI en lugar de alert
                console.error(`Error al iniciar el bot: ${error.message}`);
                // Re-habilitar campos si falla el inicio
                if (purchaseAmountInput) purchaseAmountInput.disabled = false;
                if (incrementPercentageInput) incrementPercentageInput.disabled = false;
                if (decrementPercentageInput) decrementPercentageInput.disabled = false;
                if (triggerPercentageInput) triggerPercentageInput.disabled = false;
                if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.disabled = false;
                if (startBotBtn) startBotBtn.disabled = false;
                if (stopBotBtn) stopBotBtn.disabled = true;
            }
        });
    }

    if (stopBotBtn) {
        stopBotBtn.addEventListener('click', async () => {
            if (!currentToken) {
                updateAuthUI(false);
                if (authMessage) authMessage.textContent = 'Inicia sesión para detener el bot.';
                return;
            }
            // Deshabilitar botón de parar mientras se procesa (UI optimista)
            if (stopBotBtn) stopBotBtn.disabled = true;
            // No habilitar startBotBtn aquí, updateBotStateUI lo manejará si el estado cambia a STOPPED

            try {
                const response = await fetchFromBackend('/toggle-bot', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'stop' })
                });
                // alert(response.message); // Usar un mensaje en UI en lugar de alert
                console.log(response.message);
                // El estado del bot se actualizará automáticamente vía Socket.IO
            } catch (error) {
                // alert(`Error al detener el bot: ${error.message}`); // Usar un mensaje en UI en lugar de alert
                console.error(`Error al detener el bot: ${error.message}`);
                // Re-habilitar botón de parar si falla la detención
                if (stopBotBtn) stopBotBtn.disabled = false;
            }
        });
    }
});
