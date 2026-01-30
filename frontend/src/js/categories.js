let currentSubcategories = [];
let editingCatId = null;
let deleteCatId = null; // Para excluir categoria do banco
let subToRemove = null; // Para remover subcategoria da lista
let allProducts = [];

document.addEventListener('DOMContentLoaded', () => {
    loadCategoriesList();
});

// --- CARREGAMENTO E RENDERIZAÇÃO ---

async function loadCategoriesList() {
    try {
        const [resCat, resProd] = await Promise.all([
            fetch('http://localhost:3000/api/categories'),
            fetch('http://localhost:3000/api/products')
        ]);
        
        const categories = await resCat.json();
        allProducts = await resProd.json();
        
        const container = document.getElementById('categories-list-display');
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
                        <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="editCategory('${data}')" class="p-2 hover:bg-blue-500/10 rounded-lg text-blue-400 transition">✏️</button>
                            <button onclick="askDeleteCat(${cat.id}, '${cat.name}')" class="p-2 hover:bg-red-500/10 rounded-lg text-red-500 transition">🗑️</button>
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
    } catch (err) { console.error(err); }
}

// --- GESTÃO DE SUBCATEGORIAS (TAGS) ---

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

    // Se estiver vazia, abre o modal de confirmação personalizado
    subToRemove = subName;
    document.getElementById('confirm-msg').innerHTML = `A subcategoria <strong>${subName}</strong> não possui produtos. Deseja removê-la da lista?`;
    document.getElementById('custom-confirm').classList.replace('hidden', 'flex');
}

// --- MODAIS E ALERTAS ---

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
    document.getElementById('confirm-msg').innerHTML = `Tem certeza que deseja excluir a categoria <strong>${name}</strong>?`;
    document.getElementById('custom-confirm').classList.replace('hidden', 'flex');
}

async function closeConfirm(confirmado) {
    if (confirmado) {
        // CASO 1: Excluindo categoria do Banco (ID existe)
        if (deleteCatId) {
            const res = await fetch(`http://localhost:3000/api/categories/${deleteCatId}`, { method: 'DELETE' });
            if (res.ok) loadCategoriesList();
            else {
                const err = await res.json();
                showLockedAlert(err.message);
            }
        } 
        // CASO 2: Removendo apenas a tag da subcategoria (Memória local)
        else if (subToRemove) {
            currentSubcategories = currentSubcategories.filter(s => s !== subToRemove);
            renderSubTags();
        }
    }
    
    // Limpa estados e fecha modal
    document.getElementById('custom-confirm').classList.replace('flex', 'hidden');
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

async function saveFullCategory() {
    const name = document.getElementById('cat-name').value.trim();
    if (!name || currentSubcategories.length === 0) {
        showLockedAlert("Preencha o nome da categoria e adicione subcategorias.");
        return;
    }

    const payload = { name, subcategories: currentSubcategories };
    const method = editingCatId ? 'PUT' : 'POST';
    const url = editingCatId ? `http://localhost:3000/api/categories/${editingCatId}` : 'http://localhost:3000/api/categories';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            cancelCatEdit();
            loadCategoriesList();
        }
    } catch (err) { console.error(err); }
}

function editCategory(catJson) {
    const cat = JSON.parse(decodeURIComponent(catJson));
    editingCatId = cat.id;

    document.getElementById('cat-form-title').innerText = "Editar Categoria";
    const saveBtn = document.getElementById('cat-save-btn');
    saveBtn.innerText = "Atualizar Categoria";
    saveBtn.classList.replace('bg-accent', 'bg-blue-600');
    saveBtn.classList.replace('text-black', 'text-white');
    document.getElementById('cat-cancel-btn').classList.remove('hidden');

    document.getElementById('cat-name').value = cat.name;
    currentSubcategories = [...cat.subcategories];
    renderSubTags();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelCatEdit() {
    editingCatId = null;
    currentSubcategories = [];
    document.getElementById('cat-form-title').innerText = "Nova Categoria";
    const btn = document.getElementById('cat-save-btn');
    btn.innerText = "Gravar Categoria no Sistema";
    btn.classList.replace('bg-blue-600', 'bg-accent');
    btn.classList.replace('text-white', 'text-black');
    document.getElementById('cat-cancel-btn').classList.add('hidden');
    document.getElementById('cat-name').value = '';
    document.getElementById('sub-input').value = '';
    renderSubTags();
}

// Atalhos e Eventos
document.getElementById('confirm-yes').onclick = () => closeConfirm(true);
document.getElementById('sub-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addSubToList(); }
});