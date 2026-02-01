/**
 * uiManager.js - Orquestador Atómico de Interfaz (Actualizado 2026)
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
import { displayMessage } from './ui/notifications.js';
// 🛡️ IMPORTANTE: Importamos el estado de guardado para evitar el reseteo de inputs
import { isSavingConfig } from './apiService.js';

let lastPrice = 0;

export function updateBotUI(state) {
    // 1. 🛡️ FILTRO CRÍTICO: Si el sistema está guardando configuración, 
    // bloqueamos la actualización de la UI para evitar que el socket pise los inputs con datos viejos.
    if (!state || isSavingConfig) {
        console.log("⏳ Bloqueo de UI activo: Sincronizando configuración con el servidor...");
        return;
    }

    // 2. Precio con detección de tendencia (BTC actual)
    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // 3. Mapping de valores numéricos (OPTIMIZADO: lpc y spc)
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
        aulsprice: 'lpc',  // ✅ Variable real
        ausbprice: 'spc',  // ✅ Variable real
        
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
        
        // Búsqueda de seguridad si el valor viene en un objeto anidado
        if (val === undefined || val === null) {
            val = state.stats?.[key] || 0;
        }

        // ✨ Lógica de Pulso Visual para el Trailing Stop
        if (id === 'aulsprice' || id === 'ausbprice') {
            const oldVal = parseFloat(el.textContent.replace(/[^0-9.-]+/g,"")) || 0;
            const newVal = parseFloat(val);
            if (oldVal !== 0 && newVal !== oldVal) {
                el.classList.add('pulse-update');
                setTimeout(() => el.classList.remove('pulse-update'), 1000);
            }
        }

        // --- Lógica de Formateo Inteligente ---
        if (id.includes('profit')) {
            formatProfit(el, val);
        } else if (id.includes('btc') || id.includes('sac') || id.includes('lac')) {
            formatValue(el, val, true, false);
        } else if (id.match(/norder|cycle/)) {
            formatValue(el, val, false, true);
        } else {
            formatValue(el, val, false, false);
        }
    });

    // 4. Sincronización de Controles y Configuración
    // Esta función es la que movía los inputs a cero; ahora está protegida por el check inicial
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

    const longInputs = ['auamountl-usdt', 'aupurchasel-usdt', 'auincrementl', 'audecrementl', 'aupricestep-l', 'autriggerl'];
    const shortInputs = ['auamounts-usdt', 'aupurchases-usdt', 'auincrements', 'audecrements', 'aupricestep-s', 'autriggers'];

    // 1. Ejecutamos la lógica de botones y bloqueo de inputs por ejecución
    updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    updateButtonState('austartai-btn', aiState, 'AI', ['auamountai-usdt']);
    
    // 2. REFUERZO VISUAL (Estados Detenidos)
    const btnShort = document.getElementById('austarts-btn');
    if (btnShort && sState === 'STOPPED') {
        btnShort.textContent = `START SHORT`;
        btnShort.classList.remove('bg-red-600', 'bg-slate-600');
        btnShort.classList.add('bg-emerald-600'); 
    }

    const btnLong = document.getElementById('austartl-btn');
    if (btnLong && lState === 'STOPPED') {
        btnLong.textContent = `START LONG`;
        btnLong.classList.remove('bg-red-600', 'bg-slate-600');
        btnLong.classList.add('bg-emerald-600'); 
    }
    
    updateStatusBadge('lstate-badge', lState);
    updateStatusBadge('sstate-badge', sState);
}

function updateStatusBadge(id, status) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = status;
    el.className = `badge ${status === 'RUNNING' || status === 'BUYING' || status === 'SELLING' ? 'bg-emerald-500' : 'bg-slate-500'}`;
}

export { displayMessage };