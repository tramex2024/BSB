/**
 * chart.js - Visualización de Rendimiento (Versión Completa + Auditoría)
 * Restauradas >20 líneas de configuración de escalas y diseño.
 */

let equityChartInstance = null;

/**
 * Gráfico de TradingView (Precios en vivo)
 */
export function initializeChart(containerId, symbol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    container.style.height = "650px"; 
    container.style.width = "100%";

    const savedInterval = localStorage.getItem('tv_preferred_interval') || '1';

    if (window.TradingView) {
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
            }
        });
    }
}

/**
 * Gráfico de Curva de Capital (Chart.js)
 */
export function renderEquityCurve(data, parameter = 'accumulatedProfit') {
    // --- LOGS DE AUDITORÍA ---
    console.log("🔍 LOG 1: Entrada de datos:", data);
    
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) {
        console.error("❌ ERROR: No existe #equityCurveChart");
        return;
    }

    // Asegurar que el contenedor tenga dimensiones
    if (canvas.parentElement) {
        canvas.parentElement.style.height = "450px"; 
    }

    if (canvas.clientWidth === 0) {
        canvas.style.width = "100%";
    }

    const ctx = canvas.getContext('2d');

    // 1. LIMPIEZA TOTAL
    if (equityChartInstance) {
        console.log("🧹 LOG 2: Destruyendo instancia previa");
        equityChartInstance.destroy();
        equityChartInstance = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. PROCESAMIENTO DE PUNTOS
    const rawPoints = Array.isArray(data) ? data : (data?.points || []);
    console.log(`📊 LOG 3: Cantidad de puntos raw: ${rawPoints.length}`);

    const hasData = rawPoints.length > 0;
    const points = hasData ? rawPoints : [{ time: 'Esperando datos...', value: 0 }];

    const labels = points.map((d, i) => d.time || `Punto ${i + 1}`);
    
    // Extracción normalizada (Recuperada lógica de profit)
    const dataPoints = points.map(p => {
        const val = (typeof p.value === 'number') ? p.value : (p.netProfit || 0);
        return parseFloat(val.toFixed(4));
    });

    console.log("📈 LOG 4: dataPoints calculados:", dataPoints);

    // 3. GRADIENTE DINÁMICO
    const chartHeight = canvas.offsetHeight || 450;
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    const color = '#10b981'; 
    gradient.addColorStop(0, hasData ? `${color}44` : 'rgba(255, 255, 255, 0.05)'); 
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 

    // 4. CREACIÓN DE INSTANCIA (RESTAURADO COMPLETO)
    try {
        equityChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Capital Acumulado (USDT)',
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
                            color: 'rgba(255, 255, 255, 0.05)',
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
        console.log("✅ LOG 5: Render finalizado con éxito.");
    } catch (err) {
        console.error("💥 CRASH en Chart.js:", err);
    }
}