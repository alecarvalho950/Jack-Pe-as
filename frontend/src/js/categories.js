let currentSubcategories = [];
let editingCatId = null; // Agora armazenará a String do _id
let deleteCatId = null; 
let subToRemove = null; 
let allProducts = [];
const API_BASE_URL = "https://jack-pe-as-production.up.railway.app";

document.addEventListener('DOMContentLoaded', () => {
    loadCategoriesList();
});

// --- CARREGAMENTO E RENDERIZAÇÃO ---

async function loadCategoriesList() {
    const container = document.getElementById('categories-list-display');
    if (container) {
        container.innerHTML = `
            <div class="loading-state col-span-full">
                <span class="loader"></span>
                <p class="text-gray-400 animate-pulse">Buscando categorias no servidor...</p>
            </div>
        `;
    }
    try {
        const token = localStorage.getItem('admin_token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const [resCat, resProd] = await Promise.all([
            fetch(`${API_BASE_URL}/api/categories`),
            fetch(`${API_BASE_URL}/api/products?limit=99999`, { headers }) 
        ]);
        
        const categories = await resCat.json();
        const productData = await resProd.json();
        
        // AJUSTE CRITICAL: Garante que allProducts seja um Array
        allProducts = productData.products ? productData.products : productData;
        
        if(!container) return;
        container.innerHTML = '';

        categories.forEach(cat => {
    const data = encodeURIComponent(JSON.stringify(cat));
    const totalInCat = allProducts.filter(p => p.category === cat.name).length;

    container.innerHTML += `
        <div class="bg-[#111827] p-6 rounded-2xl border border-gray-800 hover:border-accent/40 transition group relative shadow-lg">
            <div class="flex justify-between items-start mb-6">
                <div>
                    <h3 class="text-xl font-bold text-white flex items-center gap-2">
                        ${cat.name}
                        <span class="text-[10px] bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full">${totalInCat} itens</span>
                    </h3>
                </div>
                <div class="flex gap-2">
                    <button onclick="editCategory('${data}')" 
                        class="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl hover:bg-blue-500 hover:text-white transition-all duration-300" 
                        title="Editar Categoria">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>

                    <button onclick="askDeleteCat('${cat._id}', '${cat.name}')" 
                        class="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all duration-300" 
                        title="Excluir Categoria">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                ${cat.subcategories.map(sub => {
                    const count = allProducts.filter(p => p.category === cat.name && p.subcategory === sub).length;
                    return `
                        <div class="bg-gray-800/40 border border-gray-700/50 p-2 rounded-lg flex justify-between items-center">
                            <span class="text-xs text-gray-400">${sub}</span>
                            <span class="text-[10px] font-bold ${count > 0 ? 'text-accent' : 'text-gray-600'}">${count}</span>
                        </div>`;
                }).join('')}
            </div>
        </div>`;
});
    } catch (err) { 
        console.error("Erro ao carregar categorias:", err); 
    }
}

function renderSubTags() {
    const container = document.getElementById('sub-tags');
    const catName = document.getElementById('cat-name').value;

    container.innerHTML = currentSubcategories.map(sub => {
        const count = allProducts.filter(p => p.category === catName && p.subcategory === sub).length;
        return `
            <span class="bg-gray-800 text-white border ${count > 0 ? 'border-accent/30' : 'border-gray-700'} px-3 py-1.5 rounded-lg text-sm flex items-center gap-3 font-bold">
                ${sub} 
                <span class="text-[10px] bg-black/30 px-1.5 rounded text-accent">${count}</span>
                <button onclick="askRemoveSub('${sub}')" class="text-gray-500 hover:text-red-500 transition">×</button>
            </span>`;
    }).join('');
}

function askRemoveSub(subName) {
    const catName = document.getElementById('cat-name').value;
    const count = allProducts.filter(p => p.category === catName && p.subcategory === subName).length;

    if (count > 0) {
        showLockedAlert(`Não é possível remover "<strong>${subName}</strong>".<br>Existem <strong>${count}</strong> produtos cadastrados nesta subcategoria.`);
        return;
    }

    subToRemove = subName;
    document.getElementById('confirm-msg').innerHTML = `A subcategoria <strong>${subName}</strong> não possui produtos. Deseja removê-la da lista?`;
    document.getElementById('custom-confirm').classList.replace('hidden', 'flex');
}

function showLockedAlert(msg) {
    document.getElementById('alert-msg').innerHTML = msg;
    document.getElementById('alert-modal').classList.replace('hidden', 'flex');
}

function closeAlert() {
    document.getElementById('alert-modal').classList.replace('flex', 'hidden');
}

function askDeleteCat(id, name) {
    const count = allProducts.filter(p => p.category === name).length;
    
    if (count > 0) {
        showLockedAlert(`A categoria "<strong>${name}</strong>" possui <strong>${count}</strong> produtos vinculados e não pode ser excluída.`);
        return;
    }

    deleteCatId = id;
    subToRemove = null;
    
    document.getElementById('confirm-msg').innerHTML = `Tem certeza que deseja excluir a categoria <strong>${name}</strong>?`;
    
    // Abre o modal
    const modal = document.getElementById('custom-confirm');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

async function closeConfirm(confirmado) {
    if (confirmado) {
        if (deleteCatId) {
            const token = localStorage.getItem('admin_token');
            try {
                const res = await fetch(`${API_BASE_URL}/api/categories/${deleteCatId}`, { 
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (res.ok) {
                    await loadCategoriesList(); 
                } else if (res.status === 401 || res.status === 403) {
                    alert("Sua sessão expirou. Faça login novamente.");
                    window.location.href = 'login.html';
                } else {
                    console.error("Erro na resposta do servidor ao deletar");
                }
            } catch (err) {
                console.error("Erro ao conectar com a API para deletar:", err);
            }
        } 
        else if (subToRemove) {
            currentSubcategories = currentSubcategories.filter(s => s !== subToRemove);
            renderSubTags();
        }
    }
    
    // Fecha o modal e limpa os IDs
    const modal = document.getElementById('custom-confirm');
    modal.classList.remove('flex');
    modal.classList.add('hidden');
    
    deleteCatId = null;
    subToRemove = null;
}

// --- SALVAR, EDITAR E CANCELAR ---

function addSubToList() {
    const input = document.getElementById('sub-input');
    const val = input.value.trim();
    if (val && !currentSubcategories.includes(val)) {
        currentSubcategories.push(val);
        renderSubTags();
        input.value = '';
        input.focus();
    }
}

function openCatForm() {
    const container = document.getElementById('cat-form-container');
    const btnOpen = document.getElementById('btn-open-cat-form');
    
    container.classList.remove('hidden');
    btnOpen.classList.add('hidden');
    
    // Se não estiver editando, garante que o título esteja como "Nova"
    if (!editingCatId) {
        document.getElementById('cat-form-title').innerText = "Nova Categoria";
    }
}

function closeCatForm() {
    const container = document.getElementById('cat-form-container');
    const btnOpen = document.getElementById('btn-open-cat-form');
    
    container.classList.add('hidden');
    btnOpen.classList.remove('hidden');
    
    // Reset completo do estado de edição ao fechar
    editingCatId = null;
    currentSubcategories = [];
    document.getElementById('cat-name').value = '';
    document.getElementById('sub-input').value = '';
    
    // Restaura o botão de salvar para o padrão original
    const saveBtn = document.getElementById('cat-save-btn');
    saveBtn.innerText = "Salvar Categoria";
    saveBtn.classList.remove('bg-blue-600', 'text-white');
    saveBtn.classList.add('bg-accent', 'text-black');
    
    renderSubTags();
}

async function saveFullCategory() {
    const nameInput = document.getElementById('cat-name');
    const name = nameInput.value.trim();
    const saveBtn = document.getElementById('cat-save-btn');
    const originalBtnText = saveBtn.innerHTML;

    if (!name || currentSubcategories.length === 0) {
        showLockedAlert("Preencha o nome da categoria e adicione pelo menos uma subcategoria.");
        return;
    }

    try {
        // 2. EFEITO NO BOTÃO AO SALVAR (ESTILO PRODUTOS)
        saveBtn.disabled = true;
        saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
        saveBtn.innerHTML = `
            <svg class="animate-spin h-4 w-4 mr-2 border-t-2 border-white rounded-full inline-block" viewBox="0 0 24 24"></svg>
            SALVANDO...
        `;

        const payload = { name, subcategories: currentSubcategories };
        const method = editingCatId ? 'PUT' : 'POST';
        const url = editingCatId ? `${API_BASE_URL}/api/categories/${editingCatId}` : `${API_BASE_URL}/api/categories`;
        const token = localStorage.getItem('admin_token');

        const res = await fetch(url, {
            method,
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeCatForm(); 
            await loadCategoriesList();
        } else if (res.status === 401 || res.status === 403) {
            alert("Sua sessão expirou. Por favor, faça login novamente.");
            window.location.href = 'login.html';
        } else {
            const errorData = await res.json();
            alert("Erro ao salvar: " + (errorData.message || "Erro desconhecido"));
        }
    } catch (err) { 
        console.error("Erro ao salvar categoria:", err);
        alert("Erro de conexão com o servidor.");
    } finally {
        // 3. RESTAURA O BOTÃO
        saveBtn.disabled = false;
        saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        saveBtn.innerHTML = originalBtnText;
    }
}

function editCategory(catJson) {
    const cat = JSON.parse(decodeURIComponent(catJson));
    editingCatId = cat._id; 

    // Abre o formulário antes de preencher
    openCatForm();

    document.getElementById('cat-form-title').innerText = "Editar Categoria";
    const saveBtn = document.getElementById('cat-save-btn');
    saveBtn.innerText = "Atualizar Categoria";
    
    // Estilo visual de edição (Azul)
    saveBtn.classList.remove('bg-accent', 'text-black');
    saveBtn.classList.add('bg-blue-600', 'text-white');

    document.getElementById('cat-name').value = cat.name;
    currentSubcategories = [...cat.subcategories];
    renderSubTags();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelCatEdit() {
    closeCatForm();
}

// Vinculação de eventos
document.getElementById('confirm-yes').onclick = () => closeConfirm(true);
document.getElementById('sub-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addSubToList(); }
});