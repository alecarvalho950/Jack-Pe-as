// Ativação automática de abas do Menu Lateral baseado na URL atual
document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname.split('/').pop() || 'dashboard.html';
    const navLinks = document.querySelectorAll('#main-nav a');

    navLinks.forEach(link => {
        const linkHref = link.getAttribute('href');
        
        // Se o link corresponder à página atual
        if (currentPath === linkHref) {
            // Aplica as classes do Container Ativo (Amarelo)
            link.className = "group flex items-center gap-3 p-3 rounded-xl bg-accent text-primary border border-transparent transition-all duration-200 font-bold";
            
            // Ajusta o bloco do ícone para ficar azul escuro por dentro
            const iconContainer = link.querySelector('div');
            if (iconContainer) {
                iconContainer.className = "flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-accent transition-colors";
            }
            
            // Força a cor do texto do SVG interno
            const svg = link.querySelector('svg');
            if (svg) svg.classList.remove('text-gray-500');
        }
    });
});