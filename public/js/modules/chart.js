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