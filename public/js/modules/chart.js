// public/js/modules/chart.js

let equityChartInstance = null;

/**
 * Gráfico de TradingView (Precios en vivo)
 */
export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    new TradingView.widget({
        "container_id": containerId,
        "autosize": true,
        "symbol": `BITMART:${symbol}`,
        "interval": "60",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "es",
        "toolbar_bg": "#111827",
        "enable_publishing": false,
        "withdateranges": true,
        "hide_side_toolbar": false,
        "allow_symbol_change": true,
        "support_host": "https://www.tradingview.com",
    });
}

/**
 * Gráfico de Curva de Capital (Chart.js)
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) {
        console.error("Canvas 'equityCurveChart' no encontrado.");
        return;
    }

    const ctx = canvas.getContext('2d');

    // Destruir instancia previa para evitar superposición de tooltips
    if (equityChartInstance) {
        equityChartInstance.destroy();
    }

    // 🛑 VALIDACIÓN Y NORMALIZACIÓN DE DATOS
    // Si no hay datos, mostramos un estado vacío
    if (!data || data.length === 0) {
        console.warn("No hay datos para graficar.");
        return;
    }

    const labels = data.map((_, i) => `Ciclo ${i + 1}`);
    let dataPoints = [];
    let labelText = '';
    let color = '#10b981'; // Verde por defecto

    // Mapeo dinámico según el parámetro seleccionado
    switch (parameter) {
        case 'durationHours':
            dataPoints = data.map(c => parseFloat(c.durationHours || 0));
            labelText = 'Duración (Horas)';
            color = '#f59e0b'; // Naranja
            break;
        case 'initialInvestment':
            dataPoints = data.map(c => parseFloat(c.initialInvestment || 0));
            labelText = 'Inversión Inicial (USDT)';
            color = '#3b82f6'; // Azul
            break;
        default:
            // Asegúrate de que el backend envíe 'accumulatedProfit' o ajusta el nombre aquí
            dataPoints = data.map(c => parseFloat(c.accumulatedProfit || c.netProfit || 0));
            labelText = 'Capital Acumulado (USDT)';
            color = '#10b981'; // Esmeralda
    }

    // Crear Gradiente para el fondo
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, color.replace(')', ', 0.4)').replace('rgb', 'rgba'));
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    equityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelText,
                data: dataPoints,
                borderColor: color,
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointHoverRadius: 6,
                tension: 0.4, // Curva suave
                fill: true,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }, // Ocultamos leyenda para un look más limpio
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#9ca3af',
                    bodyColor: '#fff',
                    borderColor: color,
                    borderWidth: 1,
                    displayColors: false,
                    callbacks: {
                        label: (context) => ` ${context.parsed.y.toLocaleString()} USDT`
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { size: 10 } }
                }
            }
        }
    });
}