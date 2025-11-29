// public/js/modules/tecalculations.js

// Función para actualizar todos los cálculos del Testbot
export function actualizarCalculosTestbot() {
    // Obtener las referencias de todos los inputs y displays del DOM
    const teamountUSDTInput = document.getElementById('teamount-usdt');
    const teamountBTCInput = document.getElementById('teamount-btc');
    const tepurchaseUSDTInput = document.getElementById("tepurchase-usdt");
    const tepurchaseBTCInput = document.getElementById("tepurchase-btc");
    const teincrementInput = document.getElementById("teincrement");
    const tedecrementInput = document.getElementById("tedecrement");
    const tetriggerInput = document.getElementById("tetrigger"); // Nuevo input
    const tepriceElement = document.getElementById('teprice');
    
    // Displays para los balances
    const telbalanceDisplay = document.getElementById('telbalance');
    const tesbalanceDisplay = document.getElementById('tesbalance');

    // Displays para los cálculos de cobertura
    const telcoverageDisplay = document.getElementById('telcoverage');
    const telnorderDisplay = document.getElementById('telnorder');
    const tescoverageDisplay = document.getElementById('tescoverage');
    const tesnorderDisplay = document.getElementById('tesnorder');

    // Displays para los nuevos cálculos de precio objetivo
    const teltpriceDisplay = document.getElementById('teltprice');
    const testpriceDisplay = document.getElementById('testprice');

    // Verificar que todos los elementos existan
    if (!teamountUSDTInput || !teamountBTCInput || !tepurchaseUSDTInput || !tepurchaseBTCInput ||
        !teincrementInput || !tedecrementInput || !tetriggerInput || !tepriceElement || 
        !telbalanceDisplay || !tesbalanceDisplay || !telcoverageDisplay || !telnorderDisplay || 
        !tescoverageDisplay || !tesnorderDisplay || !teltpriceDisplay || !testpriceDisplay) {
        console.warn("Advertencia: No se encontraron todos los elementos necesarios para los cálculos. La función no se ejecutará.");
        return;
    }

    // Convertir valores de los inputs a números
    const teamountUSDT = parseFloat(teamountUSDTInput.value) || 0;
    const teamountBTC = parseFloat(teamountBTCInput.value) || 0;
    const tepurchaseUSDT = parseFloat(tepurchaseUSDTInput.value) || 0;
    const tepurchaseBTC = parseFloat(tepurchaseBTCInput.value) || 0;
    const teincrement = parseFloat(teincrementInput.value) || 0;
    const tedecrement = parseFloat(tedecrementInput.value) || 0;
    const tetrigger = parseFloat(tetriggerInput.value) || 0; // Nuevo valor de input
    const tecurrentPrice = parseFloat(tepriceElement.textContent) || 0;

    // Verificar si los valores numéricos son válidos
    if (isNaN(teamountUSDT) || isNaN(teamountBTC) || isNaN(tepurchaseUSDT) || isNaN(tepurchaseBTC) ||
        isNaN(teincrement) || isNaN(tedecrement) || isNaN(tetrigger) || isNaN(tecurrentPrice) || tecurrentPrice === 0) {
        console.warn("Advertencia: Uno o más valores de entrada no son números válidos. No se pueden realizar los cálculos.");
        return;
    }

    // -------------------------------------------------------------
    // CÁLCULOS PARA LA ESTRATEGIA LONG
    // -------------------------------------------------------------
    let telbalance = teamountUSDT;
    let telongCoveragePrice = tecurrentPrice;
    let telongOrderCount = 0;
    let tenextPurchaseAmount = tepurchaseUSDT;

    while (telbalance >= tenextPurchaseAmount && tenextPurchaseAmount > 0) {
        telbalance -= tenextPurchaseAmount;
        telongOrderCount++;

        const teorderIndex = telongOrderCount;
        const tepriceDropPercentage = (tedecrement * teorderIndex) / 100;
        telongCoveragePrice = telongCoveragePrice * (1 - tepriceDropPercentage);
        
        const tenextIncrementAmount = tenextPurchaseAmount * (teincrement / 100);
        tenextPurchaseAmount += tenextIncrementAmount;
    }

    // -------------------------------------------------------------
    // CÁLCULOS PARA LA ESTRATEGIA SHORT
    // -------------------------------------------------------------
    let tesbalance = teamountBTC;
    let teshortCoveragePrice = tecurrentPrice;
    let teshortOrderCount = 0;
    let tenextSellAmount = tepurchaseBTC;

    while (tesbalance >= tenextSellAmount && tenextSellAmount > 0) {
        tesbalance -= tenextSellAmount;
        teshortOrderCount++;

        const teorderIndex = teshortOrderCount;
        const tepriceIncreasePercentage = (tedecrement * teorderIndex) / 100;
        teshortCoveragePrice = teshortCoveragePrice * (1 + tepriceIncreasePercentage);

        const tenextIncrementAmount = tenextSellAmount * (teincrement / 100);
        tenextSellAmount += tenextIncrementAmount;
    }

    // -------------------------------------------------------------
    // CÁLCULOS DE PRECIO OBJETIVO (LTPrice y STPrice)
    // -------------------------------------------------------------
    const teltprice = tecurrentPrice * (1 + tetrigger / 100);
    const testprice = tecurrentPrice * (1 - tetrigger / 100);

    // -------------------------------------------------------------
    // ACTUALIZAR LOS DISPLAYS EN EL DOM
    // -------------------------------------------------------------
    telbalanceDisplay.textContent = telbalance.toFixed(2);
    tesbalanceDisplay.textContent = tesbalance.toFixed(8);

    telcoverageDisplay.textContent = telongCoveragePrice.toFixed(2);
    telnorderDisplay.textContent = telongOrderCount;

    tescoverageDisplay.textContent = teshortCoveragePrice.toFixed(2);
    tesnorderDisplay.textContent = teshortOrderCount;

    teltpriceDisplay.textContent = teltprice.toFixed(2);
    testpriceDisplay.textContent = testprice.toFixed(2);
}


// Mantener esta función por compatibilidad, aunque ya no se utilice.
export function actualizarBalancesEstrategia() {
    console.warn("La función actualizarBalancesEstrategia() está obsoleta. Se ha consolidado en actualizarCalculosTestbot().");
}