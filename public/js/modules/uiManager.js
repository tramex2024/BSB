// public/js/modules/uiManager.js

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
            if (state[dataKey] !== undefined && state[dataKey] !== null) {
                value = Number(state[dataKey]); 
            } else {
                value = NaN;
            }
            
            element.classList.remove('text-green-500', 'text-red-500', 'text-gray-400');

            if (dataKey === 'total_profit' || dataKey === 'lprofit' || dataKey === 'sprofit') {
                if (isNaN(value)) {
                    element.textContent = 'N/A';
                } else {
                    if (value > 0) element.classList.add('text-green-500');
                    else if (value < 0) element.classList.add('text-red-500');
                    else element.classList.add('text-gray-400');
                    element.textContent = `$${value.toFixed(2)}`;
                }
            } else if (['lcoverage', 'scoverage', 'lbalance', 'sbalance', 'ltprice', 'stprice', 'lsprice', 'sbprice'].includes(dataKey)) {
                element.textContent = isNaN(value) ? 'N/A' : value.toFixed(2);
            } else if (dataKey === 'lnorder' || dataKey === 'snorder' || dataKey === 'lcycle' || dataKey === 'scycle') {
                element.textContent = isNaN(value) ? 'N/A' : value.toFixed(0);
            } else {
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

export function displayMessage(message, type) {
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