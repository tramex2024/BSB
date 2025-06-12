// public/js/main.js
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const isAuthenticated = !!token;

    // Obtener referencias a los elementos HTML
    const loginSection = document.getElementById('login-section');
    const appSection = document.getElementById('app-section');
    const logoutBtn = document.getElementById('logout-btn');
    const connectApiForm = document.getElementById('connect-api-form');
    const apiStatusMessage = document.getElementById('api-status-message');
    const connectionIndicator = document.getElementById('connection-indicator');
    const connectionText = document.getElementById('connection-text');
    const botStatusText = document.getElementById('bot-status-text');
    const cycleText = document.getElementById('cycle-text');
    const profitText = document.getElementById('profit-text');
    const cycleProfitText = document.getElementById('cycle-profit-text');
    const currentPriceText = document.getElementById('current-price-text');
    const balanceUSDTText = document.getElementById('balance-usdt');
    const balanceBTCText = document.getElementById('balance-btc');
    const startBotBtn = document.getElementById('start-bot-btn');
    const stopBotBtn = document.getElementById('stop-bot-btn');
    const purchaseAmountInput = document.getElementById('purchase-amount');
    const incrementPercentageInput = document.getElementById('increment-percentage');
    const decrementPercentageInput = document.getElementById('decrement-percentage');
    const triggerPercentageInput = document.getElementById('trigger-percentage');
    const stopOnCycleEndCheckbox = document.getElementById('stop-on-cycle-end');

    // Campos de BitMart API
    const bitmartApiKeyInput = document.getElementById('bitmart-api-key');
    const bitmartSecretKeyInput = document.getElementById('bitmart-secret-key');
    const bitmartApiMemoInput = document.getElementById('bitmart-api-memo');

    // Conectar a Socket.IO
    const socket = io();

    // --- Funciones de Utilidad ---

    // Función genérica para hacer peticiones al backend
    async function fetchFromBackend(endpoint, options = {}) {
        if (!token) {
            console.error("No se encontró token de autenticación. Redirigiendo al login.");
            window.location.href = '/login.html';
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
            window.location.href = '/login.html';
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
        if (state.state === 'STOPPED' || state.state === 'NO_COVERAGE') {
            if (purchaseAmountInput) purchaseAmountInput.value = state.purchaseAmount || '';
            if (incrementPercentageInput) incrementPercentageInput.value = state.incrementPercentage || '';
            if (decrementPercentageInput) decrementPercentageInput.value = state.decrementPercentage || '';
            if (triggerPercentageInput) triggerPercentageInput.value = state.triggerPercentage || '';
            if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.checked = state.stopOnCycleEnd || false;
            
            // Habilitar campos y botón de inicio
            if (purchaseAmountInput) purchaseAmountInput.disabled = false;
            if (incrementPercentageInput) incrementPercentageInput.disabled = false;
            if (decrementPercentageInput) decrementPercentageInput.disabled = false;
            if (triggerPercentageInput) triggerPercentageInput.disabled = false;
            if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.disabled = false;
            if (startBotBtn) startBotBtn.disabled = false;
            if (stopBotBtn) stopBotBtn.disabled = true; // No se puede detener si ya está parado
        } else {
            // Deshabilitar campos y botón de inicio si el bot está activo
            if (purchaseAmountInput) purchaseAmountInput.disabled = true;
            if (incrementPercentageInput) incrementPercentageInput.disabled = true;
            if (decrementPercentageInput) decrementPercentageInput.disabled = true;
            if (triggerPercentageInput) triggerPercentageInput.disabled = true;
            if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.disabled = true;
            if (startBotBtn) startBotBtn.disabled = true;
            if (stopBotBtn) stopBotBtn.disabled = false; // Se puede detener si está corriendo
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
                state: 'ERROR', // O 'STOPPED' si prefieres un valor por defecto menos alarmante
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
            const balance = await fetchFromBackend('/user/bitmart/balance'); // Usar la ruta autenticada
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

    // --- Inicialización de la Aplicación ---
    if (isAuthenticated) {
        if (loginSection) loginSection.classList.add('hidden');
        if (appSection) appSection.classList.remove('hidden');
        
        // Cargar el estado del bot y verificar la conexión API al inicio
        await checkApiConnection();
        await loadBotState();
    } else {
        window.location.href = '/login.html'; // Redirigir al login si no está autenticado
    }

    // --- Event Listeners ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        });
    }

    if (connectApiForm) {
        connectApiForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const apiKey = bitmartApiKeyInput ? bitmartApiKeyInput.value : '';
            const secretKey = bitmartSecretKeyInput ? bitmartSecretKeyInput.value : '';
            const apiMemo = bitmartApiMemoInput ? bitmartApiMemoInput.value : '';

            updateConnectionStatus(false, 'Conectando...');
            if (connectionIndicator) connectionIndicator.classList.add('bg-yellow-500');

            try {
                const response = await fetchFromBackend('/save-api-keys', {
                    method: 'POST',
                    body: JSON.stringify({ apiKey, secretKey, apiMemo })
                });

                if (response.connected) {
                    updateConnectionStatus(true);
                    // Opcional: limpiar los campos de las claves después de la conexión exitosa
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

    if (startBotBtn) {
        startBotBtn.addEventListener('click', async () => {
            // Deshabilitar campos y botón de inicio para evitar cambios durante la operación
            if (purchaseAmountInput) purchaseAmountInput.disabled = true;
            if (incrementPercentageInput) incrementPercentageInput.disabled = true;
            if (decrementPercentageInput) decrementPercentageInput.disabled = true;
            if (triggerPercentageInput) triggerPercentageInput.disabled = true;
            if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.disabled = true;
            if (startBotBtn) startBotBtn.disabled = true;
            if (stopBotBtn) stopBotBtn.disabled = false;

            const params = {
                purchase: parseFloat(purchaseAmountInput.value),
                increment: parseFloat(incrementPercentageInput.value),
                decrement: parseFloat(decrementPercentageInput.value),
                trigger: parseFloat(triggerPercentageInput.value),
                stopAtCycleEnd: stopOnCycleEndCheckbox.checked
            };

            if (isNaN(params.purchase) || isNaN(params.increment) || isNaN(params.decrement) || isNaN(params.trigger)) {
                alert('Por favor, introduce valores numéricos válidos en todos los campos de configuración del bot.');
                // Re-habilitar campos si la validación falla
                if (purchaseAmountInput) purchaseAmountInput.disabled = false;
                if (incrementPercentageInput) incrementPercentageInput.disabled = false;
                if (decrementPercentageInput) decrementPercentageInput.disabled = false;
                if (triggerPercentageInput) triggerPercentageInput.disabled = false;
                if (stopOnCycleEndCheckbox) stopOnCycleEndCheckbox.disabled = false;
                if (startBotBtn) startBotBtn.disabled = false;
                if (stopBotBtn) stopBotBtn.disabled = true;
                return;
            }

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
            if (startBotBtn) startBotBtn.disabled = false; // Habilitar el botón de inicio al parar

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
                if (startBotBtn) startBotBtn.disabled = true;
            }
        });
    }
});