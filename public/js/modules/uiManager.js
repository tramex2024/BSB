// public/js/modules/uiManager.js (VERSIÓN FINAL CON FORMATO Y CERO-CHECK)

// Helper para formatear números, manejando null/undefined/0 y aplicando decimales
const formatValue = (value, decimals = 2, defaultText = 'N/A', isPrice = false) => {
    // Si el valor es null, undefined, o 0, mostrar el texto por defecto.
    // Para balances y profits, si es 0, sí debe mostrar '0.00'. Solo N/A si no existe.
    if (value === undefined || value === null) {
        return defaultText;
    }
    
    // Si es una variable de precio, necesitamos muchos decimales (ej: 2 a 5)
    if (isPrice) {
        // Asumiendo que precios grandes requieren 2 decimales y precios pequeños 5
        decimals = value >= 1000 ? 2 : 5; 
    }
    
    // Si el valor es un string (como un estado) lo devolvemos
    if (typeof value === 'string' && isNaN(parseFloat(value))) {
        return value;
    }
    
    // Formatear el número
    const num = parseFloat(value);
    
    // Si es un Target Price (ltprice/stprice) y es 0, asumimos que no hay orden.
    // Caso especial para Target Price, si es 0, mejor N/A o '--'
    if (isPrice && num === 0) {
        return '--';
    }
    
    // De lo contrario, devuelve el valor formateado
    return num.toFixed(decimals);
};

// Función para actualizar la interfaz de usuario con el estado del bot
export function updateBotUI(state) {
    const statusColors = {
        RUNNING: 'text-green-400',
        STOPPED: 'text-red-400',
        BUYING: 'text-blue-400',
        SELLING: 'text-yellow-400',
        NO_COVERAGE: 'text-purple-400'
    };

    const lstateElement = document.getElementById('aubot-lstate');
    const sstateElement = document.getElementById('aubot-sstate');
    const startStopButton = document.getElementById('austart-btn');
    const autobotSettings = document.getElementById('autobot-settings');
    
    // Definición de todos los elementos y el formato que requieren
    const elementsToUpdate = {
        auprofit: { key: 'totalProfit', format: 'float', decimals: 2 }, // Asumo que el profit se llama totalProfit en el state
        auprice: { key: 'price', format: 'price' }, // Si tienes un campo 'price' global
        aubalance: { key: 'totalBalance', format: 'float', decimals: 2 }, // Si tienes un campo 'totalBalance' global
        aulbalance: { key: 'lbalance', format: 'float', decimals: 2 },
        ausbalance: { key: 'sbalance', format: 'float', decimals: 5 }, // BTC requiere más decimales
        aultprice: { key: 'ltprice', format: 'price' }, // Target Price Long
        austprice: { key: 'stprice', format: 'price' }, // Target Price Short
        aulcycle: { key: 'lcycle', format: 'int' },
        auscycle: { key: 'scycle', format: 'int' },
        aulcoverage: { key: 'lcoverage', format: 'price' }, // Precio de cobertura (USDT)
        auscoverage: { key: 'scoverage', format: 'price' }, // Precio de cobertura (BTC)
        aulnorder: { key: 'lnorder', format: 'int' }, // Número de orden
        ausnorder: { key: 'snorder', format: 'int' } // Número de orden
    };


    // --- 1. ACTUALIZACIÓN DE ESTADOS (LState y SState) ---
    if (lstateElement) {
        lstateElement.textContent = state.lstate || 'N/A';
        lstateElement.className = '';
        lstateElement.classList.add(statusColors[state.lstate] || 'text-red-400');
    }

    if (sstateElement) {
        sstateElement.textContent = state.sstate || 'N/A';
        sstateElement.className = '';
        sstateElement.classList.add(statusColors[state.sstate] || 'text-red-400');
    }

    // --- 2. ACTUALIZACIÓN DE DATOS NUMÉRICOS ---
    for (const [elementId, data] of Object.entries(elementsToUpdate)) {
        const element = document.getElementById(elementId);
        const value = state[data.key];
        
        if (element) {
            let formattedValue;
            
            if (data.format === 'price') {
                formattedValue = formatValue(value, 2, 'N/A', true);
            } else if (data.format === 'float') {
                formattedValue = formatValue(value, data.decimals, '0.00');
            } else if (data.format === 'int') {
                // Para órdenes y ciclos, si no existe o es null, usamos 0.
                formattedValue = formatValue(value || 0, 0, '0');
            } else {
                formattedValue = value !== undefined ? value : 'N/A';
            }
            
            element.textContent = formattedValue;
        }
    }
    
    // --- 3. GESTIÓN DE BOTÓN Y CONFIGURACIÓN ---
    const isStopped = (state.lstate === 'STOPPED' || !state.lstate) && (state.sstate === 'STOPPED' || !state.sstate);
    
    if (autobotSettings) {
        const inputs = autobotSettings.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.disabled = !isStopped;
        });
    }

    if (startStopButton) {
        startStopButton.textContent = isStopped ? 'START' : 'STOP';
        // Asegúrate de que las clases 'start-btn' y 'stop-btn' existen en tu CSS
        startStopButton.classList.remove('start-btn', 'stop-btn');
        startStopButton.classList.add(isStopped ? 'start-btn' : 'stop-btn');
    }
}

// Función para mostrar mensajes de estado en la UI
export function displayMessage(message, type) {
    // ... (sin cambios) ...
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        messageContainer.textContent = message;
        messageContainer.className = `message ${type}`;
        setTimeout(() => {
            messageContainer.textContent = '';
            messageContainer.className = 'message';
        }, 5000); 
    }
}