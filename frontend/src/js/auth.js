const loginForm = document.getElementById('login-form');
const passwordInput = document.getElementById('password');
const emailInput = document.getElementById('email');
const errorMsg = document.getElementById('error');
const toggleBtn = document.getElementById('toggle-password');
const eyeIcon = document.getElementById('eye-icon');
const rulesList = document.getElementById('rules');
const passwordSuccess = document.getElementById('password-success');

const rules = {
    length: document.getElementById('rule-length'),
    upper: document.getElementById('rule-upper'),
    number: document.getElementById('rule-number'),
    special: document.getElementById('rule-special'),
};

const criteria = {
    length: (val) => val.length >= 8,
    upper: (val) => /[A-Z]/.test(val),
    number: (val) => /[0-9]/.test(val),
    special: (val) => /[!@#$%^&*(),.?":{}|<>]/.test(val),
};

window.onload = () => {
    emailInput.value = '';
    passwordInput.value = '';
    setTimeout(() => { passwordInput.value = ''; }, 100);
};

toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    
    const iconName = isPassword ? 'eye-off' : 'eye';
    eyeIcon.setAttribute('data-lucide', iconName);
    lucide.createIcons(); 
});

passwordInput.addEventListener('input', () => {
    const val = passwordInput.value;
    let allValid = true;

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

    if (allValid && val.length > 0) {
        rulesList.classList.add('hidden');
        passwordSuccess.classList.remove('hidden');
    } else {
        rulesList.classList.remove('hidden');
        passwordSuccess.classList.add('hidden');
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.classList.add('hidden');
    
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = "Autenticando...";

    try {
        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: emailInput.value,
                password: passwordInput.value
            })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('admin_token', data.token);
            localStorage.setItem('login_time', new Date().getTime());

            errorMsg.textContent = 'Acesso autorizado! Redirecionando...';
            errorMsg.classList.replace('text-red-400', 'text-green-400');
            errorMsg.classList.remove('hidden');

            setTimeout(() => { window.location.replace('dashboard.html'); }, 1200);
        } else {
            throw new Error(data.message || 'Credenciais inválidas.');
        }
    } catch (err) {
        errorMsg.textContent = err.message === 'Failed to fetch' 
            ? 'Servidor offline.' 
            : err.message;
        errorMsg.classList.replace('text-green-400', 'text-red-400');
        errorMsg.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.innerText = "Entrar no Painel";
    }
});