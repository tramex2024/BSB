/**
 * uiManager.js - Orquestador Atómico de Interfaz (Actualizado 2026)
 */
import { formatCurrency, formatValue, formatProfit } from './ui/formatters.js';
import { updateButtonState, syncInputsFromConfig } from './ui/controls.js';
import { displayMessage } from './ui/notifications.js';
import { isSavingConfig } from './apiService.js';

let lastPrice = 0;

export function updateBotUI(state) {
    // 1. 🛡️ FILTRO CRÍTICO: Bloqueo por guardado o estado nulo
    if (!state || isSavingConfig) {
        // console.log("⏳ UI Bloqueada: Sincronizando o Guardando...");
        return;
    }
   
    if (state.config) {
        console.log("📦 Config recibida de DB:", state.config.long.amountUsdt);
    }

    // 2. Precio con detección de tendencia
    const priceEl = document.getElementById('auprice');
    const currentMarketPrice = state.price || state.marketPrice || lastPrice;
    
    if (priceEl && currentMarketPrice) {
        lastPrice = formatCurrency(priceEl, currentMarketPrice, lastPrice);
    }

    // 3. Mapping de valores numéricos
    const elements = {
        auprofit: 'total_profit', 
        aulbalance: 'lbalance', 
        ausbalance: 'sbalance',
        aultprice: 'ltprice',  
        austprice: 'stprice',  
        aultppc: 'lppc',       
        austppc: 'sppc',       
        aulsprice: 'lpc',  
        ausbprice: 'spc',  
        aulcycle: 'lcycle', 
        auscycle: 'scycle',
        aulcoverage: 'lcoverage', 
        auscoverage: 'scoverage',
        'aulprofit-val': 'lprofit', 
        'ausprofit-val': 'sprofit',
        aulnorder: 'lnorder', 
        ausnorder: 'snorder',
        'aubalance-usdt': 'lastAvailableUSDT', 
        'aubalance-btc': 'lastAvailableBTC'
    };

    Object.entries(elements).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        let val = state[key];
        
        // Búsqueda de seguridad en stats si es necesario
        if (val === undefined || val === null) {
            val = state.stats?.[key] || 0;
        }

        // --- Lógica de Formateo ---
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

    // 4. 🛡️ SINCRONIZACIÓN SEGURA DE INPUTS
    // Validamos que la config sea real y tenga contenido antes de pisar los inputs
    if (state.config && state.config.long && Object.keys(state.config.long).length > 2) { 
        syncInputsFromConfig(state.config); 
    }

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

    // Lógica de botones y bloqueo
    updateButtonState('austartl-btn', lState, 'LONG', longInputs);
    updateButtonState('austarts-btn', sState, 'SHORT', shortInputs);
    updateButtonState('austartai-btn', aiState, 'AI', ['auamountai-usdt']);
    
    // Refuerzo visual de etiquetas
    updateStatusBadge('lstate-badge', lState);
    updateStatusBadge('sstate-badge', sState);
}

function updateStatusBadge(id, status) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = status;
    
    // Clases dinámicas según el estado
    const isActive = ['RUNNING', 'BUYING', 'SELLING', 'WAITING'].includes(status);
    el.className = `badge ${isActive ? 'bg-emerald-500' : 'bg-slate-500'} text-white px-2 py-1 rounded`;
}

export { displayMessage };