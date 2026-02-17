(function() {
    const token = localStorage.getItem('admin_token');
    const loginTime = localStorage.getItem('login_time');
    const maxSession = 8 * 60 * 60 * 1000; // 8 horas

    const now = new Date().getTime();
    const isExpired = (now - loginTime) > maxSession;

    const isTokenInvalid = !token || token === 'autenticado' || !token.includes('.');

    if (isTokenInvalid || isExpired) {
        console.warn("Sessão inválida ou expirada. Limpando dados...");
        localStorage.clear(); 
        window.location.replace('login.html');
    }
})();

document.addEventListener("DOMContentLoaded", function() {
    // 1. Pega o nome do arquivo atual (ex: products.html)
    const path = window.location.pathname;
    const page = path.split("/").pop() || "dashboard.html"; 

    // 2. Seleciona todos os links da navegação
    const menuLinks = document.querySelectorAll('nav a');

    menuLinks.forEach(link => {
        const href = link.getAttribute('href');

        // 3. Se o link for a página atual, aplica o estilo "Ativo" (Amarelo)
        if (page === href) {
            // Estilo do link principal
            link.classList.add('bg-accent', 'text-black', 'font-bold', 'shadow-lg', 'shadow-accent/10');
            link.classList.remove('text-gray-400', 'hover:bg-gray-800/50', 'hover:text-white');

            // Ajusta o container do ícone (quadradinho)
            const iconContainer = link.querySelector('div');
            if (iconContainer) {
                iconContainer.classList.remove('bg-gray-800/40');
                iconContainer.classList.add('bg-black/10');
            }

            // Ajusta o ícone SVG em si
            const svg = link.querySelector('svg');
            if (svg) {
                svg.classList.remove('text-gray-500');
                svg.setAttribute('stroke-width', '2.5'); // Deixa o ícone ativo um pouco mais grosso
            }
        }
    });
});

function logout() {
    localStorage.clear(); // Limpa token e o login_time de uma vez
    window.location.replace('login.html'); 
}