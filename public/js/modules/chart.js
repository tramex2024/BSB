// public/js/modules/chart.js

export function initializeChart(containerId, TRADE_SYMBOL_TV) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Contenedor del gráfico con ID "${containerId}" no encontrado.`);
        return;
    }

    // Limpia el contenedor antes de añadir un nuevo gráfico
    container.innerHTML = '';

    // Crea el nuevo widget de TradingView en el contenedor
    new TradingView.widget({
        "container_id": containerId,
        "symbol": `BINANCE:${TRADE_SYMBOL_TV}`, // Usamos el prefijo de Binance por defecto, es el más compatible
        "interval": "60",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "es",
        "toolbar_bg": "#f1f3f6",
        "enable_publishing": false,
        "withdateranges": true,
        "hide_side_toolbar": false,
        "allow_symbol_change": true,
        "hotlist": false,
        "calendar": false,
        "support_host": "https://www.tradingview.com",
    });

    console.log("Gráfico de TradingView inicializado para el símbolo:", TRADE_SYMBOL_TV);
}