const loginForm = document.getElementById('login-form');
const passwordInput = document.getElementById('password');
const emailInput = document.getElementById('email');
const errorMsg = document.getElementById('error');
const errorText = document.getElementById('error-text');
const toggleBtn = document.getElementById('toggle-password');
const eyeIcon = document.getElementById('eye-icon');

// URL DO SEU BACKEND NO RAILWAY
const API_BASE_URL = "https://jack-pe-as-production.up.railway.app";

// Alternar visibilidade da senha
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        
        // Atualiza o ícone do Lucide
        const iconName = isPassword ? 'eye-off' : 'eye';
        eyeIcon.setAttribute('data-lucide', iconName);
        lucide.createIcons(); 
    });
}

// Evento de Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Esconde erro anterior
    errorMsg.classList.add('hidden');
    
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    
    submitBtn.disabled = true;
    submitBtn.innerText = "Autenticando...";

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: emailInput.value,
                password: passwordInput.value
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Salva o token e o tempo de login
            localStorage.setItem('admin_token', data.token);
            localStorage.setItem('login_time', new Date().getTime());

            // Feedback visual de sucesso
            errorMsg.classList.remove('hidden', 'text-red-400', 'bg-red-400/10', 'border-red-400/20');
            errorMsg.classList.add('text-green-400', 'bg-green-400/10', 'border-green-400/20');
            errorText.textContent = 'Acesso autorizado! Redirecionando...';

            // Redireciona para o dashboard
            setTimeout(() => { 
                window.location.replace('dashboard.html'); 
            }, 1200);
            
        } else {
            throw new Error(data.message || 'E-mail ou senha incorretos.');
        }

    } catch (err) {
        // Trata erro de conexão ou credenciais
        errorText.textContent = err.message === 'Failed to fetch' 
            ? 'Não foi possível conectar ao servidor.' 
            : err.message;
            
        errorMsg.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
});