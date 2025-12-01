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
        // Clave que buscamos en el objeto 'state'
        auprofit: 'total_profit', 
        aulbalance: 'lbalance',
        ausbalance: 'sbalance',
        aultprice: 'ltprice',
        austprice: 'stprice',
        aulcycle: 'lcycle',
        auscycle: 'scycle',
        aulcoverage: 'lcoverage',
        auscoverage: 'scoverage',
        aulnorder: 'lnorder',
        ausnorder: 'snorder',
        aulsprice: 'lsprice', 
        ausbprice: 'sbprice',  
        aulprofit: 'lprofit',
        ausprofit: 'sprofit'
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

            // Usamos el Nullish Coalescing Operator (??) para asegurar que 0 sea un valor válido
            if (state[dataKey] !== undefined && state[dataKey] !== null) {
                // Intentamos convertir a número. Esto funciona si es '1', 1, o '1.23'.
                value = Number(state[dataKey]); 
            } else {
                value = NaN; // Si la clave no existe en el objeto 'state' del socket.
            }
            
            // 🛑 Lógica para limpiar y aplicar color (APLICAR A TODOS LOS ELEMENTOS QUE NECESITEN COLOR)
            // Primero, removemos las clases de color existentes para evitar conflictos
            element.classList.remove('text-green-500', 'text-red-500', 'text-gray-400');

            // Aplicar formato según el tipo de dato
            if (dataKey === 'total_profit' || dataKey === 'lprofit' || dataKey === 'sprofit') {
                // Total Profit (2 decimales, con signo $)
                if (isNaN(value)) {
                    element.textContent = 'N/A';
                } else {
                    // **APLICAR CLASES DE COLOR**
                    if (value > 0) {
                        element.classList.add('text-green-500');
                    } else if (value < 0) {
                        element.classList.add('text-red-500');
                    } else {
                        // Valor neutral (ej: 0)
                        element.classList.add('text-gray-400');
                    }
                    
                    // Formato de texto final
                    element.textContent = `$${value.toFixed(2)}`;
                }
            // ✅ CORREGIDO: Añadimos 'lsprice' y 'sbprice' a la lista de valores con 2 decimales
            } else if (['lcoverage', 'scoverage', 'lbalance', 'sbalance', 'ltprice', 'stprice', 'lsprice', 'sbprice'].includes(dataKey)) {
                // Montos de dinero/balance/precios (2 decimales)
                element.textContent = isNaN(value) ? 'N/A' : value.toFixed(2);
            } else if (dataKey === 'lnorder' || dataKey === 'snorder' || dataKey === 'lcycle' || dataKey === 'scycle') {
                // Contadores (0 decimales)
                element.textContent = isNaN(value) ? 'N/A' : value.toFixed(0);
            } else {
                // Si no es un número esperado, intentar mostrar el valor original
                // Usar String(state[dataKey]) asegura que '0' se muestre y no se caiga en la lógica 'falsy'
                element.textContent = state[dataKey] !== undefined && state[dataKey] !== null ? String(state[dataKey]) : 'N/A';
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