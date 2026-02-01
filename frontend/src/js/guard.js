(function() {
    const token = localStorage.getItem('admin_token');
    
    // Se não houver token, manda de volta para o login IMEDIATAMENTE
    if (!token || token !== 'autenticado') {
        window.location.href = 'login.html';
    }
})();