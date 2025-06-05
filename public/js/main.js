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
        // In a real app, you'd send this token to your backend to validate
        // and fetch user data. For this example, we'll just assume login.
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
                const response = await fetch('https://bsb-backend-t441.onrender.com', { // Replace with your Render URL
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
                const response = await fetch('https://bsb-backend-t441.onrender.com', { // Replace with your Render URL
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, token })
                });
                const data = await response.json();
                authMessage.textContent = data.message;

                if (response.ok && data.token) {
                    localStorage.setItem('bsb_user_token', data.token); // Store token
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
    // You would implement separate functions or modals for these
    document.querySelector('.fa-sign-in-alt').addEventListener('click', () => {
        if (!localStorage.getItem('bsb_user_token')) {
            authModal.style.display = 'flex';
        } else {
            alert('Already logged in. You can implement a logout feature here.');
            // Or show a user profile/logout modal
        }
    });
    // Add similar event listeners for other icons
});