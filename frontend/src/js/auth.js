const loginForm = document.getElementById('login-form');
const passwordInput = document.getElementById('password');
const emailInput = document.getElementById('email');
const errorMsg = document.getElementById('error');

// --- LIMPEZA DE CACHE E BUG DE SENHA PREENCHIDA ---
window.onload = () => {
    // Limpa os campos explicitamente ao carregar a página
    emailInput.value = '';
    passwordInput.value = '';
    
    // Pequeno delay para enganar o preenchimento automático do Chrome/Edge
    setTimeout(() => {
        passwordInput.value = '';
    }, 100);
};

// --- FUNÇÃO VER SENHA ---
const toggleBtn = document.getElementById('toggle-password');
const eyeIcon = document.getElementById('eye-icon');

toggleBtn.addEventListener('click', () => {
    // Inverte o tipo do input
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    
    // Troca o ícone (opcional: você pode usar ícones da Heroicons ou FontAwesome)
    eyeIcon.textContent = isPassword ? '🔒' : '👁️';
});

// Ajuste no Logout (Dica extra)
// Certifique-se que sua função de logout no dashboard.html faça isso:
function logout() {
    localStorage.removeItem('admin_token');
    // Limpa o histórico de navegação para evitar o botão "voltar"
    window.location.replace('login.html'); 
}

// Elementos de Feedback
const rulesList = document.getElementById('rules');
const passwordSuccess = document.getElementById('password-success');

// Elementos individuais da lista
const rules = {
    length: document.getElementById('rule-length'),
    upper: document.getElementById('rule-upper'),
    number: document.getElementById('rule-number'),
    special: document.getElementById('rule-special'),
};

// Funções de validação (Regex)
const criteria = {
    length: (val) => val.length >= 8,
    upper: (val) => /[A-Z]/.test(val),
    number: (val) => /[0-9]/.test(val),
    special: (val) => /[!@#$%^&*(),.?":{}|<>]/.test(val),
};

// 1. Validação em Tempo Real
passwordInput.addEventListener('input', () => {
    const val = passwordInput.value;
    let allValid = true;

    // Percorre cada critério e atualiza a cor individualmente
    Object.keys(criteria).forEach(key => {
        const isValid = criteria[key](val);
        
        if (isValid) {
            rules[key].classList.replace('opacity-80', 'text-green-400');
            rules[key].classList.add('font-bold');
        } else {
            rules[key].classList.replace('text-green-400', 'opacity-80');
            rules[key].classList.remove('font-bold');
            allValid = false; 
        }
    });

    // 2. Lógica de troca: Lista de Regras vs. Mensagem de Sucesso
    if (allValid && val.length > 0) {
        rulesList.classList.add('hidden');
        passwordSuccess.classList.remove('hidden');
    } else {
        rulesList.classList.remove('hidden');
        passwordSuccess.classList.add('hidden');
    }
});

// 3. Envio do Formulário para o Backend
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Limpa mensagens de erro anteriores
    errorMsg.classList.add('hidden');

    const loginData = {
        email: emailInput.value,
        password: passwordInput.value
    };

    try {
        // Chamada para o seu servidor Node.js
        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(loginData)
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('admin_token', 'autenticado'); 
            
            // Troca a cor do erro para verde e mostra mensagem de sucesso
            errorMsg.textContent = 'Login realizado com sucesso! Redirecionando...';
            errorMsg.classList.remove('hidden', 'text-red-400');
            errorMsg.classList.add('text-green-400');

            // Aguarda 1.5 segundos antes de mudar de página
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
            
        } else {
            // Se der erro, garante que a cor volte para vermelho
            errorMsg.classList.add('text-red-400');
            errorMsg.classList.remove('text-green-400');
            errorMsg.textContent = data.message || 'Erro ao realizar login.';
            errorMsg.classList.remove('hidden');
        }
    } catch (err) {
        errorMsg.textContent = 'Servidor offline. Certifique-se de rodar o backend.';
        errorMsg.classList.remove('hidden');
    }
});