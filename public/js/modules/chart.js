// public/js/modules/chart.js

export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Contenedor del gráfico con ID "${containerId}" no encontrado.`);
        return;
    }

    // Limpia el contenedor antes de añadir un nuevo gráfico
    container.innerHTML = '';

    // Crea el nuevo widget de TradingView con la propiedad 'autosize'
    new TradingView.widget({
        "container_id": containerId,
        "autosize": true, // <-- ¡Esta es la clave para el redimensionamiento!
        "symbol": `BITMART:${symbol}`, // Ajustado para ser coherente con BitMart
        "interval": "60",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "es",
        "toolbar_bg": "#1f2937", // Color del fondo de la toolbar, para que coincida con tu diseño
        "enable_publishing": false,
        "withdateranges": true,
        "hide_side_toolbar": false,
        "allow_symbol_change": true,
        "hotlist": false,
        "calendar": false,
        "support_host": "https://www.tradingview.com",
    });

    console.log("Gráfico de TradingView inicializado para el símbolo:", symbol);
}

/**
 * Renderiza la Curva de Crecimiento de Capital utilizando Chart.js.
 * @param {Array<object>} curveData - Datos de la curva de crecimiento [{ endTime, cumulativeProfit }]
 */
export function renderEquityCurve(curveData) {
    const containerId = 'equityCurveChart'; // ID del <canvas> que debes crear en dashboard.html
    const ctx = document.getElementById(containerId);

    if (!ctx) {
        console.error(`Contenedor de Chart.js con ID "${containerId}" no encontrado. Asegúrate de añadir <canvas id="${containerId}"></canvas> en tu HTML.`);
        return;
    }

    // 1. Procesar datos para Chart.js
    const labels = curveData.map(data => {
        // Formatea la fecha para el eje X
        const date = new Date(data.endTime);
        return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    });
    
    const dataPoints = curveData.map(data => data.cumulativeProfit);

    // 2. Destruir gráfico anterior si existe
    if (window.equityChart instanceof Chart) {
        window.equityChart.destroy();
    }

    // 3. Crear el nuevo gráfico de líneas (Curva de Equity)
    window.equityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ganancia Acumulada (USDT)',
                data: dataPoints,
                borderColor: '#10B981', // Verde esmeralda (Success color)
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.2 // Suaviza la línea
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#E5E7EB' // Texto blanco claro
                    }
                },
                title: {
                    display: true,
                    text: 'Curva de Crecimiento de Capital (Equity Curve)',
                    color: '#D1D5DB'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Tiempo',
                        color: '#9CA3AF'
                    },
                    grid: {
                        color: 'rgba(75, 75, 75, 0.5)' // Grilla más oscura
                    },
                    ticks: {
                        color: '#D1D5DB',
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'USDT Acumulado',
                        color: '#9CA3AF'
                    },
                    grid: {
                        color: 'rgba(75, 75, 75, 0.5)'
                    },
                    ticks: {
                        color: '#D1D5DB'
                    },
                    beginAtZero: true
                }
            }
        }
    });
}