// public/js/modules/chart.js

let tradingViewWidget = null;

/**
 * Inicializa el widget de TradingView.
 * @param {string} containerId - El ID del elemento HTML donde se montará el widget.
 * @param {string} symbol - El par de trading. Por ejemplo: 'BITMART:BTC_USDT'.
 */
export function initializeChart(containerId, symbol) {
    if (tradingViewWidget) {
        console.warn("TradingView widget ya inicializado.");
        return;
    }

    console.log(`Inicializando gráfico de TradingView para el símbolo: ${symbol}`);
    
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Error: No se encontró el contenedor con el ID '${containerId}'. El gráfico no se puede inicializar.`);
        return;
    }

    tradingViewWidget = new TradingView.widget({
        "container_id": containerId,
        "autosize": true,
        "symbol": "BINANCE:BTCUSDT", // <-- Aquí está el cambio
        "interval": "60",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "es",
        "toolbar_bg": "#f1f3f6",
        "enable_publishing": false,
        "allow_symbol_change": true,
        "support_host": "https://www.tradingview.com",
        "library_path": "/charting_library/",
        "disabled_features": [
            "header_saveload",
            "study_templates"
        ]
    });
}