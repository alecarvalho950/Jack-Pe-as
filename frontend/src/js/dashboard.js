 async function loadStats() {
  try {
    const response = await fetch('http://localhost:3000/api/dashboard/stats');
    const data = await response.json();

    // Atualiza o contador total
    document.getElementById('total-count').innerText = data.total;

    const grid = document.querySelector('.grid');
    grid.innerHTML = ''; // Limpa o grid para reconstruir

    // Pegamos as chaves (nomes das categorias) do objeto retornado pelo servidor
    const categoryNames = Object.keys(data.categories);

    if (categoryNames.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-gray-500 italic">Nenhuma categoria cadastrada.</p>';
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
          <p class="text-4xl font-black mt-4">${count}</p>
          <p class="text-xs text-gray-500 mt-1 uppercase">Produtos na categoria</p>
        </div>
      `;
    });
  } catch (err) {
    console.error("Erro ao carregar stats", err);
  }
}

  loadStats();