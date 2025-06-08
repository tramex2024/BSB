document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const emailInput = document.getElementById('email');
    const tokenInput = document.getElementById('token');
    const authButton = document.getElementById('auth-button');
    const authMessage = document.getElementById('auth-message');
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const darkModeToggle = document.querySelector('.dark-mode-toggle');

    // --- NEW API Key Modal Elements ---
    const apiIcon = document.querySelector('.fa-cogs'); // Assuming this is your API icon
    const apiModal = document.getElementById('api-modal');
    const apiCloseButton = apiModal.querySelector('.close-button');
    const apiForm = document.getElementById('api-form');
    const apiKeyInput = document.getElementById('api-key');
    const secretKeyInput = document.getElementById('secret-key');
    const apiMemoInput = document.getElementById('api-memo');
    const validateApiButton = document.getElementById('validate-api-button');
    const apiStatusMessage = document.getElementById('api-status-message');
    const connectionIndicator = document.getElementById('connection-indicator');
    const connectionText = document.getElementById('connection-text');

    // Backend URL for API key validation and storage
    // *** IMPORTANT: REPLACE THIS WITH YOUR RENDER BACKEND URL ***
    const BACKEND_API_URL = 'https://bsb-ppex.onrender.com';

    // Function to show a specific tab
    const showTab = (tabId) => {
        tabContents.forEach(content => {
            content.classList.remove('active');
        });
        navTabs.forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(`${tabId}-section`).classList.add('active');
        document.querySelector(`.nav-tab[data-tab="${tabId}"]`).classList.add('active');
    };

    // Check for existing token in localStorage for persistent login
    const userToken = localStorage.getItem('bsb_user_token');
    if (userToken) {
        console.log('User already logged in with token:', userToken);
        showTab('dashboard'); // Go to dashboard if already logged in
        authModal.style.display = 'none'; // Hide modal
    } else {
        authModal.style.display = 'flex'; // Show modal if not logged in
    }

    // Auth Form Submission
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value;
        const token = tokenInput.value;

        if (!token) { // First step: request token
            try {
                authMessage.textContent = 'Requesting token...';
                const response = await fetch(`${BACKEND_API_URL}/api/auth/request-token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await response.json();
                authMessage.textContent = data.message;
                if (response.ok) {
                    tokenInput.style.display = 'block';
                    authButton.textContent = 'Verify & Sign In';
                }
            } catch (error) {
                authMessage.textContent = 'Error requesting token. Please try again.';
                console.error('Error:', error);
            }
        } else { // Second step: verify token and sign in/up
            try {
                authMessage.textContent = 'Verifying token...';
                const response = await fetch(`${BACKEND_API_URL}/api/auth/verify-token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, token })
                });
                const data = await response.json();
                authMessage.textContent = data.message;

                if (response.ok && data.token) {
                    localStorage.setItem('bsb_user_token', data.token); // Store token
                    // Also store user ID and email if available from backend response for API keys
                    localStorage.setItem('bsb_user_id', data.user._id);
                    localStorage.setItem('bsb_user_email', data.user.email);

                    authModal.style.display = 'none'; // Hide modal
                    showTab('dashboard'); // Redirect to dashboard
                    console.log('Login successful:', data.user);
                }
            } catch (error) {
                authMessage.textContent = 'Error verifying token. Please try again.';
                console.error('Error:', error);
            }
        }
    });

    // Navigation Tabs
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = e.target.dataset.tab;
            showTab(tabId);
        });
    });

    // Dark/Lite Mode Toggle
    darkModeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        document.body.classList.toggle('lite-mode');
        // Save user preference to localStorage
        if (document.body.classList.contains('lite-mode')) {
            localStorage.setItem('theme', 'lite');
            darkModeToggle.classList.replace('fa-sun', 'fa-moon'); // Change icon to moon for dark mode
        } else {
            localStorage.setItem('theme', 'dark');
            darkModeToggle.classList.replace('fa-moon', 'fa-sun'); // Change icon to sun for light mode
        }
    });

    // Set initial theme based on localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'lite') {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('lite-mode');
        darkModeToggle.classList.replace('fa-sun', 'fa-moon');
    } else {
        document.body.classList.add('dark-mode');
        darkModeToggle.classList.replace('fa-moon', 'fa-sun');
    }

    // Placeholder for other icon functionalities (Login, Language, Users, Setting, API, Contact)
    document.querySelector('.fa-sign-in-alt').addEventListener('click', () => {
        if (!localStorage.getItem('bsb_user_token')) {
            authModal.style.display = 'flex';
        } else {
            alert('Already logged in. You can implement a logout feature here.');
            // Or show a user profile/logout modal
        }
    });

    // --- API Icon Click Event Listener ---
    apiIcon.addEventListener('click', () => {
        // Ensure user is logged in before showing API modal
        if (!localStorage.getItem('bsb_user_token')) {
            alert('Please sign in/up first to configure API keys.');
            authModal.style.display = 'flex'; // Show login modal
            return;
        }
        apiModal.style.display = 'flex'; // Show the API modal
        // Optionally fetch existing API keys for this user and pre-fill the form
        // (This would require another backend API endpoint)
    });

    // --- Close API Modal ---
    apiCloseButton.addEventListener('click', () => {
        apiModal.style.display = 'none';
        apiStatusMessage.textContent = ''; // Clear status message
        connectionIndicator.classList.remove('connected', 'disconnected'); // Clear indicator
        connectionText.textContent = '';
    });

    // Close modal if clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === apiModal) {
            apiModal.style.display = 'none';
            apiStatusMessage.textContent = '';
            connectionIndicator.classList.remove('connected', 'disconnected');
            connectionText.textContent = '';
        }
    });


    // --- API Form Submission for Validation and Storage ---
    apiForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const apiKey = apiKeyInput.value;
        const secretKey = secretKeyInput.value;
        const apiMemo = apiMemoInput.value;
        const userId = localStorage.getItem('bsb_user_id'); // Get user ID from local storage
        const userEmail = localStorage.getItem('bsb_user_email'); // Get user Email from local storage
        const token = localStorage.getItem('bsb_user_token'); // Get auth token for backend auth

        if (!userId || !userEmail || !token) {
            apiStatusMessage.textContent = 'Authentication error: User not logged in fully.';
            apiStatusMessage.style.color = 'red';
            return;
        }

        apiStatusMessage.textContent = 'Validating API keys...';
        apiStatusMessage.style.color = 'orange';
        connectionIndicator.classList.remove('connected', 'disconnected'); // Clear previous state
        connectionIndicator.style.backgroundColor = '#ccc'; // Grey during validation
        connectionText.textContent = '';


        try {
            // Send API keys to your backend for validation with BitMart and storage
            const response = await fetch(`${BACKEND_API_URL}/api/user/save-api-keys`, { // You'll create this new route in your backend
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // Send user's auth token for security
                },
                body: JSON.stringify({
                    userId,
                    email: userEmail,
                    apiKey,
                    secretKey,
                    apiMemo
                })
            });

            const data = await response.json();

            if (response.ok) {
                apiStatusMessage.textContent = data.message || 'API keys saved and validated successfully!';
                apiStatusMessage.style.color = 'green';
                connectionIndicator.classList.add('connected');
                connectionText.textContent = 'CONNECTED';
            } else {
                apiStatusMessage.textContent = data.message || 'Failed to validate or save API keys. Check your inputs.';
                apiStatusMessage.style.color = 'red';
                connectionIndicator.classList.add('disconnected');
                connectionText.textContent = 'DISCONNECTED';
            }
        } catch (error) {
            apiStatusMessage.textContent = 'Server error during API key validation. Please try again later.';
            apiStatusMessage.style.color = 'red';
            connectionIndicator.classList.add('disconnected');
            connectionText.textContent = 'DISCONNECTED';
            console.error('Error validating API keys:', error);
        }
    });

    // Ensure initial API icon is correctly selected if needed
    // You might need to add an ID to your API icon in HTML if it's not the only fa-cogs
    // For example: <i class="fas fa-cogs nav-icon" id="api-nav-icon"></i>
    // Then use: const apiIcon = document.getElementById('api-nav-icon');
});