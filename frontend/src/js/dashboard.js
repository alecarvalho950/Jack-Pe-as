// URL de Produção no Railway
const API_BASE_URL = "https://jack-pe-as-production.up.railway.app";

async function loadStats() {
  try {
    // Recupera o token para caso a rota seja protegida
    const token = localStorage.getItem('admin_token');

    const response = await fetch(`${API_BASE_URL}/api/dashboard/stats`, {
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

    // Atualiza o contador total
    const totalElement = document.getElementById('total-count');
    if (totalElement) totalElement.innerText = data.total;

    const grid = document.querySelector('.grid');
    if (!grid) return;

    grid.innerHTML = ''; // Limpa o grid para reconstruir

    // Pegamos as chaves (nomes das categorias)
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
    const grid = document.querySelector('.grid');
    if (grid) grid.innerHTML = '<p class="col-span-full text-red-500 text-center">Erro ao conectar com o servidor.</p>';
  }
}

// Inicia a carga de dados
document.addEventListener('DOMContentLoaded', loadStats);