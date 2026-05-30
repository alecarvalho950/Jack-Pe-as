// URL do seu servidor no Render
const API_BASE_URL = "https://jack-pecas-backend.onrender.com";
//const API_BASE_URL = "http://localhost:3000";
/**
 * Envia os dados de acesso de forma silenciosa para o Back-end
 * @param {string} type - 'pageview' ou 'click_whatsapp'
 * @param {string} location - 'sao_roque', 'cotia', 'ibiuna' ou 'geral'
 */
async function sendAnalyticsEvent(type, location = 'geral') {
    try {
        // Verifica no localStorage se o usuário já visitou o site antes
        const hasVisited = localStorage.getItem('jack_catalog_visited');
        let isNewUser = false;

        // Se for um acesso à página (pageview) e for a primeira vez do cara
        if (type === 'pageview' && !hasVisited) {
            isNewUser = true;
            localStorage.setItem('jack_catalog_visited', 'true');
        }

        // Envia os dados para o back-end sem travar a navegação do cliente
        await fetch(`${API_BASE_URL}/api/analytics`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: type,         // 'pageview' ou 'click_whatsapp'
                location: location, // 'sao_roque', 'cotia', 'ibiuna'
                isNewUser: isNewUser
            })
        });
    } catch (error) {
        // Falha silenciosa para não quebrar o site do cliente se o servidor oscilar
        console.error("Analytics Error:", error);
    }
}

// Roda automaticamente assim que o catálogo é aberto
document.addEventListener('DOMContentLoaded', () => {
    // 1. Registra a visita na página (Pageview)
    sendAnalyticsEvent('pageview');

    // 2. Captura os cliques nos botões do WhatsApp automaticamente
    // (Ajuste os seletores ou IDs de acordo com os seus botões do WhatsApp)
    setupWhatsAppClickTrackers();
});

/**
 * Procura os botões do WhatsApp na tela e adiciona o evento de clique neles
 */
function setupWhatsAppClickTrackers() {
    // Exemplo usando seletores hipotéticos. Você pode adaptar para a sua estrutura!
    const btnSaoRoque = document.getElementById('btn-whatsapp-saoroque');
    const btnCotia = document.getElementById('btn-whatsapp-cotia');
    const btnIbiuna = document.getElementById('btn-whatsapp-ibiuna');

    if (btnSaoRoque) {
        btnSaoRoque.addEventListener('click', () => sendAnalyticsEvent('click_whatsapp', 'sao_roque'));
    }
    if (btnCotia) {
        btnCotia.addEventListener('click', () => sendAnalyticsEvent('click_whatsapp', 'cotia'));
    }
    if (btnIbiuna) {
        btnIbiuna.addEventListener('click', () => sendAnalyticsEvent('click_whatsapp', 'ibiuna'));
    }
}