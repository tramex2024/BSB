// public/js/modules/aicalculations.js

// Función para actualizar todos los cálculos del Aibot
export function actualizarCalculosAibot() {
    // Obtener las referencias de todos los inputs y displays del DOM
    const aiamountUSDTInput = document.getElementById('aiamount-usdt');
    const aiamountBTCInput = document.getElementById('aiamount-btc');
    const aipurchaseUSDTInput = document.getElementById("aipurchase-usdt");
    const aipurchaseBTCInput = document.getElementById("aipurchase-btc");
    const aiincrementInput = document.getElementById("aiincrement");
    const aidecrementInput = document.getElementById("aidecrement");
    const aitriggerInput = document.getElementById("aitrigger"); // Nuevo input
    const aipriceElement = document.getElementById('aiprice');
    
    // Displays para los balances
    const ailbalanceDisplay = document.getElementById('ailbalance');
    const aisbalanceDisplay = document.getElementById('aisbalance');

    // Displays para los cálculos de cobertura
    const ailcoverageDisplay = document.getElementById('ailcoverage');
    const ailnorderDisplay = document.getElementById('ailnorder');
    const aiscoverageDisplay = document.getElementById('aiscoverage');
    const aisnorderDisplay = document.getElementById('aisnorder');

    // Displays para los nuevos cálculos de precio objetivo
    const ailtpriceDisplay = document.getElementById('ailtprice');
    const aistpriceDisplay = document.getElementById('aistprice');

    // Verificar que todos los elementos existan
    if (!aiamountUSDTInput || !aiamountBTCInput || !aipurchaseUSDTInput || !aipurchaseBTCInput ||
        !aiincrementInput || !aidecrementInput || !aitriggerInput || !aipriceElement || 
        !ailbalanceDisplay || !aisbalanceDisplay || !ailcoverageDisplay || !ailnorderDisplay || 
        !aiscoverageDisplay || !aisnorderDisplay || !ailtpriceDisplay || !aistpriceDisplay) {
        console.warn("Advertencia: No se encontraron todos los elementos necesarios para los cálculos. La función no se ejecutará.");
        return;
    }

    // Convertir valores de los inputs a números
    const aiamountUSDT = parseFloat(aiamountUSDTInput.value) || 0;
    const aiamountBTC = parseFloat(aiamountBTCInput.value) || 0;
    const aipurchaseUSDT = parseFloat(aipurchaseUSDTInput.value) || 0;
    const aipurchaseBTC = parseFloat(aipurchaseBTCInput.value) || 0;
    const aiincrement = parseFloat(aiincrementInput.value) || 0;
    const aidecrement = parseFloat(aidecrementInput.value) || 0;
    const aitrigger = parseFloat(aitriggerInput.value) || 0; // Nuevo valor de input
    const aicurrentPrice = parseFloat(aipriceElement.textContent) || 0;

    // Verificar si los valores numéricos son válidos
    //if (isNaN(aiamountUSDT) || isNaN(aiamountBTC) || isNaN(aipurchaseUSDT) || isNaN(aipurchaseBTC) ||
    //    isNaN(aiincrement) || isNaN(aidecrement) || isNaN(aitrigger) || isNaN(aicurrentPrice) || aicurrentPrice === 0) {
    //    console.warn("Advertencia: Uno o más valores de entrada no son números válidos. No se pueden realizar los cálculos.");
    //    return;
    //}

    // -------------------------------------------------------------
    // CÁLCULOS PARA LA ESTRATEGIA LONG
    // -------------------------------------------------------------
    let ailbalance = aiamountUSDT;
    let ailongCoveragePrice = aicurrentPrice;
    let ailongOrderCount = 0;
    let ainextPurchaseAmount = aipurchaseUSDT;

    while (ailbalance >= ainextPurchaseAmount && ainextPurchaseAmount > 0) {
        ailbalance -= ainextPurchaseAmount;
        ailongOrderCount++;

        const aiorderIndex = ailongOrderCount;
        const aipriceDropPercentage = (aidecrement * aiorderIndex) / 100;
        ailongCoveragePrice = ailongCoveragePrice * (1 - aiaipriceDropPercentage);
        
        const ainextIncrementAmount = ainextPurchaseAmount * (aiincrement / 100);
        ainextPurchaseAmount += ainextIncrementAmount;
    }

    // -------------------------------------------------------------
    // CÁLCULOS PARA LA ESTRATEGIA SHORT
    // -------------------------------------------------------------
    let aisbalance = aiamountBTC;
    let aishortCoveragePrice = aicurrentPrice;
    let aishortOrderCount = 0;
    let ainextSellAmount = aipurchaseBTC;

    while (aisbalance >= ainextSellAmount && ainextSellAmount > 0) {
        aisbalance -= ainextSellAmount;
        aishortOrderCount++;

        const aiorderIndex = aishortOrderCount;
        const aipriceIncreasePercentage = (aidecrement * aiorderIndex) / 100;
        aishortCoveragePrice = aishortCoveragePrice * (1 + aipriceIncreasePercentage);

        const ainextIncrementAmount = nextSellAmount * (aiincrement / 100);
        ainextSellAmount += ainextIncrementAmount;
    }

    // -------------------------------------------------------------
    // CÁLCULOS DE PRECIO OBJETIVO (LTPrice y STPrice)
    // -------------------------------------------------------------
    const ailtprice = aicurrentPrice * (1 + aitrigger / 100);
    const aistprice = aicurrentPrice * (1 - aitrigger / 100);

    // -------------------------------------------------------------
    // ACTUALIZAR LOS DISPLAYS EN EL DOM
    // -------------------------------------------------------------
    ailbalanceDisplay.textContent = ailbalance.toFixed(2);
    aisbalanceDisplay.textContent = aisbalance.toFixed(8);

    ailcoverageDisplay.textContent = ailongCoveragePrice.toFixed(2);
    ailnorderDisplay.textContent = ailongOrderCount;

    aiscoverageDisplay.textContent = aishortCoveragePrice.toFixed(2);
    aisnorderDisplay.textContent = aishortOrderCount;

    ailtpriceDisplay.textContent = ailtprice.toFixed(2);
    aistpriceDisplay.textContent = aistprice.toFixed(2);
}


// Mantener esta función por compatibilidad, aunque ya no se utilice.
export function actualizarBalancesEstrategia() {
    console.warn("La función actualizarBalancesEstrategia() está obsoleta. Se ha consolidado en actualizarCalculosAibot().");
}