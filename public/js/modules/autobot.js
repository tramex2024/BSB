import { initializeChart } from './chart.js';
import { fetchOrders } from './orders.js';
import { updateBotUI, displayMessage } from './uiManager.js';
import { sendConfigToBackend, toggleBotSideState } from './apiService.js'; // Importamos la nueva función por lado
import { TRADE_SYMBOL_TV, socket } from '../main.js';

const MIN_USDT_AMOUNT = 5.00;
let currentTab = 'opened';

function validateSideInputs(side) {
    const suffix = side === 'long' ? 'l' : 's';
    const fields = [`auamount${suffix}-usdt`, `aupurchase${suffix}-usdt`];
    let isValid = true;
    
    fields.forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        const val = parseFloat(input.value);
        if (isNaN(val) || val < MIN_USDT_AMOUNT) {
            input.classList.add('border-red-500');
            isValid = false;
        } else {
            input.classList.remove('border-red-500');
        }
    });
    return isValid;
}

function setupConfigListeners() {
    // IDs actualizados para el Motor Exponencial
    const configIds = [
        'auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l',
        'auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s',
        'auamountai-usdt', 'au-stop-long-at-cycle', 'au-stop-short-at-cycle', 'au-stop-ai-at-cycle'
    ];
    
    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
            if (el.type === 'number') {
                const val = parseFloat(el.value);
                el.classList.toggle('border-red-500', isNaN(val) || val < 0);
            }
            sendConfigToBackend(); // Guarda cambios en tiempo real
        });
    });
}

export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');
    setupConfigListeners();

    // Inicializar Gráfico
    setTimeout(() => {
        if (document.getElementById('au-tvchart')) {
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 400);

    // --- LÓGICA DE 3 BOTONES INDEPENDIENTES ---
    const setupSideBtn = (id, sideName) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        // Clonamos para limpiar listeners previos
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const isRunning = newBtn.textContent.includes('STOP');
            
            // Validar solo si vamos a encender
            if (!isRunning && sideName !== 'ai' && !validateSideInputs(sideName)) {
                displayMessage(`Mínimo $${MIN_USDT_AMOUNT} USDT para ${sideName.toUpperCase()}`, 'error');
                return;
            }

            try {
                // Llamamos a la API específicamente para este lado
                await toggleBotSideState(isRunning, sideName);
            } catch (err) {
                console.error(`❌ Error en ${sideName}:`, err);
            }
        });
    };

    // Inicializamos los 3 botones
    setupSideBtn('austartl-btn', 'long');
    setupSideBtn('austarts-btn', 'short');
    setupSideBtn('austartai-btn', 'ai');

    // --- GESTIÓN DE PESTAÑAS ---
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    const setActiveTabStyle = (selectedId) => {
        orderTabs.forEach(btn => {
            btn.classList.add('bg-gray-800/40', 'border', 'border-gray-700/50');
            if (btn.id === selectedId) {
                btn.classList.add('text-emerald-400', 'font-bold', 'border-emerald-500/30');
                btn.classList.remove('text-gray-500');
            } else {
                btn.classList.remove('text-emerald-400', 'font-bold', 'border-emerald-500/30');
                btn.classList.add('text-gray-500');
            }
        });
    };

    orderTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const selectedId = e.currentTarget.id;
            setActiveTabStyle(selectedId);
            currentTab = selectedId.replace('tab-', '');
            fetchOrders(currentTab, auOrderList);
        });
    });

    // Carga inicial de órdenes
    setActiveTabStyle('tab-opened');
    fetchOrders('opened', auOrderList);

    // Socket: Escuchar actualizaciones de estado
    if (socket) {
        socket.off('bot-state-update');
        socket.on('bot-state-update', (state) => {
            updateBotUI(state);
        });
    }
}