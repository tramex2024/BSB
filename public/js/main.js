// public/main.js
// Asume que fetchFromBackend está definido en algún lugar global o importado.
// Por ejemplo:
async function fetchFromBackend(path, options = {}) {
    const backendUrl = 'https://bsb-ppex.onrender.com'; // O tu URL de Render/Vercel
    const response = await fetch(`${backendUrl}${path}`, options);
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    return response.json();
}


document.addEventListener('DOMContentLoaded', () => {
    const apiModal = document.getElementById('apiModal');
    const openApiModalBtn = document.getElementById('openApiModal');
    const closeApiModalBtn = document.getElementById('closeApiModal');
    const saveApiKeysBtn = document.getElementById('saveApiKeysBtn');
    const apiKeyInput = document.getElementById('apiKey');
    const secretKeyInput = document.getElementById('secretKey');
    const apiMemoInput = document.getElementById('apiMemo');
    const apiStatusMessage = document.getElementById('apiStatusMessage');

    // Bot elements
    const toggleBotButton = document.getElementById('toggleBotButton');
    const botStatusDisplay = document.getElementById('botStatusDisplay'); // Nuevo elemento para el estado del bot
    const connectionIndicator = document.getElementById('connectionIndicator');
    const connectionText = document.getElementById('connectionText');
    const cycleDisplay = document.getElementById('cycleDisplay');
    const profitDisplay = document.getElementById('profitDisplay');
    const currentPriceDisplay = document.getElementById('currentPriceDisplay');
    const ppcDisplay = document.getElementById('ppcDisplay');
    const cpDisplay = document.getElementById('cpDisplay');
    const acDisplay = document.getElementById('acDisplay');
    const pmDisplay = document.getElementById('pmDisplay');
    const pvDisplay = document.getElementById('pvDisplay');
    const pcDisplay = document.getElementById('pcDisplay');
    const orderCountDisplay = document.getElementById('orderCountDisplay');
    const lastOrderUSDTAmountDisplay = document.getElementById('lastOrderUSDTAmountDisplay');
    const nextCoverageUSDTAmountDisplay = document.getElementById('nextCoverageUSDTAmountDisplay');
    const nextCoverageTargetPriceDisplay = document.getElementById('nextCoverageTargetPriceDisplay');
    const cycleProfitDisplay = document.getElementById('cycleProfitDisplay');

    // Bot parameters inputs
    const purchaseAmountInput = document.getElementById('purchaseAmount');
    const incrementPercentageInput = document.getElementById('incrementPercentage');
    const decrementPercentageInput = document.getElementById('decrementPercentage');
    const triggerPercentageInput = document.getElementById('triggerPercentage');
    const stopAtCycleEndCheckbox = document.getElementById('stopAtCycleEnd');


    // Socket.IO
    const socket = io('http://localhost:3001'); // Ajusta a la URL de tu backend
    socket.on('connect', () => {
        console.log('Conectado al servidor Socket.IO');
    });

    socket.on('disconnect', () => {
        console.log('Desconectado del servidor Socket.IO');
    });

    socket.on('botStateUpdate', (botState) => {
        console.log('Estado del bot actualizado recibido:', botState);
        updateBotUI(botState);
    });

    socket.on('balanceUpdate', (balance) => {
        console.log('Balance actualizado recibido:', balance);
        // Actualiza tu UI de balances aquí
        // Por ejemplo:
        // document.getElementById('usdtBalance').textContent = balance.usdt.toFixed(2);
        // document.getElementById('btcBalance').textContent = balance.btc.toFixed(8);
    });

    // Function to update the bot UI based on botState
    function updateBotUI(botState) {
        if (!botState) {
            console.warn('updateBotUI called with undefined botState.');
            return;
        }

        botStatusDisplay.textContent = `Estado del Bot: ${botState.state}`; // Actualiza el mensaje principal del estado
        cycleDisplay.textContent = botState.cycle;
        profitDisplay.textContent = botState.profit.toFixed(2);
        currentPriceDisplay.textContent = botState.currentPrice.toFixed(2);
        ppcDisplay.textContent = botState.ppc.toFixed(2);
        cpDisplay.textContent = botState.cp.toFixed(2);
        acDisplay.textContent = botState.ac.toFixed(8);
        pmDisplay.textContent = botState.pm.toFixed(2);
        pvDisplay.textContent = botState.pv.toFixed(2);
        pcDisplay.textContent = botState.pc.toFixed(2);
        orderCountDisplay.textContent = botState.orderCountInCycle;
        lastOrderUSDTAmountDisplay.textContent = botState.lastOrderUSDTAmount.toFixed(2);
        nextCoverageUSDTAmountDisplay.textContent = botState.nextCoverageUSDTAmount.toFixed(2);
        nextCoverageTargetPriceDisplay.textContent = botState.nextCoverageTargetPrice.toFixed(2);
        cycleProfitDisplay.textContent = botState.cycleProfit.toFixed(2);

        // Update connection indicator based on bot state
        connectionIndicator.classList.remove('bg-green-500', 'bg-red-500', 'bg-yellow-500', 'bg-gray-500');
        switch (botState.state) {
            case 'RUNNING':
            case 'BUYING':
            case 'SELLING':
                connectionIndicator.classList.add('bg-green-500');
                connectionText.textContent = 'Connected & Running';
                break;
            case 'STOPPED':
                connectionIndicator.classList.add('bg-gray-500');
                connectionText.textContent = 'Stopped';
                break;
            case 'NO_COVERAGE':
                connectionIndicator.classList.add('bg-yellow-500');
                connectionText.textContent = 'Awaiting Funds';
                break;
            case 'ERROR':
                connectionIndicator.classList.add('bg-red-500');
                connectionText.textContent = 'Error';
                break;
            default:
                connectionIndicator.classList.add('bg-gray-500');
                connectionText.textContent = 'Unknown State';
                break;
        }

        // Set form values based on current bot state (for persistence)
        purchaseAmountInput.value = botState.purchaseAmount;
        incrementPercentageInput.value = botState.incrementPercentage;
        decrementPercentageInput.value = botState.decrementPercentage;
        triggerPercentageInput.value = botState.triggerPercentage;
        stopAtCycleEndCheckbox.checked = botState.stopOnCycleEnd;
    }


    // Event Listeners for API Modal
    openApiModalBtn.addEventListener('click', () => {
        apiModal.style.display = 'block';
    });

    closeApiModalBtn.addEventListener('click', () => {
        apiModal.style.display = 'none';
        apiStatusMessage.textContent = ''; // Clear status message on close
    });

    window.addEventListener('click', (event) => {
        if (event.target === apiModal) {
            apiModal.style.display = 'none';
            apiStatusMessage.textContent = ''; // Clear status message on close
        }
    });

    // Save API Keys Button
    saveApiKeysBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        const secretKey = secretKeyInput.value.trim();
        const apiMemo = apiMemoInput.value.trim();

        if (!apiKey || !secretKey) {
            apiStatusMessage.textContent = 'API Key and Secret Key are required.';
            apiStatusMessage.style.color = 'red';
            return;
        }

        apiStatusMessage.textContent = 'Validating API keys...';
        apiStatusMessage.style.color = 'yellow';
        // No actualices el indicador de conexión principal aquí, esto es solo para las API Keys.
        // connectionIndicator.classList.remove('bg-green-500', 'bg-red-500', 'bg-gray-500');
        // connectionIndicator.classList.add('bg-yellow-500'); // Indicador de "cargando"
        // connectionText.textContent = 'Connecting...';

        try {
            const response = await fetchFromBackend('/api/user/save-api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey, secretKey, apiMemo })
            });

            if (response && response.connected) {
                apiStatusMessage.textContent = response.message || 'API keys validated and saved!';
                apiStatusMessage.style.color = 'green';
                // Solo actualiza el indicador principal si el bot está realmente conectado o se inicia
                // connectionIndicator.classList.remove('bg-yellow-500', 'bg-red-500');
                // connectionIndicator.classList.add('bg-green-500');
                // connectionText.textContent = 'Connected';

                // Disparar una actualización de balances y órdenes después de guardar las API keys
                // getBalances(); // Asegúrate de que esta función exista y obtenga balances
                // fetchOrders(currentTab); // Asegúrate de que esta función exista y obtenga órdenes
                
                // Opcional: Cerrar el modal después de un éxito
                // setTimeout(() => { apiModal.style.display = 'none'; }, 2000);
            } else {
                const errorMessage = response.message || 'Failed to validate or save API keys with an unexpected response.';
                apiStatusMessage.textContent = errorMessage;
                apiStatusMessage.style.color = 'red';
                // connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
                // connectionIndicator.classList.add('bg-red-500');
                // connectionText.textContent = 'Disconnected';
            }
        } catch (error) {
            console.error('Error submitting API keys:', error);
            apiStatusMessage.textContent = `Error: ${error.message}`; // Display the error message from fetchFromBackend
            apiStatusMessage.style.color = 'red';
            // connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
            // connectionIndicator.classList.add('bg-red-500');
            // connectionText.textContent = 'Disconnected';
        }
    });

    // Toggle Bot Button
    toggleBotButton.addEventListener('click', async () => {
        const action = toggleBotButton.dataset.action === 'start' ? 'start' : 'stop';
        const params = {
            purchase: parseFloat(purchaseAmountInput.value),
            increment: parseFloat(incrementPercentageInput.value),
            decrement: parseFloat(decrementPercentageInput.value),
            trigger: parseFloat(triggerPercentageInput.value),
            stopAtCycleEnd: stopAtCycleEndCheckbox.checked
        };

        // Validate parameters
        if (isNaN(params.purchase) || params.purchase <= 0 ||
            isNaN(params.increment) || params.increment < 0 ||
            isNaN(params.decrement) || params.decrement < 0 ||
            isNaN(params.trigger) || params.trigger <= 0) {
            botStatusDisplay.textContent = 'Please enter valid positive numbers for all bot parameters.';
            botStatusDisplay.style.color = 'red';
            return;
        }


        botStatusDisplay.textContent = `Solicitando ${action === 'start' ? 'inicio' : 'detención'} del bot...`;
        botStatusDisplay.style.color = 'yellow';

        try {
            const response = await fetchFromBackend('/api/toggle-bot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, params })
            });

            if (response.success && response.botState) {
                botStatusDisplay.textContent = response.message || `Bot ${action === 'start' ? 'started' : 'stopped'} successfully.`;
                botStatusDisplay.style.color = 'green';
                toggleBotButton.dataset.action = action === 'start' ? 'stop' : 'start';
                toggleBotButton.textContent = action === 'start' ? 'STOP BOT' : 'START BOT';
                // Llama a la función para actualizar toda la UI del bot
                updateBotUI(response.botState);
            } else {
                // Si success es false, hay un mensaje de error o el botState podría no ser lo esperado
                const errorMessage = response.message || `Failed to ${action} bot with an unexpected response.`;
                botStatusDisplay.textContent = errorMessage;
                botStatusDisplay.style.color = 'red';
                // Si el botState viene en la respuesta de error, úsalo para actualizar la UI
                if (response.botState) {
                    updateBotUI(response.botState);
                } else {
                    // Si no hay botState en la respuesta de error, asume un estado genérico
                    updateBotUI({ state: 'ERROR' });
                }
            }
        } catch (error) {
            console.error('Error toggling bot:', error);
            botStatusDisplay.textContent = `Error: ${error.message}`;
            botStatusDisplay.style.color = 'red';
            updateBotUI({ state: 'ERROR' }); // Update UI to error state
        }
    });

    // Initial load of bot state when page loads
    async function loadInitialBotState() {
        try {
            const response = await fetchFromBackend('/api/bot-state');
            if (response) {
                updateBotUI(response);
                // Ajusta el botón de toggle según el estado inicial
                if (response.state === 'RUNNING' || response.state === 'BUYING' || response.state === 'SELLING' || response.state === 'NO_COVERAGE') {
                    toggleBotButton.dataset.action = 'stop';
                    toggleBotButton.textContent = 'STOP BOT';
                } else {
                    toggleBotButton.dataset.action = 'start';
                    toggleBotButton.textContent = 'START BOT';
                }
            }
        } catch (error) {
            console.error('Error loading initial bot state:', error);
            botStatusDisplay.textContent = `Error loading bot state: ${error.message}`;
            botStatusDisplay.style.color = 'red';
            updateBotUI({ state: 'ERROR' }); // Fallback to error state
        }
    }

    loadInitialBotState(); // Call on page load
});