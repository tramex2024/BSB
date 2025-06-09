// main.js (Frontend)

// --- Constantes y Variables Globales ---
const API_BASE_URL = 'https://bsb-ppex.onrender.com/api'; // Asegúrate de que esta URL sea correcta

// --- Funciones de Utilidad ---

/**
 * Realiza una petición fetch al backend.
 * @param {string} endpoint - La ruta del endpoint (ej. '/bot-state').
 * @param {string} method - El método HTTP (ej. 'GET', 'POST').
 * @param {object} [body=null] - El cuerpo de la petición para métodos POST/PUT.
 * @returns {Promise<object>} La respuesta parseada como JSON.
 */
async function fetchFromBackend(endpoint, method = 'GET', body = null) {
    const url = `${API_BASE_URL}${endpoint}`;
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options); // Línea 137
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Error desconocido' }));
            console.error(`Error fetching from ${endpoint}:`, errorData.message || response.statusText); // Línea 159
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching from ${endpoint}:`, error); // Línea 159
        throw error;
    }
}

// --- Funciones de Actualización de UI ---

function updateBotStateUI(botState) {
    if (!botState) {
        console.warn('updateBotStateUI: botState es null o undefined.');
        return;
    }

    document.getElementById('botStatus').textContent = botState.state || 'N/A';
    document.getElementById('currentCycle').textContent = botState.cycle !== undefined ? botState.cycle : 'N/A';
    document.getElementById('totalProfit').textContent = botState.profit !== undefined ? botState.profit.toFixed(2) : 'N/A';
    document.getElementById('currentPrice').textContent = botState.currentPrice !== undefined ? botState.currentPrice.toFixed(2) : 'N/A';
    document.getElementById('ppc').textContent = botState.ppc !== undefined ? botState.ppc.toFixed(2) : 'N/A';
    document.getElementById('cp').textContent = botState.cp !== undefined ? botState.cp.toFixed(2) : 'N/A';
    document.getElementById('ac').textContent = botState.ac !== undefined ? botState.ac.toFixed(8) : 'N/A';
    document.getElementById('pm').textContent = botState.pm !== undefined ? botState.pm.toFixed(2) : 'N/A';
    document.getElementById('pv').textContent = botState.pv !== undefined ? botState.pv.toFixed(2) : 'N/A';
    document.getElementById('pc').textContent = botState.pc !== undefined ? botState.pc.toFixed(2) : 'N/A';
    document.getElementById('cycleProfit').textContent = botState.cycleProfit !== undefined ? botState.cycleProfit.toFixed(2) : 'N/A';
    document.getElementById('orderCountInCycle').textContent = botState.orderCountInCycle !== undefined ? botState.orderCountInCycle : 'N/A';
    document.getElementById('lastOrderUSDTAmount').textContent = botState.lastOrderUSDTAmount !== undefined ? botState.lastOrderUSDTAmount.toFixed(2) : 'N/A';
    document.getElementById('nextCoverageUSDTAmount').textContent = botState.nextCoverageUSDTAmount !== undefined ? botState.nextCoverageUSDTAmount.toFixed(2) : 'N/A';
    document.getElementById('nextCoverageTargetPrice').textContent = botState.nextCoverageTargetPrice !== undefined ? botState.nextCoverageTargetPrice.toFixed(2) : 'N/A';

    // Actualizar los inputs con los valores actuales del bot si el bot está detenido,
    // para que el usuario vea la configuración cargada desde la DB.
    // Opcional: Esto es más útil si la UI permite cargar configuraciones.
    // Por ahora, solo lo haré cuando el bot esté detenido para no sobrescribir entradas manuales.
    if (botState.state === 'STOPPED') {
        document.getElementById('purchaseAmount').value = botState.purchaseAmount || '';
        document.getElementById('incrementPercentage').value = botState.incrementPercentage || '';
        document.getElementById('decrementPercentage').value = botState.decrementPercentage || '';
        document.getElementById('triggerPercentage').value = botState.triggerPercentage || '';
        document.getElementById('stopOnCycleEnd').checked = botState.stopOnCycleEnd || false;
    }

    // Actualizar botones de Start/Stop
    const startBtn = document.getElementById('startBotBtn');
    const stopBtn = document.getElementById('stopBotBtn');
    if (botState.state === 'RUNNING' || botState.state === 'BUYING' || botState.state === 'SELLING' || botState.state === 'NO_COVERAGE') {
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

function updateBalanceUI(balance) {
    if (balance) {
        document.getElementById('usdtBalance').textContent = balance.usdt !== undefined ? balance.usdt.toFixed(2) : 'N/A';
        document.getElementById('btcBalance').textContent = balance.btc !== undefined ? balance.btc.toFixed(8) : 'N/A';
    }
}

// --- Funciones de Eventos ---

async function loadInitialBotState() {
    try {
        const botState = await fetchFromBackend('/bot-state');
        updateBotStateUI(botState);
    } catch (error) {
        console.error('Error loading initial bot state:', error);
    }
}

async function toggleBotState(action) { // Línea 470
    try {
        let response;
        if (action === 'start') {
            // **IMPORTANTE: Recopilar valores de los inputs del frontend**
            const purchaseAmount = parseFloat(document.getElementById('purchaseAmount').value);
            const incrementPercentage = parseFloat(document.getElementById('incrementPercentage').value);
            const decrementPercentage = parseFloat(document.getElementById('decrementPercentage').value);
            const triggerPercentage = parseFloat(document.getElementById('triggerPercentage').value);
            const stopOnCycleEnd = document.getElementById('stopOnCycleEnd').checked;

            // Validar que los valores son números y no están vacíos
            if (isNaN(purchaseAmount) || isNaN(incrementPercentage) || isNaN(decrementPercentage) || isNaN(triggerPercentage)) {
                alert('Por favor, ingresa valores numéricos válidos para todos los parámetros del bot.');
                return;
            }
            if (purchaseAmount <= 0 || incrementPercentage < 0 || decrementPercentage < 0 || triggerPercentage < 0) {
                alert('Los valores deben ser mayores que cero para Monto de Compra y no negativos para los porcentajes.');
                return;
            }

            const payload = {
                action: 'start',
                purchaseAmount,
                incrementPercentage,
                decrementPercentage,
                triggerPercentage,
                stopOnCycleEnd // Incluir el estado de la casilla de verificación
            };
            response = await fetchFromBackend('/toggle-bot', 'POST', payload);
            alert('Bot iniciado con éxito!');
        } else if (action === 'stop') {
            response = await fetchFromBackend('/toggle-bot', 'POST', { action: 'stop' });
            alert('Bot detenido con éxito!');
        }
        updateBotStateUI(response.botState);
    } catch (error) {
        console.error('Error toggling bot state:', error); // Línea 498
        alert(`Error al cambiar el estado del bot: ${error.message}`);
    }
}

// --- Inicialización ---

document.addEventListener('DOMContentLoaded', () => {
    // Cargar el estado inicial del bot al cargar la página
    loadInitialBotState();

    // Configurar listeners de botones
    document.getElementById('startBotBtn').addEventListener('click', () => toggleBotState('start'));
    document.getElementById('stopBotBtn').addEventListener('click', () => toggleBotState('stop'));

    // Configurar Socket.IO para recibir actualizaciones en tiempo real
    const socket = io(API_BASE_URL.replace('/api', '')); // La URL base de Socket.IO es sin '/api'

    socket.on('botStateUpdate', (botState) => {
        console.log('Bot state updated:', botState);
        updateBotStateUI(botState);
    });

    socket.on('balanceUpdate', (balance) => {
        console.log('Balance updated:', balance);
        updateBalanceUI(balance);
    });

    socket.on('connect', () => {
        console.log('Conectado al servidor de Socket.IO');
    });

    socket.on('disconnect', () => {
        console.log('Desconectado del servidor de Socket.IO');
    });

    socket.on('connect_error', (error) => {
        console.error('Error de conexión de Socket.IO:', error);
    });
});