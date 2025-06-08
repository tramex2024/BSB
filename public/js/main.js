document.addEventListener('DOMContentLoaded', () => {
    // Selectores para los elementos del encabezado y modales
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    const body = document.body;

    const loginLogoutIcon = document.getElementById('login-logout-icon');
    const apiKeyIcon = document.getElementById('api-key-icon');

    const authModal = document.getElementById('auth-modal');
    const apiModal = document.getElementById('api-modal');

    const authForm = document.getElementById('auth-form');
    const emailInput = document.getElementById('email');
    const tokenInput = document.getElementById('token');
    const authButton = document.getElementById('auth-button');
    const authMessage = document.getElementById('auth-message');

    const apiForm = document.getElementById('api-form');
    const apiKeyInput = document.getElementById('api-key');
    const secretKeyInput = document.getElementById('secret-key');
    const apiMemoInput = document.getElementById('api-memo');
    const validateApiButton = document.getElementById('validate-api-button');
    const apiStatusMessage = document.getElementById('api-status-message');
    const connectionIndicator = document.getElementById('connection-indicator');
    const connectionText = document.getElementById('connection-text');

    const closeButtons = document.querySelectorAll('.close-button');

    // Selectores específicos para la sección AUTOBOT
    const startBtn = document.getElementById('start-btn');
    const resetBtn = document.getElementById('reset-btn');
    const botStateSpan = document.getElementById('bot-state');
    const stopAtCycleEndCheckbox = document.getElementById('stop-at-cycle-end');
    const connectionStatusDiv = document.getElementById('connection-status');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    // Verificar si los elementos críticos de AUTOBOT existen
    if (!startBtn || !resetBtn || !botStateSpan || !stopAtCycleEndCheckbox || !connectionStatusDiv || !statusDot || !statusText) {
        console.warn("Faltan elementos DOM para controlar el estado del bot en la sección AUTOBOT.");
        // Deshabilitar el botón de inicio si faltan elementos
        if (startBtn) startBtn.disabled = true;
        // Podrías mostrar un mensaje de error en la UI también
    }


    // Función para manejar las pestañas de navegación
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = e.target.dataset.tab;

            navTabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            e.target.classList.add('active');
            document.getElementById(`${targetTab}-section`).classList.add('active');
        });
    });

    // Función para alternar modo oscuro/claro
    darkModeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        body.classList.toggle('light-mode');
    });

    // Funciones para manejar modales
    function openModal(modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10); // Para la transición CSS
    }

    function closeModal(modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300); // Espera que la transición termine
    }

    // Event listeners para abrir/cerrar modales
    loginLogoutIcon.addEventListener('click', () => openModal(authModal));
    apiKeyIcon.addEventListener('click', () => openModal(apiModal));

    closeButtons.forEach(button => {
        button.addEventListener('click', (e) => closeModal(e.target.closest('.modal')));
    });

    window.addEventListener('click', (e) => {
        if (e.target === authModal) {
            closeModal(authModal);
        }
        if (e.target === apiModal) {
            closeModal(apiModal);
        }
    });

    // Lógica del formulario de autenticación (ejemplo básico)
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value;
        const token = tokenInput.value;

        authMessage.textContent = 'Processing...';
        authMessage.className = 'message-text';

        try {
            let response;
            if (tokenInput.style.display === 'none') { // Requesting token
                response = await fetch('/api/request-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await response.json();
                if (response.ok) {
                    authMessage.textContent = data.message;
                    tokenInput.style.display = 'block';
                    authButton.textContent = 'Verify Token';
                } else {
                    authMessage.textContent = data.error || 'Failed to request token.';
                    authMessage.classList.add('error');
                }
            } else { // Verifying token
                response = await fetch('/api/verify-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, token })
                });
                const data = await response.json();
                if (response.ok) {
                    authMessage.textContent = data.message;
                    authMessage.classList.add('success');
                    localStorage.setItem('userEmail', email); // Store email on successful login
                    loginLogoutIcon.classList.remove('fa-sign-in-alt');
                    loginLogoutIcon.classList.add('fa-sign-out-alt');
                    loginLogoutIcon.title = 'Logout';
                    setTimeout(() => closeModal(authModal), 1500); // Close after success
                } else {
                    authMessage.textContent = data.error || 'Invalid token.';
                    authMessage.classList.add('error');
                }
            }
        } catch (error) {
            console.error('Auth error:', error);
            authMessage.textContent = 'An error occurred during authentication.';
            authMessage.classList.add('error');
        }
    });

    // Lógica para el botón de login/logout
    if (localStorage.getItem('userEmail')) {
        loginLogoutIcon.classList.remove('fa-sign-in-alt');
        loginLogoutIcon.classList.add('fa-sign-out-alt');
        loginLogoutIcon.title = 'Logout';
    }

    loginLogoutIcon.addEventListener('click', () => {
        if (localStorage.getItem('userEmail')) {
            // Lógica para cerrar sesión
            localStorage.removeItem('userEmail');
            loginLogoutIcon.classList.remove('fa-sign-out-alt');
            loginLogoutIcon.classList.add('fa-sign-in-alt');
            loginLogoutIcon.title = 'Login';
            alert('Has cerrado sesión.');
        } else {
            openModal(authModal);
        }
    });

    // Lógica del formulario de API Key
    apiForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = apiKeyInput.value;
        const secretKey = secretKeyInput.value;
        const apiMemo = apiMemoInput.value;

        apiStatusMessage.textContent = 'Validating API keys...';
        apiStatusMessage.className = 'message-text';
        connectionIndicator.style.backgroundColor = 'orange'; // Pending

        try {
            const response = await fetch('/api/validate-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey, secretKey, apiMemo })
            });
            const data = await response.json();

            if (response.ok) {
                apiStatusMessage.textContent = data.message || 'API keys validated successfully!';
                apiStatusMessage.classList.add('success');
                connectionIndicator.style.backgroundColor = 'green'; // Success
                connectionText.textContent = 'Connected';
                // Puedes guardar las keys en localStorage si es apropiado, pero con precaución.
                // localStorage.setItem('bitmartApiKey', apiKey);
                // localStorage.setItem('bitmartSecretKey', secretKey);
                // localStorage.setItem('bitmartApiMemo', apiMemo);
            } else {
                apiStatusMessage.textContent = data.error || 'Failed to validate API keys.';
                apiStatusMessage.classList.add('error');
                connectionIndicator.style.backgroundColor = 'red'; // Failed
                connectionText.textContent = 'Disconnected';
            }
        } catch (error) {
            console.error('API validation error:', error);
            apiStatusMessage.textContent = 'An error occurred during API key validation.';
            apiStatusMessage.classList.add('error');
            connectionIndicator.style.backgroundColor = 'red'; // Failed
            connectionText.textContent = 'Disconnected';
        }
    });

    // Función para alternar el estado del bot
    function toggleBotState() {
        // Asegúrate de que los elementos existan antes de usarlos
        if (!startBtn || !resetBtn || !botStateSpan || !stopAtCycleEndCheckbox || !statusDot || !statusText) {
            console.warn("Faltan elementos DOM esenciales para toggleBotState.");
            return;
        }

        const isBotRunning = botStateSpan.textContent === 'RUNNING';

        if (isBotRunning) {
            // Detener el bot
            botStateSpan.textContent = 'STOPPED';
            botStateSpan.classList.remove('text-green-400');
            botStateSpan.classList.add('text-yellow-400');
            startBtn.textContent = 'START';
            startBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
            startBtn.classList.add('bg-green-600', 'hover:bg-green-700');
            resetBtn.disabled = false; // Habilitar reset al detener
            stopAtCycleEndCheckbox.disabled = false; // Habilitar checkbox

            // Actualizar estado de conexión/bot en la parte superior del panel
            statusDot.classList.remove('bg-green-500');
            statusDot.classList.add('bg-red-500');
            statusText.textContent = 'Disconnected';

            // Enviar señal al backend para detener el bot
            fetch('/api/stop-autobot', { method: 'POST' })
                .then(response => response.json())
                .then(data => console.log('Bot stopped:', data))
                .catch(error => console.error('Error stopping bot:', error));

        } else {
            // Iniciar el bot
            botStateSpan.textContent = 'RUNNING';
            botStateSpan.classList.remove('text-yellow-400');
            botStateSpan.classList.add('text-green-400');
            startBtn.textContent = 'STOP';
            startBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
            startBtn.classList.add('bg-red-600', 'hover:bg-red-700');
            resetBtn.disabled = true; // Deshabilitar reset al iniciar
            stopAtCycleEndCheckbox.disabled = true; // Deshabilitar checkbox

            // Actualizar estado de conexión/bot en la parte superior del panel
            statusDot.classList.remove('bg-red-500');
            statusDot.classList.add('bg-green-500');
            statusText.textContent = 'Connected';

            // Obtener parámetros y enviar señal al backend para iniciar el bot
            const purchase = document.getElementById('purchase').value;
            const increment = document.getElementById('increment').value;
            const decrement = document.getElementById('decrement').value;
            const trigger = document.getElementById('trigger').value;
            const stopAtCycleEnd = stopAtCycleEndCheckbox.checked;

            fetch('/api/start-autobot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ purchase, increment, decrement, trigger, stopAtCycleEnd })
            })
            .then(response => response.json())
            .then(data => console.log('Bot started:', data))
            .catch(error => console.error('Error starting bot:', error));
        }
    }

    // Event listener para el botón START/STOP del bot
    if (startBtn) {
        startBtn.addEventListener('click', toggleBotState);
    }

    // Lógica para el botón RESET del bot
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            // Lógica para resetear el bot
            // Esto probablemente implicará una llamada al backend
            fetch('/api/reset-autobot', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    console.log('Bot reset:', data);
                    // Actualizar la UI después del reseteo si es necesario
                    document.getElementById('profit').textContent = '0.00';
                    document.getElementById('cycleprofit').textContent = '0.00';
                    document.getElementById('coverage').textContent = '0.00';
                    document.getElementById('cycle').textContent = '0';
                    document.getElementById('orq').textContent = '0';
                    // ... otros campos que necesiten resetearse
                })
                .catch(error => console.error('Error resetting bot:', error));
            alert('Bot ha sido reseteado.');
        });
    }

    // Lógica para las pestañas de historial de órdenes
    const orderTabs = document.querySelectorAll('.bg-gray-800.rounded.p-4 button');
    const orderList = document.getElementById('order-list');

    orderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            orderTabs.forEach(t => t.classList.remove('active-tab', 'border-white'));
            tab.classList.add('active-tab', 'border-white');
            const type = tab.id.replace('tab-', '');
            fetchOrderHistory(type);
        });
    });

    // Inicialmente activa la pestaña "All"
    const defaultTab = document.getElementById('tab-all');
    if (defaultTab) {
        defaultTab.classList.add('active-tab', 'border-white');
    }

    async function fetchOrderHistory(type) {
        orderList.innerHTML = '<p class="text-gray-400">Cargando órdenes...</p>';
        try {
            const response = await fetch(`/api/order-history?type=${type}`);
            const orders = await response.json();

            if (orders.length === 0) {
                orderList.innerHTML = '<p class="text-gray-400">No hay órdenes para este tipo.</p>';
                return;
            }

            orderList.innerHTML = ''; // Limpiar antes de añadir
            orders.forEach(order => {
                const orderDiv = document.createElement('div');
                orderDiv.className = 'bg-gray-700 p-2 rounded flex justify-between items-center';
                const statusColor = order.status === 'filled' ? 'text-green-400' :
                                   order.status === 'cancelled' ? 'text-red-400' : 'text-yellow-400';
                orderDiv.innerHTML = `
                    <div>
                        <p>${order.symbol} - ${order.side}</p>
                        <p class="text-xs text-gray-400">${new Date(order.time).toLocaleString()}</p>
                    </div>
                    <div>
                        <p>${order.amount} @ ${order.price}</p>
                        <p class="${statusColor}">${order.status.toUpperCase()}</p>
                    </div>
                `;
                orderList.appendChild(orderDiv);
            });
        } catch (error) {
            console.error('Error fetching order history:', error);
            orderList.innerHTML = '<p class="text-red-400">Error al cargar el historial de órdenes.</p>';
        }
    }

    // Cargar historial de órdenes al iniciar la sección (si "All" es la activa por defecto)
    fetchOrderHistory('all'); // Carga inicial
});