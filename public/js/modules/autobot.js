import { BACKEND_URL, socket, logStatus } from '../main.js';
import { updateBotUI } from './uiManager.js';

export async function initializeAutobotView(state) {
    console.log("Iniciando Autobot View con estado:", state);
    setupEventListeners();
    if (state && state.config) {
        mapStateToInputs(state);
    }
}

// 1. Vincular los inputs del HTML con el objeto de la Base de Datos
function mapStateToInputs(state) {
    const cfg = state.config;
    if (!cfg) return;

    // Long Config
    document.getElementById('auamountl-usdt').value = cfg.long?.amountUsdt || 0;
    document.getElementById('aupurchasel-usdt').value = cfg.long?.purchaseUsdt || 0;
    document.getElementById('au-stop-long-at-cycle').checked = cfg.long?.stopAtCycle || false;

    // Short Config
    document.getElementById('auamounts-usdt').value = cfg.short?.amountUsdt || 0;
    document.getElementById('aupurchases-usdt').value = cfg.short?.purchaseUsdt || 0;
    document.getElementById('au-stop-short-at-cycle').checked = cfg.short?.stopAtCycle || false;

    // Variables compartidas (usamos los valores de Long por defecto o una lógica mixta)
    document.getElementById('auincrement').value = cfg.long?.size_var || 100;
    document.getElementById('audecrement').value = cfg.long?.price_var || 1.5;
    document.getElementById('autrigger').value = cfg.long?.profit_percent || 1.5;
}

// 2. Escuchar cambios y enviar al servidor
function setupEventListeners() {
    const inputs = [
        'auamountl-usdt', 'aupurchasel-usdt', 'au-stop-long-at-cycle',
        'auamounts-usdt', 'aupurchases-usdt', 'au-stop-short-at-cycle',
        'auincrement', 'audecrement', 'autrigger'
    ];

    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        // Detectar cambio (funciona para checkbox y para inputs al perder el foco)
        el.addEventListener('change', () => saveAutobotConfig());
    });

    // Botones de Start/Stop (Socket)
    document.getElementById('austartl-btn')?.addEventListener('click', () => {
        socket.emit('toggle-bot', { side: 'long' });
    });

    document.getElementById('austarts-btn')?.addEventListener('click', () => {
        socket.emit('toggle-bot', { side: 'short' });
    });
}

// 3. Función para enviar la configuración estructurada al Backend
async function saveAutobotConfig() {
    // Construimos el objeto respetando EXACTAMENTE tu modelo de Mongoose
    const config = {
        long: {
            amountUsdt: parseFloat(document.getElementById('auamountl-usdt').value),
            purchaseUsdt: parseFloat(document.getElementById('aupurchasel-usdt').value),
            stopAtCycle: document.getElementById('au-stop-long-at-cycle').checked,
            size_var: parseFloat(document.getElementById('auincrement').value),
            price_var: parseFloat(document.getElementById('audecrement').value),
            profit_percent: parseFloat(document.getElementById('autrigger').value)
        },
        short: {
            amountUsdt: parseFloat(document.getElementById('auamounts-usdt').value),
            purchaseUsdt: parseFloat(document.getElementById('aupurchases-usdt').value),
            stopAtCycle: document.getElementById('au-stop-short-at-cycle').checked,
            size_var: parseFloat(document.getElementById('auincrement').value),
            price_var: parseFloat(document.getElementById('audecrement').value),
            profit_percent: parseFloat(document.getElementById('autrigger').value)
        }
    };

    try {
        const response = await fetch(`${BACKEND_URL}/api/bot/config`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ config })
        });

        if (response.ok) {
            logStatus("💾 Configuración guardada", "success");
        } else {
            logStatus("❌ Error al guardar config", "error");
        }
    } catch (err) {
        console.error("Error saving config:", err);
        logStatus("❌ Error de red al guardar", "error");
    }
}