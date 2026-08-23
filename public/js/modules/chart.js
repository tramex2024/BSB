/**
 * chart.js - Performance Visualization (Optimized Version + DOM Shielding)
 * Status: Stable - Handling TradingView and Chart.js with dynamic symbol and tooltip support.
 */

let equityChartInstance = null;
let tvWidgetInstances = {}; // [SHIELDING]: Registry to prevent unnecessary widget reloads

/**
 * TradingView Chart (Live prices)
 * Configures the main widget avoiding iframe destruction when changing tabs.
 */
export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // [CORRECTION]: Dynamic use of the symbol received by parameter
    const rawSymbol = symbol || 'BTCUSDT';
    const fullSymbol = rawSymbol.includes(':') ? rawSymbol : `BINANCE:${rawSymbol}`;

    // [SHIELDING]: If the container already has an active iframe and the symbol is identical, 
    // we avoid destroying the DOM to prevent interruptions in the real-time price stream.
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
            "locale": "en",
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
 * Equity Curve Chart (Chart.js)
 * Renders the history of accumulated profits, duration, orders, or investment of the bot.
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {        
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) {
        console.error("❌ ERROR: #equityCurveChart does not exist in the DOM");
        return;
    }

    if (canvas.parentElement) {
        canvas.parentElement.style.height = "450px"; 
    }

    const ctx = canvas.getContext('2d');

    // 1. TOTAL CLEANUP: Prevents charts from overlapping when updating
    if (equityChartInstance) {        
        equityChartInstance.destroy();
        equityChartInstance = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. POINTS PROCESSING
    const rawPoints = Array.isArray(data) ? data : (data?.points || []);
    const hasData = rawPoints.length > 0;
    
    const points = hasData ? rawPoints : [{ time: 'Waiting for data...', value: 0 }];
    const labels = points.map((d, i) => d.time || `Point ${i + 1}`);
    
    const dataPoints = points.map(p => {
        let val = p.value !== undefined ? p.value : (p.netProfit || 0);
        return parseFloat(parseFloat(val).toFixed(4));
    });

    // 3. DYNAMIC GRADIENT
    const chartHeight = canvas.offsetHeight || 450;
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    const color = '#10b981'; // Emerald (Bot green)
    
    gradient.addColorStop(0, hasData ? `${color}44` : 'rgba(255, 255, 255, 0.05)'); 
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 

    // Dynamic dataset title based on parameter
    let datasetLabel = 'Accumulated Capital (USDT)';
    if (parameter === 'durationHours') datasetLabel = 'Duration (Hours)';
    else if (parameter === 'orderCount') datasetLabel = 'Order Count';
    else if (parameter === 'initialInvestment') datasetLabel = 'Initial Investment (USDT)';
    else if (parameter !== 'accumulatedProfit') datasetLabel = 'Return (%)';

    // 4. INSTANCE CREATION
    try {
        equityChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: datasetLabel,
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
                            // [CORRECTION]: Adaptive tooltip according to the active parameter
                            label: (ctx) => {
                                const val = ctx.parsed.y;
                                if (parameter === 'accumulatedProfit') {
                                    return ` Profit: $${val.toFixed(2)} USDT`;
                                } else if (parameter === 'durationHours') {
                                    return ` Duration: ${val.toFixed(2)}h`;
                                } else if (parameter === 'orderCount') {
                                    return ` Orders: ${Math.round(val)}`;
                                } else if (parameter === 'initialInvestment') {
                                    return ` Investment: $${val.toFixed(2)} USDT`;
                                } else {
                                    return ` Return: ${val.toFixed(2)}%`;
                                }
                            }
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
                            // [CORRECTION]: Dynamic Y-axis format
                            callback: (v) => {
                                if (parameter === 'accumulatedProfit' || parameter === 'initialInvestment') {
                                    return `$${v.toFixed(2)}`;
                                } else if (parameter === 'durationHours') {
                                    return `${v.toFixed(1)}h`;
                                } else if (parameter === 'orderCount') {
                                    return `${Math.round(v)}`;
                                } else {
                                    return `${v.toFixed(2)}%`;
                                }
                            }
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
        console.error("💥 CRASH in Chart.js:", err);
    }
}