// public/js/modules/uiManager.js

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
    
    const elementsToUpdate = {
        // 🚨 CORRECCIÓN CLAVE: Usamos el ID 'auprofit' del HTML
        // para mostrar la clave del estado 'totalProfit' (el acumulado)
        auprofit: 'totalProfit', 
        
        // Si quieres mostrar la ganancia por ciclo en otro lugar, debes añadir un ID nuevo.
        // Ejemplo: 'aucycleprofit': 'profit', 

        aulbalance: 'lbalance',
        ausbalance: 'sbalance',
        aultprice: 'ltprice',
        austprice: 'stprice',
        aulcycle: 'lcycle',
        auscycle: 'scycle',
        aulcoverage: 'lcoverage',
        auscoverage: 'scoverage',
        aulnorder: 'lnorder',
        ausnorder: 'snorder'
    };

    if (lstateElement) {
        lstateElement.textContent = state.lstate;
        lstateElement.className = '';
        lstateElement.classList.add(statusColors[state.lstate] || 'text-red-400');
    }

    if (sstateElement) {
        sstateElement.textContent = state.sstate;
        sstateElement.className = '';
        sstateElement.classList.add(statusColors[state.sstate] || 'text-red-400');
    }

    for (const [elementId, dataKey] of Object.entries(elementsToUpdate)) {
        const element = document.getElementById(elementId);
        if (element) {
            let value;
            if (state[dataKey] !== undefined) {
                value = parseFloat(state[dataKey]);
            } else {
                value = 'N/A';
            }

            // Aplicar formato según el tipo de dato
            if (dataKey === 'lcoverage' || dataKey === 'scoverage' || dataKey === 'lbalance' || dataKey === 'sbalance') {
                // Montos de dinero/balance (2 decimales)
                element.textContent = value !== 'N/A' ? value.toFixed(2) : 'N/A';
            } else if (dataKey === 'totalProfit' || dataKey === 'profit') {
                // Total Profit o Profit por ciclo (2 decimales, se muestra con $)
                element.textContent = value !== 'N/A' ? `$${value.toFixed(2)}` : 'N/A';
            } else if (dataKey === 'lnorder' || dataKey === 'snorder' || dataKey === 'lcycle' || dataKey === 'scycle') {
                // Contadores (0 decimales)
                element.textContent = value !== 'N/A' ? value.toFixed(0) : 'N/A';
            } else {
                // Otros (precios, etc.)
                element.textContent = state[dataKey] !== undefined ? state[dataKey] : 'N/A';
            }
        }
    }
    
    const isStopped = state.lstate === 'STOPPED' && state.sstate === 'STOPPED';
    
    if (autobotSettings) {
        const inputs = autobotSettings.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.disabled = !isStopped;
        });
    }

    if (startStopButton) {
        startStopButton.textContent = isStopped ? 'START' : 'STOP';
        startStopButton.classList.remove('start-btn', 'stop-btn');
        startStopButton.classList.add(isStopped ? 'start-btn' : 'stop-btn');
    }
}

// Función para mostrar mensajes de estado en la UI
export function displayMessage(message, type) {
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        messageContainer.textContent = message;
        messageContainer.className = `message ${type}`;
        setTimeout(() => {
            messageContainer.textContent = '';
            messageContainer.className = 'message';
        }, 5000); // El mensaje desaparece después de 5 segundos
    }
}
