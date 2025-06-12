// public/js/main.js
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const isAuthenticated = !!token;

    const loginSection = document.getElementById('login-section');
    const appSection = document.getElementById('app-section');
    const logoutBtn = document.getElementById('logout-btn');
    const connectApiForm = document.getElementById('connect-api-form');
    const apiStatusMessage = document.getElementById('api-status-message');
    const connectionIndicator = document.getElementById('connection-indicator');
    const connectionText = document.getElementById('connection-text');
    const botStatusText = document.getElementById('bot-status-text'); // Nuevo
    const cycleText = document.getElementById('cycle-text'); // Nuevo
    const profitText = document.getElementById('profit-text'); // Nuevo
    const cycleProfitText = document.getElementById('cycle-profit-text'); // Nuevo
    const currentPriceText = document.getElementById('current-price-text'); // Nuevo
    const balanceUSDTText = document.getElementById('balance-usdt'); // Nuevo
    const balanceBTCText = document.getElementById('balance-btc'); // Nuevo
    const startBotBtn = document.getElementById('start-bot-btn'); // Nuevo
    const stopBotBtn = document.getElementById('stop-bot-btn'); // Nuevo
    const purchaseAmountInput = document.getElementById('purchase-amount'); // Nuevo
    const incrementPercentageInput = document.getElementById('increment-percentage'); // Nuevo
    const decrementPercentageInput = document.getElementById('decrement-percentage'); // Nuevo
    const triggerPercentageInput = document.getElementById('trigger-percentage'); // Nuevo
    const stopOnCycleEndCheckbox = document.getElementById('stop-on-cycle-end'); // Nuevo

    // Campos de BitMart API
    const bitmartApiKeyInput = document.getElementById('bitmart-api-key');
    const bitmartSecretKeyInput = document.getElementById('bitmart-secret-key');
    const bitmartApiMemoInput = document.getElementById('bitmart-api-memo');

    const socket = io(); // Conectar a Socket.IO

    // --- Funciones de Utilidad ---
    async function fetchFromBackend(endpoint, options = {}) {
        if (!token) {
            console.error("No authentication token found. Redirecting to login.");
            window.location.href = '/login.html';
            throw new Error("Unauthorized");
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        const response = await fetch(`/api${endpoint}`, { ...options, headers });

        if (response.status === 401 || response.status === 403) {
            alert('Session expired or invalid. Please log in again.');
            localStorage.removeItem('token');
            window.location.href = '/login.html';
            throw new Error("Unauthorized or Forbidden");
        }

        const data = await response.json();

        if (!response.ok) {
            console.error(`Backend error on ${endpoint}:`, data.message || response.statusText);
            throw new Error(data.message || 'An error occurred');
        }
        return data;
    }

    function updateConnectionStatus(connected) {
        if (connected) {
            connectionIndicator.classList.remove('bg-red-500', 'bg-yellow-500');
            connectionIndicator.classList.add('bg-green-500');
            connectionText.textContent = 'Connected';
            apiStatusMessage.textContent = 'API keys are valid and connected.';
            apiStatusMessage.style.color = 'green';
        } else {
            connectionIndicator.classList.remove('bg-green-500', 'bg-yellow-500');
            connectionIndicator.classList.add('bg-red-500');
            connectionText.textContent = 'Disconnected';
            apiStatusMessage.textContent = 'API keys are invalid or connection failed.';
            apiStatusMessage.style.color = 'red';
        }
    }

    function updateBotStateUI(state) {
        botStatusText.textContent = `Status: ${state.state}`;
        cycleText.textContent = `Cycle: ${state.cycle}`;
        profitText.textContent = `Total Profit: ${state.profit.toFixed(2)} USDT`;
        cycleProfitText.textContent = `Cycle Profit: ${state.cycleProfit.toFixed(2)} USDT`;
        currentPriceText.textContent = `Current Price: ${state.currentPrice.toFixed(2)} USDT`;

        // Actualizar campos de configuración del bot si no está corriendo
        if (state.state === 'STOPPED' || state.state === 'NO_COVERAGE') {
            purchaseAmountInput.value = state.purchaseAmount || '';
            incrementPercentageInput.value = state.incrementPercentage || '';
            decrementPercentageInput.value = state.decrementPercentage || '';
            triggerPercentageInput.value = state.triggerPercentage || '';
            stopOnCycleEndCheckbox.checked = state.stopOnCycleEnd || false;
            // Habilitar campos
            purchaseAmountInput.disabled = false;
            incrementPercentageInput.disabled = false;
            decrementPercentageInput.disabled = false;
            triggerPercentageInput.disabled = false;
            stopOnCycleEndCheckbox.disabled = false;
            startBotBtn.disabled = false;
            stopBotBtn.disabled = true; // No se puede detener si ya está parado
        } else {
            // Deshabilitar campos y botón de inicio si el bot está activo
            purchaseAmountInput.disabled = true;
            incrementPercentageInput.disabled = true;
            decrementPercentageInput.disabled = true;
            triggerPercentageInput.disabled = true;
            stopOnCycleEndCheckbox.disabled = true;
            startBotBtn.disabled = true;
            stopBotBtn.disabled = false; // Se puede detener si está corriendo
        }
    }

    async function loadBotState() {
        try {
            const botState = await fetchFromBackend('/bot-state');
            console.log('Bot state loaded:', botState);
            updateBotStateUI(botState);
        } catch (error) {
            console.error('Error loading bot state:', error);
            // Si hay un error al cargar el estado, mostrar estado por defecto
            updateBotStateUI({
                state: 'STOPPED',
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
        }
    }

    // --- Socket.IO Listeners ---
    socket.on('connect', () => {
        console.log('Connected to Socket.IO server.');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Socket.IO server.');
    });

    socket.on('botStateUpdate', (state) => {
        console.log('Received bot state update:', state);
        updateBotStateUI(state);
    });

    socket.on('balanceUpdate', (balance) => {
        console.log('Received balance update:', balance);
        balanceUSDTText.textContent = `USDT: ${balance.usdt.toFixed(2)}`;
        balanceBTCText.textContent = `BTC: ${balance.btc.toFixed(5)}`;
    });

    // --- Inicialización ---
    if (isAuthenticated) {
        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        await checkApiConnection();
        await loadBotState(); // Cargar el estado del bot al inicio
    } else {
        window.location.href = '/login.html';
    }

    // --- Event Listeners ---
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
    });

    connectApiForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = bitmartApiKeyInput.value;
        const secretKey = bitmartSecretKeyInput.value;
        const apiMemo = bitmartApiMemoInput.value;

        apiStatusMessage.textContent = 'Connecting...';
        apiStatusMessage.style.color = 'orange';
        connectionIndicator.classList.remove('bg-green-500', 'bg-red-500');
        connectionIndicator.classList.add('bg-yellow-500');
        connectionText.textContent = 'Connecting...';

        try {
            const response = await fetchFromBackend('/save-api-keys', {
                method: 'POST',
                body: JSON.stringify({ apiKey, secretKey, apiMemo })
            });

            // Si el backend envió un error (HTTP 4xx/5xx), fetchFromBackend ya lo lanzó.
            // Si llegó aquí y `response.connected` es `false` (o no existe pero response no es null),
            // significa que el backend respondió con un mensaje de error explícito pero HTTP 200.
            if (response.connected) {
                updateConnectionStatus(true);
                // Opcional: limpiar los campos de las claves después de la conexión exitosa
                bitmartApiKeyInput.value = '';
                bitmartSecretKeyInput.value = '';
                bitmartApiMemoInput.value = '';
            } else {
                const errorMessage = response.message || 'Failed to validate or save API keys.'; // Usamos response.message
                apiStatusMessage.textContent = errorMessage;
                apiStatusMessage.style.color = 'red';
                connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
                connectionIndicator.classList.add('bg-red-500');
                connectionText.textContent = 'Disconnected';
            }
        } catch (error) {
            // Este bloque captura errores de red o errores lanzados por fetchFromBackend
            // cuando el backend responde con un HTTP !res.ok
            console.error('Error submitting API keys:', error);
            apiStatusMessage.textContent = `Error: ${error.message}`;
            apiStatusMessage.style.color = 'red';
            connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
            connectionIndicator.classList.add('bg-red-500');
            connectionText.textContent = 'Disconnected';
        }
    });

    async function checkApiConnection() {
        try {
            // Intentar obtener el balance para verificar la conexión API
            const balance = await fetchFromBackend('/bitmart/balance');
            console.log('BitMart API Connected. Balance:', balance);
            updateConnectionStatus(true);
            socket.emit('requestBotState'); // Pide el estado del bot al backend al conectar API
            // Muestra los balances iniciales
            const usdtBalance = balance.find(b => b.currency === 'USDT');
            const btcBalance = balance.find(b => b.currency === 'BTC');
            balanceUSDTText.textContent = `USDT: ${usdtBalance ? parseFloat(usdtBalance.available).toFixed(2) : '0.00'}`;
            balanceBTCText.textContent = `BTC: ${btcBalance ? parseFloat(btcBalance.available).toFixed(5) : '0.00000'}`;

        } catch (error) {
            console.warn('BitMart API Not Connected:', error.message);
            updateConnectionStatus(false);
        }
    }

    startBotBtn.addEventListener('click', async () => {
        const purchaseAmount = purchaseAmountInput.value;
        const incrementPercentage = incrementPercentageInput.value;
        const decrementPercentage = decrementPercentageInput.value;
        const triggerPercentage = triggerPercentageInput.value;
        const stopOnCycleEnd = stopOnCycleEndCheckbox.checked;

        if (!purchaseAmount || !incrementPercentage || !decrementPercentage || !triggerPercentage) {
            alert('Please fill in all bot configuration fields.');
            return;
        }

        // Deshabilitar campos y botón de inicio para evitar cambios durante la operación
        purchaseAmountInput.disabled = true;
        incrementPercentageInput.disabled = true;
        decrementPercentageInput.disabled = true;
        triggerPercentageInput.disabled = true;
        stopOnCycleEndCheckbox.disabled = true;
        startBotBtn.disabled = true;
        stopBotBtn.disabled = false;

        try {
            const response = await fetchFromBackend('/bot/start', {
                method: 'POST',
                body: JSON.stringify({
                    purchaseAmount,
                    incrementPercentage,
                    decrementPercentage,
                    triggerPercentage,
                    stopOnCycleEnd
                })
            });
            alert(response.message);
            // El estado del bot se actualizará automáticamente vía Socket.IO
        } catch (error) {
            alert(`Error starting bot: ${error.message}`);
            // Re-habilitar campos si falla el inicio
            purchaseAmountInput.disabled = false;
            incrementPercentageInput.disabled = false;
            decrementPercentageInput.disabled = false;
            triggerPercentageInput.disabled = false;
            stopOnCycleEndCheckbox.disabled = false;
            startBotBtn.disabled = false;
            stopBotBtn.disabled = true;
        }
    });

    stopBotBtn.addEventListener('click', async () => {
        // Deshabilitar botón de parar mientras se procesa
        stopBotBtn.disabled = true;
        startBotBtn.disabled = false; // Habilitar el botón de inicio al parar

        try {
            const response = await fetchFromBackend('/bot/stop', {
                method: 'POST'
            });
            alert(response.message);
            // El estado del bot se actualizará automáticamente vía Socket.IO
        } catch (error) {
            alert(`Error stopping bot: ${error.message}`);
            // Re-habilitar botón de parar si falla la detención
            stopBotBtn.disabled = false;
            startBotBtn.disabled = true;
        }
    });
});