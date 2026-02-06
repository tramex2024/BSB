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

let equityChartInstance = null; // Variable para mantener la instancia del gráfico

/**
 * Renderiza la curva de crecimiento de capital usando Chart.js.
 * @param {Array<object>} data - Los datos de los ciclos cerrados.
 * @param {string} parameter - El parámetro a mostrar ('accumulatedProfit', 'durationHours', etc.).
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {
    const ctx = document.getElementById('equityCurveChart');
    if (!ctx) {
        console.error("Contenedor del gráfico 'equityCurveChart' no encontrado.");
        return;
    }

    // Si ya existe una instancia, destrúyela antes de crear una nueva.
    if (equityChartInstance) {
        equityChartInstance.destroy();
    }

    // 🛑 1. PREPARACIÓN DE DATOS DINÁMICA
    const labels = data.map((cycle, index) => `Cycle ${index + 1}`); // Etiqueta: Ciclo 1, Ciclo 2, etc.

    let datasetLabel = '';
    let dataPoints = [];
    let yAxisTitle = '';

    switch (parameter) {
        case 'durationHours':
            dataPoints = data.map(cycle => (cycle.durationHours || 0).toFixed(2));
            datasetLabel = 'Duración de Ciclo (Horas)';
            yAxisTitle = 'Duración (h)';
            break;
        case 'initialInvestment':
            // Asumo que tienes una propiedad 'initialInvestment' en tus datos
            dataPoints = data.map(cycle => (cycle.initialInvestment || 0).toFixed(2));
            datasetLabel = 'Inversión Inicial';
            yAxisTitle = 'USDT';
            break;
        case 'accumulatedProfit':
        default:
            // 🛑 Lógica para el rendimiento acumulado (la curva original)
            dataPoints = data.map(cycle => (cycle.accumulatedProfit || 0).toFixed(2));
            datasetLabel = 'Rendimiento Neto Acumulado';
            yAxisTitle = 'USDT';
            break;
    }

    // 🛑 2. CREACIÓN/ACTUALIZACIÓN DEL GRÁFICO
    equityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: datasetLabel,
                data: dataPoints,
                borderColor: parameter === 'accumulatedProfit' ? 'rgb(75, 192, 192)' : 'rgb(255, 159, 64)', // Cambia el color para diferenciar
                backgroundColor: parameter === 'accumulatedProfit' ? 'rgba(75, 192, 192, 0.2)' : 'rgba(255, 159, 64, 0.2)',
                borderWidth: 2,
                tension: 0.3,
                fill: parameter === 'accumulatedProfit' ? 'start' : false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: yAxisTitle,
                        color: '#9ca3af' // gray-400
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#9ca3af'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Ciclos Cerrados',
                        color: '#9ca3af'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#9ca3af'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#f3f4f6' // gray-100
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            }
        }
    });
}