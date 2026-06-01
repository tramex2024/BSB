/**
 * chart.js - Visualización de Rendimiento (Versión Completa + Auditoría)
 * Estado: Estable - Manejo de TradingView y Chart.js
 */

let equityChartInstance = null;
window.tvWidget = null;

/**
 * Gráfico de TradingView (Precios en vivo)
 * Configura el widget principal para ver el mercado en tiempo real.
 */
// Asegúrate de que esta lógica esté en tu export:
export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Limpieza total del contenedor antes de inyectar el nuevo widget
    container.innerHTML = ''; 

    const savedInterval = localStorage.getItem('tv_preferred_interval') || '1';

    window.tvWidget = new TradingView.widget({
        "container_id": containerId, // Esto inyecta el widget dentro del div
        "symbol": `BITMART:${symbol}`,
        "interval": savedInterval,
        "autosize": true,
        "theme": "dark",
        "style": "1",
        "timezone": "Etc/UTC",
        "locale": "es",
        "enable_publishing": false,
        "allow_symbol_change": true,
        "datafeed_provider": "BITMART",
        // FORZAR ALTURA DENTRO DEL WIDGET
        "width": "100%",
        "height": "100%",
        "loading_screen": { "backgroundColor": "#111827" }
    });

    window.tvWidget.onChartReady(() => {
        // Corrección de background post-carga
        window.tvWidget.applyOverrides({
            "paneProperties.background": "#111827"
        });
    });
}

/**
 * Gráfico de Curva de Capital (Chart.js)
 * Optimizada: Solo destruye si es estrictamente necesario.
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {       
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) return;

    // 1. PROCESAMIENTO DE DATOS (Mismo de antes)
    const rawPoints = Array.isArray(data) ? data : (data?.points || []);
    const labels = rawPoints.map((d, i) => d.time || `Punto ${i + 1}`);
    const dataPoints = rawPoints.map(p => parseFloat(parseFloat(p.value !== undefined ? p.value : (p.netProfit || 0)).toFixed(4)));

    // 2. LÓGICA DE ACTUALIZACIÓN INTELIGENTE
    if (equityChartInstance) {
        // Si ya existe, comparamos la longitud para ver si realmente necesitamos rehacerlo
        // Si solo han llegado nuevos datos, actualizamos el dataset sin destruir
        if (equityChartInstance.data.labels.length === labels.length) {
            equityChartInstance.data.datasets[0].data = dataPoints;
            equityChartInstance.update('none'); // 'none' evita la animación molesta al actualizar
            return; // Salimos, no destruimos
        } else {
            // Si la longitud cambió (ej. reinicio de ciclo), destruimos para regenerar
            equityChartInstance.destroy();
            equityChartInstance = null;
        }
    }

    // 3. SI NO EXISTE O FUE DESTRUIDO, CREAMOS NUEVA INSTANCIA
    const ctx = canvas.getContext('2d');
    const chartHeight = canvas.offsetHeight || 450;
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    gradient.addColorStop(0, '#10b98144');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    equityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Capital Acumulado (USDT)',
                data: dataPoints,
                borderColor: '#10b981',
                backgroundColor: gradient,
                borderWidth: 2,
                tension: 0.35,
                fill: true,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 }, // Desactivar animación inicial si prefieres fluidez total
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } },
                x: { grid: { display: false }, ticks: { color: '#9ca3af' } }
            }
        }
    });
}