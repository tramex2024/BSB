// public/js/modules/dashboard.js

import { getBalances } from './balance.js';
import { checkBitMartConnectionAndData } from './network.js';
// 💡 MODIFICACIÓN: Importar fetchCycleKpis junto a fetchEquityCurveData
import { fetchEquityCurveData, fetchCycleKpis } from './apiService.js'; 
import { renderEquityCurve } from './chart.js';
import { intervals } from '../main.js';

export function initializeDashboardView() {
    console.log("Inicializando vista del Dashboard...");
    
    // 1. Cargar datos básicos
    getBalances();
    checkBitMartConnectionAndData();
    intervals.dashboard = setInterval(getBalances, 10000);

    // 2. Cargar y renderizar la Curva de Crecimiento
    loadAndRenderEquityCurve();

    // 3. Cargar y mostrar los KPIs
    loadAndDisplayKpis(); // 💡 Llamada a la función que ahora puede usar fetchCycleKpis
}

/**
 * Carga y muestra los KPIs del ciclo en las tarjetas del dashboard.
 */
async function loadAndDisplayKpis() {
    // Aquí es donde se llama a la función importada
    const kpis = await fetchCycleKpis();
    
    // Los IDs ya se adaptaron en el HTML previamente:
    const profitPercentageElement = document.getElementById('cycle-avg-profit'); 
    const totalCyclesElement = document.getElementById('total-cycles-closed'); 

    if (profitPercentageElement) {
        // Muestra el rendimiento promedio redondeado con el símbolo %
        // Se asume que kpis.averageProfitPercentage es un número (ej. 0.85)
        profitPercentageElement.textContent = `${kpis.averageProfitPercentage.toFixed(2)} %`;
    }
    
    if (totalCyclesElement) {
        // Muestra el número total de ciclos
        totalCyclesElement.textContent = kpis.totalCycles;
    }

    console.log(`KPIs de ciclos cargados. Rendimiento promedio: ${kpis.averageProfitPercentage}%.`);
}

/**
 * Orquesta la obtención y el renderizado de la Curva de Crecimiento.
 */
async function loadAndRenderEquityCurve() {
    try {
        const curveData = await fetchEquityCurveData();
        
        if (curveData.length > 0) {
            // Aseguramos que los datos de la curva existen
            if (typeof renderEquityCurve === 'function') {
                renderEquityCurve(curveData); 
                console.log('Curva de Crecimiento renderizada.');
            } else {
                console.error("La función renderEquityCurve no está definida en chart.js o no fue importada correctamente.");
            }
        } else {
            console.warn('No hay datos suficientes de ciclos cerrados para renderizar la Curva de Crecimiento.');
            // Aquí puedes mostrar un mensaje en el canvas o gráfico.
        }
    } catch (error) {
        console.error("Error en la carga y renderizado de la curva:", error);
    }
}