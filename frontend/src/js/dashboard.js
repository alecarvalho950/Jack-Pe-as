// URL de Produção no Render
const API_BASE_URL = "https://jack-pecas-backend.onrender.com";
// const API_BASE_URL = "http://localhost:3000";

async function loadStats() {
    // Captura os elementos de filtro no HTML
    const periodSelect = document.getElementById('period-filter');
    const selectedPeriod = periodSelect ? periodSelect.value : '30days';

    const customContainer = document.getElementById('custom-date-container');
    const startDateEl = document.getElementById('start-date');
    const endDateEl = document.getElementById('end-date');

    // Controla a visibilidade dos campos de data manual
    if (selectedPeriod === 'custom') {
        if (customContainer) customContainer.className = "flex items-center gap-2 bg-gray-900 p-1.5 border border-gray-800 rounded-lg text-xs";
    } else {
        if (customContainer) customContainer.className = "hidden";
    }

    // Seletores dos elementos do DOM
    const grid = document.getElementById('categories-grid');
    const totalElement = document.getElementById('total-count');
    
    // Elementos dos Cards de Analytics
    const totalVisitsEl = document.getElementById('total-visits');
    const uniqueUsersEl = document.getElementById('unique-users');
    const clickSaoRoqueEl = document.getElementById('click-sao-roque');
    const clickCotiaEl = document.getElementById('click-cotia');
    const clickIbiunaEl = document.getElementById('click-ibiuna');

    // Elementos do Bloco Separado de Comparação
    const compareCard = document.getElementById('compare-card');
    const compareTitle = document.getElementById('compare-title');
    const compareVisits = document.getElementById('compare-visits');
    const compareUsers = document.getElementById('compare-users');

    // 1. ESTADO DE CARREGAMENTO (SPINNER E ACENOS)
    if (grid) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 gap-4">
                <span class="loader"></span>
                <p class="text-gray-400 animate-pulse font-bold text-sm tracking-widest uppercase">Carregando Estatísticas...</p>
            </div>
        `;
    }
    
    if (totalElement) totalElement.innerText = "...";
    if (totalVisitsEl) totalVisitsEl.innerText = "...";
    if (uniqueUsersEl) uniqueUsersEl.innerText = "...";
    if (clickSaoRoqueEl) clickSaoRoqueEl.innerText = "...";
    if (clickCotiaEl) clickCotiaEl.innerText = "...";
    if (clickIbiunaEl) clickIbiunaEl.innerText = "...";

    try {
        const token = localStorage.getItem('admin_token');

        // Contrói a string de URL passando as datas se for o caso
        let url = `${API_BASE_URL}/api/dashboard/stats?period=${selectedPeriod}`;
        if (selectedPeriod === 'custom' && startDateEl?.value && endDateEl?.value) {
            url += `&startDate=${startDateEl.value}&endDate=${endDateEl.value}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                window.location.href = 'login.html';
                return;
            }
            throw new Error('Falha ao carregar estatísticas');
        }

        const data = await response.json();

        // 2. INJETA OS NÚMEROS LIMPOS SEM TEXTOS ADICIONAIS OU PORCENTAGENS
        if (totalElement) totalElement.innerText = data.total || 0;
        
        if (data.analytics) {
            if (totalVisitsEl) totalVisitsEl.innerText = data.analytics.totalVisits ?? 0;
            if (uniqueUsersEl) uniqueUsersEl.innerText = data.analytics.uniqueUsers ?? 0;
            
            if (data.analytics.clicks) {
                if (clickSaoRoqueEl) clickSaoRoqueEl.innerText = data.analytics.clicks.sao_roque ?? 0;
                if (clickCotiaEl) clickCotiaEl.innerText = data.analytics.clicks.cotia ?? 0;
                if (clickIbiunaEl) clickIbiunaEl.innerText = data.analytics.clicks.ibiuna ?? 0;
            }

            // 3. GERENCIA O CARD COMPARAÇÃO SEPARADO NA DIREITA
            if (data.analytics.compare && data.analytics.compare.hasCompare) {
                if (compareCard) compareCard.classList.remove('hidden');
                
                if (selectedPeriod === 'today') {
                    if (compareTitle) compareTitle.innerText = "📊 Histórico de Ontem";
                } else if (selectedPeriod === '15days') {
                    if (compareTitle) compareTitle.innerText = "📊 15 Dias Anteriores";
                } else {
                    if (compareTitle) compareTitle.innerText = "📊 30 Dias Anteriores";
                }

                if (compareVisits) compareVisits.innerText = data.analytics.compare.totalVisitsCompare ?? 0;
                if (compareUsers) compareUsers.innerText = data.analytics.compare.uniqueUsersCompare ?? 0;
            } else {
                // Oculta completamente o card se for Período Personalizado
                if (compareCard) compareCard.classList.add('hidden');
            }
        }

        // 4. RENDERIZAÇÃO DO GRID DE PRODUTOS POR CATEGORIA
        if (!grid) return;
        grid.innerHTML = '';

        const categoryNames = Object.keys(data.categories || {});

        if (categoryNames.length === 0) {
            grid.innerHTML = '<p class="col-span-full text-gray-500 italic text-center py-10">Nenhuma categoria encontrada.</p>';
            return;
        }

        categoryNames.forEach(catName => {
            const count = data.categories[catName];
            
            grid.innerHTML += `
                <div class="bg-[#111827] p-6 rounded-xl border border-gray-800 hover:border-accent transition group shadow-lg">
                    <div class="flex justify-between items-start">
                        <h3 class="text-gray-400 text-sm font-bold uppercase tracking-wider group-hover:text-accent transition">${catName}</h3>
                        <span class="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full border border-accent/20">Ativo</span>
                    </div>
                    <p class="text-4xl font-black mt-4 text-white">${count}</p>
                    <p class="text-xs text-gray-500 mt-1 uppercase">Produtos na categoria</p>
                </div>
            `;
        });
    } catch (err) {
        console.error("Erro ao carregar stats:", err);
    }
}

// Inicialização do painel e registro do evento de mudança no filtro
document.addEventListener('DOMContentLoaded', () => {
    loadStats();

    const periodSelect = document.getElementById('period-filter');
    if (periodSelect) {
        periodSelect.addEventListener('change', loadStats);
    }
});