// public/js/main.js
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const isAuthenticated = !!token;

    // Obtener referencias a los elementos HTML
    const loginSection = document.getElementById('auth-modal'); // Asume que el modal de auth es tu "login-section"
    const appSection = document.getElementById('app-section'); // Contenedor principal de la app
    const logoutBtn = document.getElementById('logout-btn');

    // Elementos específicos del Autobot
    const connectApiForm = document.getElementById('connect-api-form'); // Formulario de API en la sección Autobot
    const bitmartApiKeyInput = document.getElementById('bitmart-api-key');
    const bitmartSecretKeyInput = document.getElementById('bitmart-secret-key');
    const bitmartApiMemoInput = document.getElementById('bitmart-api-memo');
    
    // Indicadores de estado de API en la sección Autobot
    const apiStatusMessage = document.getElementById('api-status-message');
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
    const apiFormModal = document.getElementById('api-form'); // El formulario dentro del modal
    const closeApiModalButton = apiModal ? apiModal.querySelector('.close-button') : null; // Botón de cerrar modal
    const apiKeyIcon = document.getElementById('api-key-icon'); // Icono para abrir el modal de API (en el header)

    // Conectar a Socket.IO
    // Si usas Vercel, la URL del socket debe coincidir con la de tu backend
    // const socket = io(process.env.BACKEND_URL || 'http://localhost:3001'); // Ajusta esto si tu socket.io está en una URL diferente
    const socket = io(); // Por defecto, intentará conectarse al host actual


    // --- Funciones de Utilidad ---

    // Función genérica para hacer peticiones al backend
    async function fetchFromBackend(endpoint, options = {}) {
        if (!token) {
            console.error("No se encontró token de autenticación. Redirigiendo al login.");
            // No redirigir directamente, dejar que la app lo maneje o el modal de auth
            // window.location.href = '/login.html';
            throw new Error("No autorizado");
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        const response = await fetch(`/api${endpoint}`, { ...options, headers });

        if (response.status === 401 || response.status === 403) {
            alert('Sesión expirada o inválida. Por favor, inicia sesión de nuevo.');
            localStorage.removeItem('token');
            // Muestra el modal de login o redirige
            if (loginSection) loginSection.style.display = 'flex'; // Muestra el modal de autenticación
            if (appSection) appSection.style.display = 'none'; // Oculta la app
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
        if (connectionIndicator && connectionText && apiStatusMessage) {
            if (connected) {
                connectionIndicator.classList.remove('bg-red-500', 'bg-yellow-500');
                connectionIndicator.classList.add('bg-green-500');
                connectionText.textContent = 'Conectado';
                apiStatusMessage.textContent = message || 'Las claves API son válidas y están conectadas.';
                apiStatusMessage.style.color = 'green';
            } else {
                connectionIndicator.classList.remove('bg-green-500', 'bg-yellow-500');
                connectionIndicator.classList.add('bg-red-500');
                connectionText.textContent = 'Desconectado';
                apiStatusMessage.textContent = message || 'Las claves API son inválidas o la conexión falló.';
                apiStatusMessage.style.color = 'red';
            }
        }
    }

    // Actualiza el estado del bot y sus parámetros en la UI
    function updateBotStateUI(state) {
        if (botStatusText) botStatusText.textContent = `Estado: ${state.state}`;
        if (cycleText) cycleText.textContent = `Ciclo: ${state.cycle}`;
        if (profitText) profitText.textContent = `Ganancia Total: ${state.profit ? state.profit.toFixed(2) : '0.00'} USDT`;
        if (cycleProfitText) cycleProfitText.textContent = `Ganancia del Ciclo: ${state.cycleProfit ? state.cycleProfit.toFixed(2) : '0.00'} USDT`;
        if (currentPriceText) currentPriceText.textContent = `Precio Actual: ${state.currentPrice ? state.currentPrice.toFixed(2) : '0.00'} USDT`;

        // Actualizar campos de configuración del bot y habilitar/deshabilitar
        if (state.state === 'STOPPED' || state.state === 'NO_COVERAGE' || state.state === 'ERROR' || state.state === 'RUNNING') {
            if (purchaseAmountInput) purchaseAmountInput.value = state.purchaseAmount || '';
            if (incrementPercentageInput) incrementPercentageInput.value = state.incrementPercentage || '';
            if (decrementPercentageInput) decrementPercentageInput.value = state.decrementPercentage || '';
            if (triggerPercentageInput) triggerPercentageInput.value = state.triggerPercentage || '';
            if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.checked = state.stopOnCycleEnd || false;
            
            // Habilitar campos y botón de inicio solo si el bot está en STOPPED
            if (state.state === 'STOPPED' || state.state === 'ERROR') {
                if (purchaseAmountInput) purchaseAmountInput.disabled = false;
                if (incrementPercentageInput) incrementPercentageInput.disabled = false;
                if (decrementPercentageInput) decrementPercentageInput.disabled = false;
                if (triggerPercentageInput) triggerPercentageInput.disabled = false;
                if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.disabled = false;
                if (startBotBtn) startBotBtn.disabled = false;
                if (stopBotBtn) stopBotBtn.disabled = true; // No se puede detener si ya está parado o con error
            } else { // Si está RUNNING, BUYING, SELLING, NO_COVERAGE
                if (purchaseAmountInput) purchaseAmountInput.disabled = true;
                if (incrementPercentageInput) incrementPercentageInput.disabled = true;
                if (decrementPercentageInput) decrementPercentageInput.disabled = true;
                if (triggerPercentageInput) triggerPercentageInput.disabled = true;
                if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.disabled = true;
                if (startBotBtn) startBotBtn.disabled = true;
                if (stopBotBtn) stopBotBtn.disabled = false; // Se puede detener
            }
        }
    }

    // Carga el estado inicial del bot desde el backend
    async function loadBotState() {
        try {
            const botState = await fetchFromBackend('/bot-state');
            console.log('Estado del bot cargado:', botState);
            updateBotStateUI(botState);
        } catch (error) {
            console.error('Error al cargar el estado del bot:', error);
            // Mostrar un estado por defecto si falla la carga
            updateBotStateUI({
                state: 'ERROR',
                cycle: 0,
                profit: 0,
                cycleProfit: 0,
                currentPrice: 0,
                purchaseAmount: 0,
                incrementPercentage: 0,
                decrementPercentage: 0,
                triggerPercentage: 0,
                stopOnCycleEnd: false
            });
            // Mostrar un mensaje de error en la UI si hay un área para ello
            if (apiStatusMessage) {
                apiStatusMessage.textContent = `Error al cargar el estado del bot: ${error.message}`;
                apiStatusMessage.style.color = 'red';
            }
        }
    }

    // Verifica la conexión de las API keys con BitMart
    async function checkApiConnection() {
        try {
            // Asegúrate de que esta ruta '/user/bitmart/balance' realmente exista en tu userRoutes.js
            const balance = await fetchFromBackend('/user/bitmart/balance'); 
            console.log('API de BitMart conectada. Balance:', balance);
            updateConnectionStatus(true);
            
            // Actualiza los balances iniciales en la UI
            const usdtBalance = balance.find(b => b.currency === 'USDT');
            const btcBalance = balance.find(b => b.currency === 'BTC');
            if (balanceUSDTText) balanceUSDTText.textContent = `USDT: ${usdtBalance ? parseFloat(usdtBalance.available).toFixed(2) : '0.00'}`;
            if (balanceBTCText) balanceBTCText.textContent = `BTC: ${btcBalance ? parseFloat(btcBalance.available).toFixed(5) : '0.00000'}`;

        } catch (error) {
            console.warn('API de BitMart no conectada:', error.message);
            updateConnectionStatus(false, error.message);
        }
    }

    // --- Socket.IO Listeners ---
    socket.on('connect', () => {
        console.log('Conectado al servidor Socket.IO.');
        // Una vez conectado, solicita el estado actual del bot
        socket.emit('requestBotState');
    });

    socket.on('disconnect', () => {
        console.log('Desconectado del servidor Socket.IO.');
        updateConnectionStatus(false, 'Desconectado del servidor Socket.IO.');
    });

    socket.on('botStateUpdate', (state) => {
        console.log('Actualización del estado del bot recibida:', state);
        updateBotStateUI(state);
    });

    socket.on('balanceUpdate', (balance) => {
        console.log('Actualización de balance recibida:', balance);
        if (balanceUSDTText) balanceUSDTText.textContent = `USDT: ${balance.usdt ? balance.usdt.toFixed(2) : '0.00'}`;
        if (balanceBTCText) balanceBTCText.textContent = `BTC: ${balance.btc ? balance.btc.toFixed(5) : '0.00000'}`;
    });

    // --- Lógica de Cambio de Pestañas ---
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    // Función para mostrar la pestaña activa
    function showTab(tabId) {
        // Remover 'active' de todas las pestañas de navegación
        navTabs.forEach(tab => tab.classList.remove('active'));

        // Ocultar todos los contenidos de las pestañas
        tabContents.forEach(content => content.classList.remove('active'));

        // Añadir 'active' a la pestaña de navegación correspondiente
        const activeNavTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
        if (activeNavTab) {
            activeNavTab.classList.add('active');
        }

        // Mostrar el contenido de la pestaña correspondiente
        const activeContent = document.getElementById(`${tabId}-section`);
        if (activeContent) {
            activeContent.classList.add('active');
        }
    }

    // Event listener para los clics en las pestañas de navegación
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault(); // Prevenir el comportamiento por defecto del enlace
            const tabId = tab.dataset.tab; // Obtener el ID de la pestaña del atributo data-tab
            showTab(tabId); // Mostrar la pestaña

            // Si la pestaña seleccionada es 'autobot', recargar el estado del bot y la conexión API
            if (tabId === 'autobot') {
                checkApiConnection();
                loadBotState();
            }
        });
    });

    // --- Inicialización de la Aplicación ---
    if (isAuthenticated) {
        if (loginSection) loginSection.style.display = 'none'; // Oculta el modal de login
        if (appSection) appSection.style.display = 'block'; // Muestra la sección principal de la app
        
        // Determinar la pestaña inicial a mostrar
        let initialTab = 'dashboard'; // Por defecto, muestra el dashboard
        const activeTabInMarkup = document.querySelector('.nav-tab.active');
        if (activeTabInMarkup) {
            initialTab = activeTabInMarkup.dataset.tab;
        } else {
            // Si no hay tab activa en el markup, activa la primera por defecto
            if (navTabs.length > 0) {
                navTabs[0].classList.add('active');
                initialTab = navTabs[0].dataset.tab;
            }
        }
        showTab(initialTab); // Muestra la pestaña inicial
        
        // Cargar el estado del bot y verificar la conexión API si la pestaña inicial es 'autobot'
        if (initialTab === 'autobot') {
            await checkApiConnection();
            await loadBotState();
        }
    } else {
        // Si no está autenticado, muestra el modal de login y oculta la app principal
        if (loginSection) loginSection.style.display = 'flex';
        if (appSection) appSection.style.display = 'none';
        // Puedes agregar una función para mostrar el modal de autenticación aquí
        // showAuthModal();
    }

    // --- Event Listeners ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            // Muestra el modal de login y oculta la app
            if (loginSection) loginSection.style.display = 'flex';
            if (appSection) appSection.style.display = 'none';
            // showAuthModal(); // Llama a tu función para mostrar el modal de autenticación
            // O, si solo quieres redirigir:
            // window.location.href = '/login.html';
        });
    }

    // Manejo del modal de API (abrir y cerrar)
    if (apiKeyIcon && apiModal) {
        apiKeyIcon.addEventListener('click', () => {
            apiModal.style.display = 'flex'; // Mostrar el modal
            // Opcional: precargar las API keys existentes en el modal si quieres que el usuario las edite
            // Puedes añadir una función fetch para obtener las keys del usuario
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

    // Si el formulario de conexión de API está en la sección Autobot con id="connect-api-form"
    if (connectApiForm) {
        connectApiForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const apiKey = bitmartApiKeyInput ? bitmartApiKeyInput.value : '';
            const secretKey = bitmartSecretKeyInput ? bitmartSecretKeyInput.value : '';
            const apiMemo = bitmartApiMemoInput ? bitmartApiMemoInput.value : '';

            updateConnectionStatus(false, 'Conectando...');
            if (connectionIndicator) connectionIndicator.classList.add('bg-yellow-500');

            try {
                const response = await fetchFromBackend('/user/save-api-keys', { // Usar la ruta autenticada
                    method: 'POST',
                    body: JSON.stringify({ apiKey, secretKey, apiMemo })
                });

                if (response.connected) {
                    updateConnectionStatus(true);
                    if (bitmartApiKeyInput) bitmartApiKeyInput.value = '';
                    if (bitmartSecretKeyInput) bitmartSecretKeyInput.value = '';
                    if (bitmartApiMemoInput) bitmartApiMemoInput.value = '';
                } else {
                    updateConnectionStatus(false, response.message || 'Fallo al validar o guardar las claves API.');
                }
            } catch (error) {
                console.error('Error al enviar las claves API:', error);
                updateConnectionStatus(false, `Error: ${error.message}`);
            }
        });
    }

    // Si el formulario de conexión de API está en un modal con id="api-form"
    // Este bloque se ejecuta si tienes un modal separado para API keys y su formulario
    if (apiFormModal) { // Se refiere al formulario dentro del modal API
        apiFormModal.addEventListener('submit', async (e) => {
            e.preventDefault();
            const apiKey = apiFormModal.querySelector('#api-key') ? apiFormModal.querySelector('#api-key').value : '';
            const secretKey = apiFormModal.querySelector('#secret-key') ? apiFormModal.querySelector('#secret-key').value : '';
            const apiMemo = apiFormModal.querySelector('#api-memo') ? apiFormModal.querySelector('#api-memo').value : '';

            // Puedes usar el apiStatusMessage del modal si lo tienes o el global
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
            const params = {
                purchase: parseFloat(purchaseAmountInput.value),
                increment: parseFloat(incrementPercentageInput.value),
                decrement: parseFloat(decrementPercentageInput.value),
                trigger: parseFloat(triggerPercentageInput.value),
                stopAtCycleEnd: stopOnCycleEndCheckbox.checked
            };

            if (isNaN(params.purchase) || isNaN(params.increment) || isNaN(params.decrement) || isNaN(params.trigger)) {
                alert('Por favor, introduce valores numéricos válidos en todos los campos de configuración del bot.');
                return;
            }

            // Deshabilitar campos y botón de inicio, habilitar stop
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
                alert(response.message);
                // El estado del bot se actualizará automáticamente vía Socket.IO
            } catch (error) {
                alert(`Error al iniciar el bot: ${error.message}`);
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
            // Deshabilitar botón de parar mientras se procesa
            if (stopBotBtn) stopBotBtn.disabled = true;
            // No habilitar startBotBtn aquí, updateBotStateUI lo manejará si el estado cambia a STOPPED

            try {
                const response = await fetchFromBackend('/toggle-bot', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'stop' })
                });
                alert(response.message);
                // El estado del bot se actualizará automáticamente vía Socket.IO
            } catch (error) {
                alert(`Error al detener el bot: ${error.message}`);
                // Re-habilitar botón de parar si falla la detención
                if (stopBotBtn) stopBotBtn.disabled = false;
            }
        });
    }
});
