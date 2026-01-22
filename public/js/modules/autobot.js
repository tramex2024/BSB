import { initializeChart } from './chart.js';
import { fetchOrders } from './orders.js';
import { updateBotUI, displayMessage } from './uiManager.js';
import { sendConfigToBackend, toggleBotSideState } from './apiService.js'; 
import { TRADE_SYMBOL_TV, socket } from '../main.js';

const MIN_USDT_AMOUNT = 5.00;
let currentTab = 'opened';
let configDebounceTimeout = null;

/**
 * Valida los inputs de una estrategia (Long o Short)
 */
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

/**
 * Escucha cambios en los inputs y guarda en el backend con Debounce
 */
function setupConfigListeners() {
    const configIds = [
        'auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'autriggerl', 'aupricestep-l',
        'auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'autriggers', 'aupricestep-s',
        'auamountai-usdt', 'au-stop-long-at-cycle', 'au-stop-short-at-cycle', 'au-stop-ai-at-cycle'
    ];
    
    configIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        const eventType = el.type === 'checkbox' ? 'change' : 'input';
        
        el.addEventListener(eventType, () => {
            if (el.type === 'number') {
                const val = parseFloat(el.value);
                el.classList.toggle('border-red-500', isNaN(val) || val < 0);
            }

            // --- LÓGICA DE DEBOUNCE PARA NO SATURAR EL BACKEND ---
            if (configDebounceTimeout) clearTimeout(configDebounceTimeout);
            
            configDebounceTimeout = setTimeout(async () => {
                try {
                    await sendConfigToBackend();
                    console.log("✅ Configuración guardada automáticamente");
                } catch (err) {
                    console.error("❌ Error guardando config:", err);
                }
            }, 500); // Espera 500ms después de la última pulsación
        });
    });
}

export async function initializeAutobotView() {
    const auOrderList = document.getElementById('au-order-list');
    
    // Limpiar timeouts previos si existen al cambiar de pestaña
    if (configDebounceTimeout) clearTimeout(configDebounceTimeout);

    setupConfigListeners();

    // Inicializar Gráfico con delay para asegurar que el DOM esté listo
    setTimeout(() => {
        const chartContainer = document.getElementById('au-tvchart');
        if (chartContainer) {
            if (window.currentChart) {
                try { window.currentChart.remove(); } catch(e) {}
            }
            window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);
        }
    }, 500);

    // --- LÓGICA DE BOTONES INDEPENDIENTES (Evitando duplicación de eventos) ---
    const setupSideBtn = (id, sideName) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        // Limpiar listener clonando el nodo
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const isRunning = newBtn.textContent.includes('STOP');
            
            if (!isRunning && sideName !== 'ai' && !validateSideInputs(sideName)) {
                displayMessage(`Mínimo $${MIN_USDT_AMOUNT} USDT para ${sideName.toUpperCase()}`, 'error');
                return;
            }

            try {
                // Deshabilitar temporalmente para evitar doble click
                newBtn.disabled = true;
                newBtn.style.opacity = "0.5";
                
                await toggleBotSideState(isRunning, sideName);
                
                displayMessage(`${sideName.toUpperCase()} ${isRunning ? 'detenido' : 'iniciado'}`, 'success');
            } catch (err) {
                displayMessage(`Error al cambiar estado de ${sideName}`, 'error');
                console.error(`❌ Error en ${sideName}:`, err);
            } finally {
                newBtn.disabled = false;
                newBtn.style.opacity = "1";
            }
        });
    };

    setupSideBtn('austartl-btn', 'long');
    setupSideBtn('austarts-btn', 'short');
    setupSideBtn('austartai-btn', 'ai');

    // --- GESTIÓN DE PESTAÑAS DE ÓRDENES ---
    const orderTabs = document.querySelectorAll('.autobot-tabs button');
    
    const setActiveTabStyle = (selectedId) => {
        orderTabs.forEach(btn => {
            btn.classList.remove('text-emerald-400', 'font-bold', 'border-emerald-500/30');
            btn.classList.add('bg-gray-800/40', 'border', 'border-gray-700/50', 'text-gray-500');
            
            if (btn.id === selectedId) {
                btn.classList.add('text-emerald-400', 'font-bold', 'border-emerald-500/30');
                btn.classList.remove('text-gray-500');
            }
        });
    };

    orderTabs.forEach(tab => {
        tab.onclick = (e) => { // Usamos onclick para evitar acumular listeners
            const selectedId = e.currentTarget.id;
            setActiveTabStyle(selectedId);
            currentTab = selectedId.replace('tab-', '');
            fetchOrders(currentTab, auOrderList);
        };
    });

    // Carga inicial
    setActiveTabStyle('tab-opened');
    fetchOrders('opened', auOrderList);

    // Socket: Escuchar estado
    if (socket) {
        socket.off('bot-state-update');
        socket.on('bot-state-update', (state) => {
            updateBotUI(state);
        });
    }
}