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
export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Solo inicializar si no existe, o forzar la limpieza si cambias de símbolo
    if (window.tvWidget) {
        // Si el símbolo es el mismo, no hagas nada; si cambió, remuévelo
        if (window.tvWidget.options.symbol === `BITMART:${symbol}`) return;
        window.tvWidget.remove();
    }

    const savedInterval = localStorage.getItem('tv_preferred_interval') || '1';

    window.tvWidget = new TradingView.widget({
        "container_id": containerId,
        "symbol": `BITMART:${symbol}`,
        "interval": savedInterval,
        "autosize": true,
        "width": "100%",  // Forzamos el ancho
        "height": "100%", // Forzamos el alto
        "theme": "dark",
        "style": "1",
        "timezone": "Etc/UTC",
        "locale": "es",
        "enable_publishing": false,
        "allow_symbol_change": true, // Permite que el usuario cambie el par
        "save_image": false,
        "studies": [
            "RSI@tv-basicstudies",
            "BB@tv-basicstudies",
            "MACD@tv-basicstudies"
        ],
        // Asegura que los datos sean en tiempo real
        "datafeed_provider": "BITMART", 
        "loading_screen": { "backgroundColor": "#111827" }
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