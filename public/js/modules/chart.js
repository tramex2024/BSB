// public/js/modules/chart.js

let equityChartInstance = null;

/**
 * Gráfico de TradingView (Precios en vivo) con Indicadores Persistentes
 */
export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    
    // --- AMPLIACIÓN HACIA ABAJO ---
    container.style.height = "650px"; 
    container.style.width = "100%";

    const savedInterval = localStorage.getItem('tv_preferred_interval') || '1';

    new TradingView.widget({
        "autosize": true, 
        "symbol": `BITMART:${symbol}`,
        "interval": savedInterval,
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
        "studies": [
            "RSI@tv-basicstudies",      
            "BB@tv-basicstudies",          
            "MACD@tv-basicstudies"      
        ],
        "overrides": {
            "mainSeriesProperties.style": 1,
            "paneProperties.background": "#111827",
            "paneProperties.vertGridProperties.color": "rgba(255, 255, 255, 0.08)",
            "paneProperties.horzGridProperties.color": "rgba(255, 255, 255, 0.08)",
            "paneProperties.legendProperties.showStudyArguments": true,
            "paneProperties.legendProperties.showStudyTitles": true,
            "paneProperties.legendProperties.showStudyValues": true,
        }
    });
}

/**
 * Gráfico de Curva de Capital (Chart.js)
 * Versión Blindada: Grid persistente y manejo de datos fantasma
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) return;

    // --- AJUSTE DE ALTURA ---
    if (canvas.parentElement) {
        canvas.parentElement.style.height = "450px"; 
    }

    const ctx = canvas.getContext('2d');

    if (equityChartInstance) {
        equityChartInstance.destroy();
        equityChartInstance = null;
    }

    // --- MANEJO DE DATOS BLINDADO ---
    // Obtenemos los puntos independientemente del formato
    const rawPoints = Array.isArray(data) ? data : (data?.points || []);
    
    // Si no hay datos, creamos una estructura mínima para que el grid se renderice
    const hasData = rawPoints.length > 0;
    const points = hasData ? rawPoints : [{ time: 'Sin datos', value: 0 }];

    const labels = points.map((d, i) => d.time || `Punto ${i + 1}`);
    
    let dataPoints = [];
    let labelText = '';
    let color = '#10b981'; 

    switch (parameter) {
        case 'durationHours':
            dataPoints = points.map(c => parseFloat(c.durationHours || 0));
            labelText = 'Duración (Horas)';
            color = '#f59e0b';
            break;
        case 'initialInvestment':
            dataPoints = points.map(c => parseFloat(c.initialInvestment || 0));
            labelText = 'Inversión Inicial (USDT)';
            color = '#3b82f6';
            break;
        default:
            dataPoints = points.map(c => {
                // Priorizamos 'value' que es el estándar de nuestro metricsManager
                if (c.value !== undefined) return parseFloat(c.value);
                return parseFloat(c.accumulatedProfit || c.netProfit || 0);
            });
            labelText = 'Capital Acumulado (USDT)';
            color = '#10b981';
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 450);
    gradient.addColorStop(0, hasData ? `${color}66` : 'rgba(255, 255, 255, 0.05)'); 
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 

    equityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelText,
                data: dataPoints,
                borderColor: hasData ? color : 'rgba(255, 255, 255, 0.2)',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: color,
                pointBorderColor: '#111827',
                pointBorderWidth: 2,
                pointHoverRadius: 6,
                tension: 0.35, 
                fill: true,
                pointRadius: (hasData && points.length < 50) ? 3 : 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: hasData, // Solo mostrar tooltip si hay datos reales
                    backgroundColor: '#1f2937',
                    titleColor: '#9ca3af',
                    bodyColor: '#fff',
                    borderColor: color,
                    borderWidth: 1,
                    displayColors: false,
                    padding: 10,
                    callbacks: {
                        label: (context) => ` ${context.parsed.y.toFixed(4)} USDT`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true, // Forzado para mantener la línea de 0 visible
                    grid: { 
                        color: 'rgba(255, 255, 255, 0.08)', 
                        drawBorder: false 
                    },
                    ticks: { 
                        color: '#9ca3af', 
                        font: { size: 10, family: 'monospace' },
                        callback: (value) => `$${value.toFixed(2)}` 
                    }
                },
                x: {
                    grid: { 
                        display: true, // Activado para dar estructura
                        color: 'rgba(255, 255, 255, 0.03)' 
                    },
                    ticks: { 
                        color: '#9ca3af', 
                        font: { size: 9 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8
                    }
                }
            }
        }
    });
}