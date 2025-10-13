// public/js/modules/uiManager.js

// Função para atualizar a interface de usuário com o estado do bot
export function updateBotUI(state) {
    // 🚨 DIAGNÓSTICO DO FRONTEND: Verificamos o objeto de estado completo recebido
    
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
        // Usa o ID 'auprofit' do HTML para mostrar o campo 'totalProfit'
        auprofit: 'totalProfit', 
        
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
                // Tentativa de conversão
                value = parseFloat(state[dataKey]); 
            } else {
                value = NaN; // Usamos NaN para simplificar a verificação
            }

            // Aplicar formato segundo o tipo de dado
            if (dataKey === 'totalProfit' || dataKey === 'profit') {
                // Se a conversão falhou (retornou NaN) ou o valor não está definido, mostra N/A.
                if (isNaN(value)) {
                    element.textContent = 'N/A';
                } else {
                    // Total Profit ou Profit por ciclo (2 decimais, se mostra com $)
                    element.textContent = `$${value.toFixed(2)}`;
                }
            } else if (dataKey === 'lcoverage' || dataKey === 'scoverage' || dataKey === 'lbalance' || dataKey === 'sbalance') {
                // Montos de dinheiro/balance (2 decimales)
                element.textContent = isNaN(value) ? 'N/A' : value.toFixed(2);
            } else if (dataKey === 'lnorder' || dataKey === 'snorder' || dataKey === 'lcycle' || dataKey === 'scycle') {
                // Contadores (0 decimales)
                element.textContent = isNaN(value) ? 'N/A' : value.toFixed(0);
            } else {
                // Outros (preços, etc.)
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

// Função para mostrar mensagens de estado na UI
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
