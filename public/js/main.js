// public/js/main.js

const socket = io(); // Connect to the Socket.IO server

// --- Global Variables for API Credentials and User ID ---
let currentUserId = '';
let currentApiCredentials = {
    apiKey: '',
    apiSecret: '',
    memo: ''
};

// --- DOM Elements Cache (UPDATED) ---
const elements = {
    // API Config
    userIdInput: document.getElementById('userIdInput'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    apiSecretInput: document.getElementById('apiSecretInput'),
    memoInput: document.getElementById('memoInput'),
    saveApiConfigBtn: document.getElementById('saveApiConfig'),
    apiStatusMsg: document.getElementById('apiStatus'),

    // Autobot
    autobotPurchaseAmount: document.getElementById('autobotPurchaseAmount'),
    autobotIncrementPercentage: document.getElementById('autobotIncrementPercentage'),
    autobotDecrementPercentage: document.getElementById('autobotDecrementPercentage'),
    autobotTriggerPercentage: document.getElementById('autobotTriggerPercentage'),
    autobotStopOnCycleEnd: document.getElementById('autobotStopOnCycleEnd'),
    startAutobotBtn: document.getElementById('startAutobot'),
    stopAutobotBtn: document.getElementById('stopAutobot'),
    autobotState: document.getElementById('autobotState'),
    autobotCycle: document.getElementById('autobotCycle'),
    autobotProfit: document.getElementById('autobotProfit'),
    autobotCycleProfit: document.getElementById('autobotCycleProfit'),
    autobotCurrentPrice: document.getElementById('autobotCurrentPrice'),
    autobotPPC: document.getElementById('autobotPPC'),
    autobotCP: document.getElementById('autobotCP'),
    autobotAC: document.getElementById('autobotAC'),
    autobotNextCoverageAmount: document.getElementById('autobotNextCoverageAmount'),
    autobotNextCoveragePrice: document.getElementById('autobotNextCoveragePrice'),
    autobotLogs: document.getElementById('autobotLogs'),

    // AIBot
    aibotInitialBuyAmount: document.getElementById('aibotInitialBuyAmount'),
    aibotRiskPerTrade: document.getElementById('aibotRiskPerTrade'),
    aibotMaxDCAOrders: document.getElementById('aibotMaxDCAOrders'),
    aibotDCAPriceDropPercentage: document.getElementById('aibotDCAPriceDropPercentage'),
    aibotTakeProfitPercentage: document.getElementById('aibotTakeProfitPercentage'),
    aibotTrailingStopLossPercentage: document.getElementById('aibotTrailingStopLossPercentage'),
    aibotTrailingTakeProfitPercentage: document.getElementById('aibotTrailingTakeProfitPercentage'),
    startAIBotBtn: document.getElementById('startAIBot'),
    stopAIBotBtn: document.getElementById('stopAIBot'),
    aibotState: document.getElementById('aibotState'),
    aibotDaysRemaining: document.getElementById('aibotDaysRemaining'),
    aibotCycle: document.getElementById('aibotCycle'),
    aibotProfit: document.getElementById('aibotProfit'),
    aibotCycleProfit: document.getElementById('aibotCycleProfit'),
    aibotCurrentPrice: document.getElementById('aibotCurrentPrice'),
    aibotPPC: document.getElementById('aibotPPC'),
    aibotCP: document.getElementById('aibotCP'),
    aibotAC: document.getElementById('aibotAC'),
    aibotPositionActive: document.getElementById('aibotPositionActive'),
    aibotLogs: document.getElementById('aibotLogs'),

    // AIBot License (UPDATED)
    requestLicenseExtensionBtn: document.getElementById('requestLicenseExtension'),
    activateTestLicenseBtn: document.getElementById('activateTestLicense'), // NEW TEST BUTTON
    licenseStatusMsg: document.getElementById('licenseStatus'),

    // AIBot Chart
    aibotChartCanvas: document.getElementById('aibotChart'),

    // Payment Modal (NEW)
    paymentModal: document.getElementById('paymentModal'),
    modalBtcAddress: document.getElementById('modalBtcAddress'),
    modalUsdtAddress: document.getElementById('modalUsdtAddress'),
    paymentCurrency: document.getElementById('paymentCurrency'),
    paymentNetwork: document.getElementById('paymentNetwork'),
    paymentAmount: document.getElementById('paymentAmount'),
    paymentTransactionId: document.getElementById('paymentTransactionId'),
    paymentSourceWallet: document.getElementById('paymentSourceWallet'),
    confirmPaymentBtn: document.getElementById('confirmPayment'),
    paymentStatusMessage: document.getElementById('paymentStatusMessage'),
    closeModalButtons: document.querySelectorAll('.close-button') // Already existed, but good to re-check
};

// --- Chart.js Instance for AIBot ---
// ... (aibotPriceChart, aibotChartData, initializeChart, addTradeToChart, updateChartCurrentPrice remain the same)
let aibotPriceChart;
const aibotChartData = {
    labels: [], // Timestamps
    datasets: [{
        label: 'Precio BTC/USDT',
        data: [],
        borderColor: '#00bcd4',
        borderWidth: 2,
        fill: false,
        pointRadius: 0 // Hide points
    }, {
        label: 'Entradas',
        data: [],
        backgroundColor: '#28a745', // Green for buys
        borderColor: '#28a745',
        pointRadius: 6,
        pointStyle: 'triangle',
        pointRotation: 0, // Upward triangle
        type: 'scatter'
    }, {
        label: 'Salidas',
        data: [],
        backgroundColor: '#dc3545', // Red for sells
        borderColor: '#dc3545',
        pointRadius: 6,
        pointStyle: 'triangle',
        pointRotation: 180, // Downward triangle
        type: 'scatter'
    }]
};

function initializeChart() {
    if (aibotPriceChart) {
        aibotPriceChart.destroy(); // Destroy previous instance if it exists
    }
    const ctx = elements.aibotChartCanvas.getContext('2d');
    aibotPriceChart = new Chart(ctx, {
        type: 'line',
        data: aibotChartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0 // Disable animation for real-time updates
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        tooltipFormat: 'HH:mm:ss',
                        displayFormats: {
                            minute: 'HH:mm'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Tiempo',
                        color: '#e0e0e0'
                    },
                    grid: {
                        color: '#444'
                    },
                    ticks: {
                        color: '#e0e0e0'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Precio (USDT)',
                        color: '#e0e0e0'
                    },
                    grid: {
                        color: '#444'
                    },
                    ticks: {
                        color: '#e0e0e0'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e0e0e0'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USDT' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function addTradeToChart(price, type, timestamp) {
    const time = new Date(timestamp);
    const dataPoint = { x: time, y: price };

    const datasetIndex = (type === 'buy') ? 1 : 2;

    aibotChartData.datasets[datasetIndex].data.push(dataPoint);

    // Add to price line as well to ensure it's visible on chart
    aibotChartData.datasets[0].data.push({ x: time, y: price });
    aibotChartData.labels.push(time); // Add time to labels for x-axis sorting

    // Sort both price data and labels by time
    aibotChartData.datasets[0].data.sort((a, b) => a.x.getTime() - b.x.getTime());
    aibotChartData.labels.sort((a, b) => a.getTime() - b.getTime());


    // Limit chart data to a reasonable number of points (e.g., last 100)
    const MAX_CHART_POINTS = 100;
    if (aibotChartData.labels.length > MAX_CHART_POINTS) {
        const earliestTime = aibotChartData.labels[aibotChartData.labels.length - MAX_CHART_POINTS].getTime();

        aibotChartData.labels = aibotChartData.labels.filter(label => label.getTime() >= earliestTime);
        aibotChartData.datasets[0].data = aibotChartData.datasets[0].data.filter(dataPoint => dataPoint.x.getTime() >= earliestTime);
        aibotChartData.datasets[1].data = aibotChartData.datasets[1].data.filter(dataPoint => dataPoint.x.getTime() >= earliestTime);
        aibotChartData.datasets[2].data = aibotChartData.datasets[2].data.filter(dataPoint => dataPoint.x.getTime() >= earliestTime);
    }

    aibotPriceChart.update();
}

function updateChartCurrentPrice(price) {
    const now = new Date();
    // Remove previous "current price" point if it's not a trade or a specific event
    if (aibotChartData.datasets[0].data.length > 0) {
        const lastDataPoint = aibotChartData.datasets[0].data[aibotChartData.datasets[0].data.length - 1];
        // Check if the last point is associated with a trade
        const isTradePoint = aibotChartData.datasets[1].data.some(d => d.x.getTime() === lastDataPoint.x.getTime()) ||
                             aibotChartData.datasets[2].data.some(d => d.x.getTime() === lastDataPoint.x.getTime());
        if (!isTradePoint) {
            aibotChartData.datasets[0].data.pop(); // Remove the last regular price point
            aibotChartData.labels.pop(); // Remove its corresponding label
        }
    }

    aibotChartData.labels.push(now);
    aibotChartData.datasets[0].data.push({ x: now, y: price });

    // Limit chart data (same logic as addTradeToChart)
    const MAX_CHART_POINTS = 100;
    if (aibotChartData.labels.length > MAX_CHART_POINTS) {
        const earliestTime = aibotChartData.labels[aibotChartData.labels.length - MAX_CHART_POINTS].getTime();

        aibotChartData.labels = aibotChartData.labels.filter(label => label.getTime() >= earliestTime);
        aibotChartData.datasets[0].data = aibotChartData.datasets[0].data.filter(dataPoint => dataPoint.x.getTime() >= earliestTime);
        aibotChartData.datasets[1].data = aibotChartData.datasets[1].data.filter(dataPoint => dataPoint.x.getTime() >= earliestTime);
        aibotChartData.datasets[2].data = aibotChartData.datasets[2].data.filter(dataPoint => dataPoint.x.getTime() >= earliestTime);
    }
    aibotPriceChart.update();
}


// --- Helper Functions ---
// ... (showStatusMessage, appendLog, updateBotUI - remain the same, just adjust calls to updateBotUI)

function showStatusMessage(element, message, isSuccess) {
    element.textContent = message;
    element.className = 'status-message ' + (isSuccess ? 'success' : 'error');
    setTimeout(() => {
        element.textContent = '';
        element.className = 'status-message';
    }, 5000);
}

function appendLog(logElement, message, isError = false) {
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (isError) {
        p.classList.add('error');
    }
    logElement.appendChild(p);
    logElement.scrollTop = logElement.scrollHeight; // Auto-scroll to bottom
}

function updateBotUI(botType, state) {
    const prefix = botType; // 'autobot' or 'aibot'

    elements[prefix + 'State'].textContent = state.state;
    elements[prefix + 'State'].className = `status-text ${state.state}`;

    elements[prefix + 'Cycle'].textContent = state.cycle;
    elements[prefix + 'Profit'].textContent = state.profit.toFixed(2);
    elements[prefix + 'CycleProfit'].textContent = state.cycleProfit.toFixed(2);
    elements[prefix + 'CurrentPrice'].textContent = state.currentPrice.toFixed(2);
    elements[prefix + 'PPC'].textContent = state.ppc.toFixed(2);
    elements[prefix + 'CP'].textContent = state.cp.toFixed(2);
    elements[prefix + 'AC'].textContent = state.ac ? state.ac.toFixed(8) : '0.00000000';

    if (botType === 'autobot') {
        elements.autobotNextCoverageAmount.textContent = state.nextCoverageUSDTAmount ? state.nextCoverageUSDTAmount.toFixed(2) : '0.00';
        elements.autobotNextCoveragePrice.textContent = state.nextCoverageTargetPrice ? state.nextCoverageTargetPrice.toFixed(2) : '0.00';
    } else if (botType === 'aibot') {
        elements.aibotDaysRemaining.textContent = state.daysRemaining;
        elements.aibotPositionActive.textContent = state.positionActive ? 'Sí' : 'No';
        if (state.settings) {
            elements.aibotInitialBuyAmount.value = state.settings.initialBuyAmountUSDT;
            elements.aibotRiskPerTrade.value = state.settings.riskPerTradePercentage;
            elements.aibotMaxDCAOrders.value = state.settings.maxDCAOrders;
            elements.aibotDCAPriceDropPercentage.value = state.settings.dcaPriceDropPercentage;
            elements.aibotTakeProfitPercentage.value = state.settings.takeProfitPercentage;
            elements.aibotTrailingStopLossPercentage.value = state.settings.trailingStopLossPercentage;
            elements.aibotTrailingTakeProfitPercentage.value = state.settings.trailingTakeProfitPercentage;
        }
    }
}


// --- API Interaction Functions ---
// ... (fetchBotState, sendBotCommand - remain the same)

async function fetchBotState(botType) {
    const { userIdInput, apiKeyInput, apiSecretInput, memoInput } = elements;
    const userId = userIdInput.value;
    const apiKey = apiKeyInput.value;
    const apiSecret = apiSecretInput.value;
    const memo = memoInput.value;

    if (!userId || !apiKey || !apiSecret) {
        console.warn(`Cannot fetch ${botType} state: API credentials or User ID missing.`);
        return;
    }

    try {
        const response = await fetch(`/api/bot/${botType}/state`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': userId,
                'X-Api-Key': apiKey,
                'X-Api-Secret': apiSecret,
                'X-Api-Memo': memo
            }
        });
        const data = await response.json();
        if (data.success) {
            updateBotUI(botType, data.state);
        } else {
            console.error(`Error al obtener estado del ${botType}:`, data.message);
            appendLog(elements[`${botType}Logs`], `ERROR: ${data.message}`, true);
        }
    } catch (error) {
        console.error(`Fetch error para estado del ${botType}:`, error);
        appendLog(elements[`${botType}Logs`], `ERROR de conexión al obtener estado: ${error.message}`, true);
    }
}

async function sendBotCommand(botType, action) {
    const { userIdInput, apiKeyInput, apiSecretInput, memoInput } = elements;
    const userId = userIdInput.value;
    const apiKey = apiKeyInput.value;
    const apiSecret = apiSecretInput.value;
    const memo = memoInput.value;

    if (!userId || !apiKey || !apiSecret) {
        showStatusMessage(elements.apiStatusMsg, 'Por favor, introduce tu User ID y API Credentials.', false);
        return;
    }

    let settings = {};
    if (action === 'start') {
        if (botType === 'autobot') {
            settings = {
                purchaseAmount: parseFloat(elements.autobotPurchaseAmount.value),
                incrementPercentage: parseFloat(elements.autobotIncrementPercentage.value),
                decrementPercentage: parseFloat(elements.autobotDecrementPercentage.value),
                triggerPercentage: parseFloat(elements.autobotTriggerPercentage.value),
                stopOnCycleEnd: elements.autobotStopOnCycleEnd.checked
            };
        } else if (botType === 'aibot') {
            settings = {
                initialBuyAmountUSDT: parseFloat(elements.aibotInitialBuyAmount.value),
                riskPerTradePercentage: parseFloat(elements.aibotRiskPerTrade.value),
                maxDCAOrders: parseInt(elements.aibotMaxDCAOrders.value),
                dcaPriceDropPercentage: parseFloat(elements.aibotDCAPriceDropPercentage.value),
                takeProfitPercentage: parseFloat(elements.aibotTakeProfitPercentage.value),
                trailingStopLossPercentage: parseFloat(elements.aibotTrailingStopLossPercentage.value),
                trailingTakeProfitPercentage: parseFloat(elements.aibotTrailingTakeProfitPercentage.value)
            };
        }
    }

    try {
        const response = await fetch(`/api/bot/${botType}/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': userId,
                'X-Api-Key': apiKey,
                'X-Api-Secret': apiSecret,
                'X-Api-Memo': memo
            },
            body: JSON.stringify({ userId, apiKey, apiSecret, memo, settings })
        });
        const data = await response.json();
        if (data.success) {
            showStatusMessage(elements.apiStatusMsg, `${botType} ${action}ed successfully!`, true);
            updateBotUI(botType, data.state);
        } else {
            showStatusMessage(elements.apiStatusMsg, `Failed to ${action} ${botType}: ${data.message}`, false);
            appendLog(elements[`${botType}Logs`], `ERROR al ${action} ${botType}: ${data.message}`, true);
            if (botType === 'aibot' && data.message.includes('License expired')) {
                openModal('paymentModal'); // Open the NEW payment modal
            }
        }
    } catch (error) {
        console.error(`Fetch error para ${action} ${botType}:`, error);
        showStatusMessage(elements.apiStatusMsg, `Connection error during ${action} ${botType}.`, false);
    }
}

// UPDATED: sendLicenseExtensionRequest
async function sendLicenseExtensionRequest() {
    const { userIdInput, apiKeyInput, apiSecretInput, memoInput } = elements;
    const userId = userIdInput.value;
    const apiKey = apiKeyInput.value;
    const apiSecret = apiSecretInput.value;
    const memo = memoInput.value;

    const amount = parseFloat(elements.paymentAmount.value);
    const transactionId = elements.paymentTransactionId.value;
    const sourceWallet = elements.paymentSourceWallet.value;
    const currency = elements.paymentCurrency.value;
    const network = elements.paymentNetwork.value;

    if (!userId || !apiKey || !apiSecret) {
        showStatusMessage(elements.paymentStatusMessage, 'Por favor, configura tus credenciales API primero.', false);
        return;
    }
    if (!amount || amount <= 0 || !transactionId || !sourceWallet || !currency || !network) {
        showStatusMessage(elements.paymentStatusMessage, 'Por favor, rellena todos los campos de pago.', false);
        return;
    }

    try {
        const response = await fetch('/api/aibot/license/extend', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': userId,
                'X-Api-Key': apiKey,
                'X-Api-Secret': apiSecret,
                'X-Api-Memo': memo
            },
            body: JSON.stringify({ userId, apiKey, apiSecret, memo, amount, transactionId, sourceWallet, currency, network })
        });
        const data = await response.json();
        if (data.success) {
            showStatusMessage(elements.paymentStatusMessage, `Licencia extendida. Días restantes: ${data.daysRemaining}`, true);
            closeModal('paymentModal');
            await fetchBotState('aibot'); // Re-fetch AIBot state to update UI
        } else {
            showStatusMessage(elements.paymentStatusMessage, `Error al extender licencia: ${data.message}`, false);
        }
    } catch (error) {
        console.error('Error extendiendo licencia:', error);
        showStatusMessage(elements.paymentStatusMessage, 'Error de conexión al extender licencia.', false);
    }
}

// NEW: sendTestLicenseActivationRequest
async function sendTestLicenseActivationRequest() {
    const { userIdInput, apiKeyInput, apiSecretInput, memoInput } = elements;
    const userId = userIdInput.value;
    const apiKey = apiKeyInput.value;
    const apiSecret = apiSecretInput.value;
    const memo = memoInput.value;

    if (!userId || !apiKey || !apiSecret) {
        showStatusMessage(elements.licenseStatusMsg, 'Por favor, configura tus credenciales API primero.', false);
        return;
    }

    try {
        const response = await fetch('/api/aibot/license/activate-test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': userId,
                'X-Api-Key': apiKey,
                'X-Api-Secret': apiSecret,
                'X-Api-Memo': memo
            },
            body: JSON.stringify({ userId, apiKey, apiSecret, memo })
        });
        const data = await response.json();
        if (data.success) {
            showStatusMessage(elements.licenseStatusMsg, `Licencia de prueba activada.`, true);
            await fetchBotState('aibot');
        } else {
            showStatusMessage(elements.licenseStatusMsg, `Error al activar licencia de prueba: ${data.message}`, false);
        }
    } catch (error) {
        console.error('Error activando licencia de prueba:', error);
        showStatusMessage(elements.licenseStatusMsg, 'Error de conexión al activar licencia de prueba.', false);
    }
}


// --- Event Listeners (UPDATED) ---
// ... (API Config, Autobot, AIBot control buttons remain the same)

elements.saveApiConfigBtn.addEventListener('click', () => {
    currentUserId = elements.userIdInput.value;
    currentApiCredentials = {
        apiKey: elements.apiKeyInput.value,
        apiSecret: elements.apiSecretInput.value,
        memo: elements.memoInput.value
    };
    localStorage.setItem('userId', currentUserId);
    localStorage.setItem('apiKey', currentApiCredentials.apiKey);
    localStorage.setItem('apiSecret', currentApiCredentials.apiSecret);
    localStorage.setItem('memo', currentApiCredentials.memo);
    showStatusMessage(elements.apiStatusMsg, 'Credenciales API guardadas localmente.', true);

    socket.emit('join', { userId: currentUserId });
    fetchBotState('autobot');
    fetchBotState('aibot');
});

elements.startAutobotBtn.addEventListener('click', () => sendBotCommand('autobot', 'start'));
elements.stopAutobotBtn.addEventListener('click', () => sendBotCommand('autobot', 'stop'));

elements.startAIBotBtn.addEventListener('click', () => sendBotCommand('aibot', 'start'));
elements.stopAIBotBtn.addEventListener('click', () => sendBotCommand('aibot', 'stop'));

// UPDATED: Listener for "Solicitar Extensión de Licencia" button
elements.requestLicenseExtensionBtn.addEventListener('click', () => {
    // Open the new payment modal
    openModal('paymentModal');
});

// Listener for the "Confirmar Envío" button inside the payment modal
elements.confirmPaymentBtn.addEventListener('click', sendLicenseExtensionRequest);

// NEW: Listener for the test license activation button
elements.activateTestLicenseBtn.addEventListener('click', sendTestLicenseActivationRequest);

// Modal Close Buttons
elements.closeModalButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        if (modal) closeModal(modal.id);
    });
});

// Click outside modal to close
window.onclick = function(event) {
    if (event.target == elements.paymentModal) {
        closeModal('paymentModal');
    }
}

// Adjust payment network options based on selected currency
elements.paymentCurrency.addEventListener('change', () => {
    const currency = elements.paymentCurrency.value;
    const networkSelect = elements.paymentNetwork;
    networkSelect.innerHTML = ''; // Clear existing options

    if (currency === 'USDT') {
        // Add common USDT networks. BitMart supports multiple, TRC20 is very common for low fees.
        const trc20Option = document.createElement('option');
        trc20Option.value = 'TRC20';
        trc20Option.textContent = 'TRC20 (Recomendado)';
        networkSelect.appendChild(trc20Option);

        const erc20Option = document.createElement('option');
        erc20Option.value = 'ERC20';
        erc20Option.textContent = 'ERC20';
        networkSelect.appendChild(erc20Option);

        // Add other USDT networks if BitMart supports them and you want to offer them
    } else if (currency === 'BTC') {
        const bitcoinOption = document.createElement('option');
        bitcoinOption.value = 'Bitcoin';
        bitcoinOption.textContent = 'Bitcoin Network';
        networkSelect.appendChild(bitcoinOption);
    }
    // Set default values for modal addresses based on initial selection
    updatePaymentModalAddresses();
});

// Function to update modal addresses based on selected currency/network
function updatePaymentModalAddresses() {
    const currency = elements.paymentCurrency.value;
    const network = elements.paymentNetwork.value;

    // IMPORTANT: REPLACE THESE WITH YOUR ACTUAL BITMART DEPOSIT ADDRESSES
    // For demonstration, these are placeholders
    if (currency === 'BTC' && network === 'Bitcoin') {
        elements.modalBtcAddress.textContent = 'bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // Your actual BTC address
        elements.modalUsdtAddress.textContent = 'N/A'; // Not applicable for BTC
    } else if (currency === 'USDT' && network === 'TRC20') {
        elements.modalBtcAddress.textContent = 'N/A';
        elements.modalUsdtAddress.textContent = 'TRC20_WALLET_ADDRESS_EXAMPLE_TXXXXXXXXXXXXXXXXXXXXXX'; // Your actual USDT TRC20 address
    } else if (currency === 'USDT' && network === 'ERC20') {
        elements.modalBtcAddress.textContent = 'N/A';
        elements.modalUsdtAddress.textContent = '0x_YOUR_USDT_ERC20_ADDRESS_EXAMPLE_0xXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'; // Your actual USDT ERC20 address
    } else {
        elements.modalBtcAddress.textContent = 'N/A';
        elements.modalUsdtAddress.textContent = 'N/A';
    }
}

// Initial setup of payment network options and addresses
elements.paymentCurrency.dispatchEvent(new Event('change')); // Trigger change to populate networks initially


// --- Socket.IO Event Listeners ---
// ... (connect, disconnect, botStateUpdate, autobotLog, aibotLog, botError, aibotCurrentPrice, aibotTrade - all remain the same)

// --- Tab Switching Logic ---
// ... (openTab - remains the same)

// --- Modal Functions (UPDATED) ---
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
    // Clear any previous status messages
    elements.paymentStatusMessage.textContent = '';
    elements.paymentStatusMessage.className = 'status-message';
    // Update addresses based on initial currency/network selection
    updatePaymentModalAddresses();
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}


// --- Initialization on Page Load ---
document.addEventListener('DOMContentLoaded', () => {
    // Load saved API config from localStorage
    elements.userIdInput.value = localStorage.getItem('userId') || 'user123';
    elements.apiKeyInput.value = localStorage.getItem('apiKey') || '';
    elements.apiSecretInput.value = localStorage.getItem('apiSecret') || '';
    elements.memoInput.value = localStorage.getItem('memo') || '';

    // Initialize the AIBot chart
    initializeChart();

    // Default to opening the Autobot tab
    document.querySelector('.tab-button').click();

    // If credentials are loaded, connect to Socket.IO and fetch initial states
    if (elements.userIdInput.value && elements.apiKeyInput.value && elements.apiSecretInput.value) {
        currentUserId = elements.userIdInput.value;
        currentApiCredentials = {
            apiKey: elements.apiKeyInput.value,
            apiSecret: elements.apiSecretInput.value,
            memo: elements.memoInput.value
        };
        socket.emit('join', { userId: currentUserId });
        fetchBotState('autobot');
        fetchBotState('aibot');
    }
});