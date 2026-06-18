// URL de Produção no Render
const API_BASE_URL = "https://jack-pecas-backend.onrender.com";
// const API_BASE_URL = "http://localhost:3000";

async function loadStats() {
    const periodSelect = document.getElementById('period-filter');
    const selectedPeriod = periodSelect ? periodSelect.value : '30days';

    const customContainer = document.getElementById('custom-date-container');
    const startDateEl = document.getElementById('start-date');
    const endDateEl = document.getElementById('end-date');

    if (selectedPeriod === 'custom') {
        if (customContainer) customContainer.className = "flex items-center gap-2 bg-gray-900 p-1.5 border border-gray-800 rounded-lg text-xs";
    } else {
        if (customContainer) customContainer.className = "hidden";
    }

    // Seletores Principais
    const totalElement = document.getElementById('total-count');
    const totalVisitsEl = document.getElementById('total-visits');
    const uniqueUsersEl = document.getElementById('unique-users');
    
    // Cliques de Lojas (Analytics)
    const clickSaoRoqueEl = document.getElementById('click-sao-roque');
    const clickCotiaEl = document.getElementById('click-cotia');
    const clickIbiunaEl = document.getElementById('click-ibiuna');

    // Containers de listagem
    const categoriesTreeContainer = document.getElementById('categories-tree-container');
    const stockTableBody = document.getElementById('stock-table-body');

    // Elementos de cards de estoque totalizadores superiores
    const stSR = document.getElementById('stock-total-sr');
    const stCO = document.getElementById('stock-total-co');
    const stIB = document.getElementById('stock-total-ib');
    const stGeral = document.getElementById('stock-total-geral');

    const compareCard = document.getElementById('compare-card');
    const compareTitle = document.getElementById('compare-title');
    const compareVisits = document.getElementById('compare-visits');
    const compareUsers = document.getElementById('compare-users');

    // Setters de Carregamento Visual
    if (totalElement) totalElement.innerText = "...";
    if (totalVisitsEl) totalVisitsEl.innerText = "...";
    if (uniqueUsersEl) uniqueUsersEl.innerText = "...";
    if (clickSaoRoqueEl) clickSaoRoqueEl.innerText = "...";
    if (clickCotiaEl) clickCotiaEl.innerText = "...";
    if (clickIbiunaEl) clickIbiunaEl.innerText = "...";

    try {
        const token = localStorage.getItem('admin_token');
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
            throw new Error('Falha ao carregar dados do servidor');
        }

        const data = await response.json();

        // 1. Totalizadores de Linha de Produtos Ativos
        if (totalElement) totalElement.innerText = data.total || 0;
        
        // 2. Renderização de Tráfego (Analytics)
        if (data.analytics) {
            if (totalVisitsEl) totalVisitsEl.innerText = data.analytics.totalVisits ?? 0;
            if (uniqueUsersEl) uniqueUsersEl.innerText = data.analytics.uniqueUsers ?? 0;
            
            if (data.analytics.stores) {
                if (clickSaoRoqueEl) clickSaoRoqueEl.innerText = data.analytics.stores.sao_roque ?? 0;
                if (clickCotiaEl) clickCotiaEl.innerText = data.analytics.stores.cotia ?? 0;
                if (clickIbiunaEl) clickIbiunaEl.innerText = data.analytics.stores.ibiuna ?? 0;
            }

            // Bloco de comparação temporal
            if (data.analytics.compare && data.analytics.compare.hasCompare) {
                if (compareCard) compareCard.classList.remove('hidden');
                if (selectedPeriod === 'today' && compareTitle) compareTitle.innerText = "📊 Histórico de Ontem";
                else if (selectedPeriod === '15days' && compareTitle) compareTitle.innerText = "📊 15 Dias Anteriores";
                else if (compareTitle) compareTitle.innerText = "📊 30 Dias Anteriores";

                if (compareVisits) compareVisits.innerText = data.analytics.compare.totalVisitsCompare ?? 0;
                if (compareUsers) compareUsers.innerText = data.analytics.compare.uniqueUsersCompare ?? 0;
            } else {
                if (compareCard) compareCard.classList.add('hidden');
            }
        }

        // Variáveis para somar o estoque total da operação inteira
        let totalGeralSR = 0;
        let totalGeralCO = 0;
        let totalGeralIB = 0;

        // Limpa os containers antes de renderizar
        if (categoriesTreeContainer) categoriesTreeContainer.innerHTML = "";
        if (stockTableBody) stockTableBody.innerHTML = "";

        const statsList = data.catalogStats || [];

        if (statsList.length === 0) {
            if (categoriesTreeContainer) {
                categoriesTreeContainer.innerHTML = `<p class="text-xs text-gray-500 italic p-4 col-span-full text-center">Nenhum produto cadastrado encontrado.</p>`;
            }
            if (stockTableBody) {
                stockTableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500 italic">Sem registros de estoque físico.</td></tr>`;
            }
        } else {
            statsList.forEach(cat => {
                // Acumula os estoques para os cards superiores
                totalGeralSR += cat.stock.SaoRoque || 0;
                totalGeralCO += cat.stock.Cotia || 0;
                totalGeralIB += cat.stock.Ibiuna || 0;

                // 3. Renderização do Mosaico (Produtos por Categoria e Subcategoria)
                if (categoriesTreeContainer) {
                    let subHtml = "";
                    if (cat.subcategories && cat.subcategories.length > 0) {
                        cat.subcategories.forEach(sub => {
                            subHtml += `
                                <div class="flex justify-between items-center text-xs text-gray-400 pl-4 border-l border-gray-800 py-1 hover:text-white transition">
                                    <span>↳ ${sub.name}</span>
                                    <span class="bg-gray-800/60 font-mono text-[11px] px-2 py-0.5 rounded text-gray-400">${sub.products}</span>
                                </div>
                            `;
                        });
                    } else {
                        subHtml = '<p class="text-[11px] text-gray-600 italic pl-4">Sem subcategorias</p>';
                    }

                    categoriesTreeContainer.innerHTML += `
                        <div class="bg-[#111827] p-4 rounded-xl border border-gray-800 shadow-md">
                            <div class="flex justify-between items-center border-b border-gray-800/50 pb-2 mb-2">
                                <h4 class="text-sm font-black text-white uppercase tracking-wider">${cat.name}</h4>
                                <span class="bg-accent/10 border border-accent/20 text-accent font-mono text-xs px-2.5 py-0.5 rounded-full font-bold">${cat.totalProducts} SKUs</span>
                            </div>
                            <div class="space-y-1 mt-2">${subHtml}</div>
                        </div>
                    `;
                }

                // 4. Renderização da Tabela (Estoque Físico por Unidade)
                if (stockTableBody) {
                    stockTableBody.innerHTML += `
                        <tr class="border-b border-gray-800/40 hover:bg-gray-900/40 transition">
                            <td class="p-3 font-bold text-gray-300">${cat.name}</td>
                            <td class="p-3 text-center font-mono text-gray-400">${(cat.stock.SaoRoque || 0).toLocaleString('pt-BR')}</td>
                            <td class="p-3 text-center font-mono text-gray-400">${(cat.stock.Cotia || 0).toLocaleString('pt-BR')}</td>
                            <td class="p-3 text-center font-mono text-gray-400">${(cat.stock.Ibiuna || 0).toLocaleString('pt-BR')}</td>
                            <td class="p-3 text-right font-mono font-black text-white">${(cat.stock.total || 0).toLocaleString('pt-BR')}</td>
                        </tr>
                    `;
                }
            });
        }

        // Atualiza os Cards Superiores de Balanço de Peças Total
        if (stSR) stSR.innerText = totalGeralSR.toLocaleString('pt-BR');
        if (stCO) stCO.innerText = totalGeralCO.toLocaleString('pt-BR');
        if (stIB) stIB.innerText = totalGeralIB.toLocaleString('pt-BR');
        if (stGeral) stGeral.innerText = (totalGeralSR + totalGeralCO + totalGeralIB).toLocaleString('pt-BR');

    } catch (err) {
        console.error("Erro geral no carregamento do painel:", err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    const periodSelect = document.getElementById('period-filter');
    if (periodSelect) {
        periodSelect.addEventListener('change', loadStats);
    }
});