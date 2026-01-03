// public/js/modules/chart.js

let equityChartInstance = null;

/**
 * Gráfico de TradingView (Precios en vivo)
 * Configurado para llenar el panel correctamente.
 */
export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 1. Limpiamos el contenedor por si había un gráfico previo
    container.innerHTML = '';

    // 2. FORZAR ALTURA: Sin esto, el gráfico a veces sale de 0 píxeles de alto.
    // Puedes cambiar "500px" por "100%" si el contenedor padre ya tiene una altura fija.
    container.style.height = "500px"; 
    container.style.width = "100%";

    // 3. Crear el widget de TradingView
    new TradingView.widget({
        "autosize": true, // Esto hace que use el 100% del ancho y alto del contenedor
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
        "container_id": containerId,
        "support_host": "https://www.tradingview.com",
    });
}

/**
 * Gráfico de Curva de Capital (Chart.js)
 * Muestra el historial de ganancias por ciclo.
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) {
        console.error("Canvas 'equityCurveChart' no encontrado.");
        return;
    }

    const ctx = canvas.getContext('2d');

    // Destruir instancia previa para evitar errores visuales al recargar
    if (equityChartInstance) {
        equityChartInstance.destroy();
    }

    // Si no hay datos, no dibujamos nada
    if (!data || data.length === 0) {
        console.warn("No hay datos para graficar la curva de capital.");
        return;
    }

    const labels = data.map((_, i) => `Ciclo ${i + 1}`);
    let dataPoints = [];
    let labelText = '';
    let color = '#10b981'; // Verde Esmeralda

    // Selección de qué datos mostrar en el gráfico
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
            dataPoints = data.map(c => parseFloat(c.accumulatedProfit || c.netProfit || 0));
            labelText = 'Capital Acumulado (USDT)';
            color = '#10b981';
    }

    // Configuración estética del degradado bajo la línea
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, color.replace('rgb', 'rgba').replace(')', ', 0.4)'));
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
                tension: 0.4, 
                fill: true,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
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