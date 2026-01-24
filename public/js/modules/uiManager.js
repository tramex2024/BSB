/**
 * uiManager.js - Orquestador Atómico de Interfaz (Actualizado 2026)
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
import { displayMessage } from './ui/notifications.js';

let lastPrice = 0;

export function updateBotUI(state) {
    if (!state) return;

    // 1. Precio con detección de tendencia (BTC actual)
    const priceEl = document.getElementById('auprice');
    // Sincronizamos con 'price' que viene del WebSocket vía main.js
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // 2. Mapping de valores numéricos (SINCRONIZADO CON PURGE 2026)
    const elements = {
        auprofit: 'total_profit', 
        aulbalance: 'lbalance', 
        ausbalance: 'sbalance',
        
        // 🎯 TARGETS: Precios objetivo de venta/compra
        aultprice: 'ltprice',  
        austprice: 'stprice',  
        
        // 📈 PROMEDIOS Y TRAILING:
        aultppc: 'lppc',       
        austppc: 'sppc',       
        aulsprice: 'lsprice',  
        ausbprice: 'sbprice',  
        
        // 🔄 CICLOS Y COBERTURAS:
        aulcycle: 'lcycle', 
        auscycle: 'scycle',
        aulcoverage: 'lcoverage', 
        auscoverage: 'scoverage',
        
        // 💰 PROFITS INDIVIDUALES:
        'aulprofit-val': 'lprofit', 
        'ausprofit-val': 'sprofit',
        
        // 📊 ÓRDENES Y BALANCES REALES:
        aulnorder: 'lnorder', 
        ausnorder: 'snorder',
        'aubalance-usdt': 'lastAvailableUSDT', 
        'aubalance-btc': 'lastAvailableBTC'
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        let val = state[key];
        
        // Búsqueda de seguridad si el valor viene en un objeto anidado por error
        if (val === undefined || val === null) {
            val = state.stats?.[key] || 0;
        }

        // --- Lógica de Formateo Inteligente ---
       if (id.includes('profit')) {
    formatProfit(el, val);
} else if (id.includes('btc') || id.includes('sac') || id.includes('lac')) {
    // ₿ Solo lo que es cantidad de monedas (BTC) lleva 8 decimales
    formatValue(el, val, true, false);
} else if (id.match(/norder|cycle/)) {
    // # Números enteros
    formatValue(el, val, false, true);
} else {
    // 💵 TODO LO DEMÁS (incluyendo lbalance y sbalance) a 2 decimales
    formatValue(el, val, false, false);
}
    });

    // 3. Sincronización de Controles y Configuración
    if (state.config) syncInputsFromConfig(state.config);
    updateControlsState(state);
}

/**
 * Sincroniza estados de ejecución con la interfaz
 */
export function updateControlsState(state) {
    if (!state) return;
    
    const lState = state.lstate || 'STOPPED';
    const sState = state.sstate || 'STOPPED';
    const aiState = state.aistate || 'STOPPED';

    // IDs de los inputs que se bloquean cuando el bot está RUNNING
    const longInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'aupricestep-l', 'autriggerl'];
    const shortInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'aupricestep-s', 'autriggers'];

    updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    updateButtonState('austartai-btn', aiState, 'AI', ['auamountai-usdt']);
    
    // Actualización de badges de estado visual (si existen)
    updateStatusBadge('lstate-badge', lState);
    updateStatusBadge('sstate-badge', sState);
}

function updateStatusBadge(id, status) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = status;
    el.className = `badge ${status === 'RUNNING' ? 'bg-emerald-500' : 'bg-slate-500'}`;
}

export { displayMessage };