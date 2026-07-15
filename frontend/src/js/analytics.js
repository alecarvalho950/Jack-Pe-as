// URL do seu servidor no Render
const API_BASE_URL = "https://api.jackpecas.com.br";

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
        console.log(`📊 Evento enviado com sucesso: ${type} -> ${location}`);
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
    setupWhatsAppClickTrackers();
});

/**
 * Procura os links do WhatsApp baseando-se no texto da mensagem contida no HREF
 */
function setupWhatsAppClickTrackers() {
    // Busca todas as tags <a> dentro do container de menu do WhatsApp
    const whatsappLinks = document.querySelectorAll('#whatsapp-menu a');

    whatsappLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        
        // Mapeia a cidade baseando-se no texto de cada link do seu HTML
        let location = null;
        if (href.includes('São%20Roque')) {
            location = 'sao_roque';
        } else if (href.includes('Cotia')) {
            location = 'cotia';
        } else if (href.includes('Ibiúna')) {
            location = 'ibiuna';
        }

        // Se identificou a localização, adiciona o escutador de clique
        if (location) {
            link.addEventListener('click', () => {
                sendAnalyticsEvent('click_whatsapp', location);
            });
        }
    });
}