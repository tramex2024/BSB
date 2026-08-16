/**
 * chart.js - Visualización de Rendimiento (Versión Optimizada + Blindaje DOM)
 * Estado: Estable - Manejo de TradingView y Chart.js
 */

let equityChartInstance = null;
let lastRenderedEquityDataJson = null;
let lastParameter = null;
let tvWidgetInstances = {}; // [BLINDAJE]: Registro para evitar recargas innecesarias del widget

/**
 * Gráfico de TradingView (Precios en vivo)
 */
export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const fullSymbol = "BINANCE:BTCUSDT";

    if (container.querySelector('iframe') && tvWidgetInstances[containerId] === fullSymbol) {
        return; 
    }

    container.innerHTML = '';
    container.style.height = "650px"; 
    container.style.width = "100%";

    const savedInterval = localStorage.getItem('tv_preferred_interval') || '1';

    if (window.TradingView) {
        tvWidgetInstances[containerId] = fullSymbol;
        new TradingView.widget({
            "autosize": true, 
            "symbol": fullSymbol,
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
                "paneProperties.vertGridProperties.color": "rgba(255, 255, 255, 0.02)",
                "paneProperties.horzGridProperties.color": "rgba(255, 255, 255, 0.02)",
                "paneProperties.vertGridProperties.style": 2,
                "paneProperties.horzGridProperties.style": 2
            }
        });
    }
}

/**
 * Gráfico de Curva de Capital (Chart.js) - Optimizado con Blindaje y Actualización In-Place
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {        
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) {
        console.error("❌ ERROR: No existe #equityCurveChart en el DOM");
        return;
    }

    if (canvas.parentElement) {
        canvas.parentElement.style.height = "450px"; 
    }

    // 1. PROCESAMIENTO Y HUELLA DIGITAL DE DATOS
    const rawPoints = Array.isArray(data) ? data : (data?.points || []);
    const dataJson = JSON.stringify(rawPoints);

    // [BLINDAJE DE RENDIMIENTO]: Si los datos y el parámetro son idénticos al tick anterior, salimos sin hacer nada.
    if (equityChartInstance && lastRenderedEquityDataJson === dataJson && lastParameter === parameter) {
        return;
    }

    lastRenderedEquityDataJson = dataJson;
    lastParameter = parameter;

    const ctx = canvas.getContext('2d');
    const hasData = rawPoints.length > 0;
    const points = hasData ? rawPoints : [{ time: 'Esperando datos...', value: 0 }];
    const labels = points.map((d, i) => d.time || `Punto ${i + 1}`);
    
    const dataPoints = points.map(p => {
        let val = p.value !== undefined ? p.value : (p.netProfit || 0);
        return parseFloat(parseFloat(val).toFixed(4));
    });

    const color = '#10b981'; // Esmeralda (Verde bot)

    // 2. ACTUALIZACIÓN IN-PLACE (Evita destruir y recrear el gráfico si ya existe)
    if (equityChartInstance) {
        equityChartInstance.data.labels = labels;
        equityChartInstance.data.datasets[0].data = dataPoints;
        equityChartInstance.data.datasets[0].label = parameter === 'accumulatedProfit' ? 'Capital Acumulado (USDT)' : 'Retorno (%)';
        equityChartInstance.data.datasets[0].borderColor = hasData ? color : 'rgba(255, 255, 255, 0.2)';
        equityChartInstance.update('none'); // Actualización fluida instantánea sin parpadeos
        return;
    }

    // 3. CREACIÓN INICIAL DE LA INSTANCIA (Solo ocurre la primera vez que se carga el dashboard)
    const chartHeight = canvas.offsetHeight || 450;
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    
    gradient.addColorStop(0, hasData ? `${color}44` : 'rgba(255, 255, 255, 0.05)'); 
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 

    try {
        equityChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: parameter === 'accumulatedProfit' ? 'Capital Acumulado (USDT)' : 'Retorno (%)',
                    data: dataPoints,
                    borderColor: hasData ? color : 'rgba(255, 255, 255, 0.2)',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointBackgroundColor: color,
                    pointBorderColor: '#111827',
                    pointBorderWidth: 1,
                    pointHoverRadius: 6,
                    tension: 0.35, 
                    fill: true,
                    pointRadius: (hasData && points.length < 50) ? 3 : 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { 
                    duration: 400,
                    easing: 'easeInOutQuad'
                },
                interaction: { 
                    intersect: false, 
                    mode: 'index' 
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: hasData,
                        backgroundColor: '#1f2937',
                        titleColor: '#9ca3af',
                        bodyColor: '#ffffff',
                        borderColor: color,
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: (ctx) => ` Profit: $${ctx.parsed.y.toFixed(2)} USDT`
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { 
                            color: 'rgba(255, 255, 255, 0.02)',
                            drawBorder: false 
                        },
                        ticks: { 
                            color: '#9ca3af', 
                            font: { size: 10, family: 'monospace' },
                            callback: (v) => `$${v.toFixed(2)}` 
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { 
                            color: '#9ca3af', 
                            font: { size: 9 },
                            maxTicksLimit: 7,
                            maxRotation: 0
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.error("💥 CRASH en Chart.js:", err);
    }
}