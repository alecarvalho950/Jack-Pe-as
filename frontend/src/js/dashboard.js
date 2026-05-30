// URL de Produção no Render
const API_BASE_URL = "https://jack-pecas-backend.onrender.com";
// const API_BASE_URL = "http://localhost:3000";

async function loadStats() {
    // Captura o valor atual do dropdown de período (se existir no HTML)
    const periodSelect = document.getElementById('period-filter');
    const selectedPeriod = periodSelect ? periodSelect.value : '30days';

    // Seletores dos elementos do DOM
    const grid = document.getElementById('categories-grid');
    const totalElement = document.getElementById('total-count');
    
    // Elementos dos Cards de Analytics
    const totalVisitsEl = document.getElementById('total-visits');
    const uniqueUsersEl = document.getElementById('unique-users');
    const clickSaoRoqueEl = document.getElementById('click-sao-roque');
    const clickCotiaEl = document.getElementById('click-cotia');
    const clickIbiunaEl = document.getElementById('click-ibiuna');

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

        // Passa o período selecionado como Query Parameter para a API
        const response = await fetch(`${API_BASE_URL}/api/dashboard/stats?period=${selectedPeriod}`, {
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

        // 2. ATUALIZA OS CONTADORES GERAIS E ANALYTICS
        if (totalElement) totalElement.innerText = data.total || 0;
        
        if (data.analytics) {
            if (totalVisitsEl) totalVisitsEl.innerText = data.analytics.totalVisits ?? 0;
            if (uniqueUsersEl) uniqueUsersEl.innerText = data.analytics.uniqueUsers ?? 0;
            
            if (data.analytics.clicks) {
                if (clickSaoRoqueEl) clickSaoRoqueEl.innerText = data.analytics.clicks.sao_roque ?? 0;
                if (clickCotiaEl) clickCotiaEl.innerText = data.analytics.clicks.cotia ?? 0;
                if (clickIbiunaEl) clickIbiunaEl.innerText = data.analytics.clicks.ibiuna ?? 0;
            }
        }

        // 3. RENDERIZAÇÃO DO GRID DE PRODUTOS POR CATEGORIA
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
        if (grid) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-10">
                    <p class="text-red-500 font-bold uppercase tracking-widest text-sm">⚠️ Erro ao conectar com o servidor</p>
                    <button onclick="loadStats()" class="mt-4 px-4 py-2 bg-gray-800 rounded-lg text-xs text-accent hover:bg-gray-700 transition uppercase font-bold">Tentar novamente</button>
                </div>
            `;
        }
    }
}

// Inicialização do painel e registro do evento de mudança no filtro
document.addEventListener('DOMContentLoaded', () => {
    // Carrega os dados inicialmente
    loadStats();

    // Se houver um select de período no HTML, escuta as mudanças dele
    const periodSelect = document.getElementById('period-filter');
    if (periodSelect) {
        periodSelect.addEventListener('change', loadStats);
    }
});