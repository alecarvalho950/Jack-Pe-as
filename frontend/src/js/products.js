let allProducts = [];
let filteredProducts = [];
let categories = [];
let customAttributes = [];
let currentPage = 1;
const itemsPerPage = 25;
let editingProductId = null; // Agora armazenará o _id (string)
let productToDeleteId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();

    // --- NOVO: Listener para o Preview de Imagem ---
    const fileInput = document.getElementById('prod-file');
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            previewImage(this); // Chama a função de preview assim que o arquivo muda
        });
    }
});

// --- CARREGAMENTO ---
async function loadInitialData() {
    try {
        const [resCat, resProd, resAttr] = await Promise.all([
            fetch('http://localhost:3000/api/categories'),
            fetch('http://localhost:3000/api/products'),
            fetch('http://localhost:3000/api/attributes')
        ]);
        categories = await resCat.json();
        allProducts = await resProd.json();
        customAttributes = await resAttr.json();

        populateCategorySelects();
        filterProducts();
    } catch (err) {
        showNotification("Erro ao carregar dados", "error");
    }
}

function populateCategorySelects() {
    const pCat = document.getElementById('p-category');
    const fCat = document.getElementById('filter-category');
    
    if (!pCat || !fCat) return; 

    pCat.innerHTML = '<option value="">Selecione...</option>';
    fCat.innerHTML = '<option value="">Todas as Categorias</option>';

    categories.forEach(c => {
        const opt = `<option value="${c.name}">${c.name}</option>`;
        pCat.innerHTML += opt;
        fCat.innerHTML += opt;
    });
}

// --- INTERFACE ---
function openForm() {
    editingProductId = null;
    document.getElementById('form-title').innerText = "Novo Produto";
    document.getElementById('btn-save-product').innerText = "Salvar Produto";
    clearForm();
    showFormUI();
}

function showFormUI() {
    document.getElementById('product-form-container').classList.remove('hidden');
    document.getElementById('btn-open-form').classList.add('hidden');
}

function closeForm() {
    document.getElementById('product-form-container').classList.add('hidden');
    document.getElementById('btn-open-form').classList.remove('hidden');
    editingProductId = null;
}

function clearForm() {
    document.getElementById('p-name').value = '';
    document.getElementById('p-sku').value = '';
    document.getElementById('p-price').value = '';
    document.getElementById('p-stock').value = '';
    document.getElementById('p-category').value = '';
    document.getElementById('p-subcategory').innerHTML = '<option value="">Selecione a categoria primeiro</option>';
    document.getElementById('attributes-fields').innerHTML = '';
    document.getElementById('prod-file').value = ""; 
    document.getElementById('image-preview').innerHTML = `<span class="text-gray-600 text-xs italic">Sem foto</span>`;
}

// --- FILTROS DINÂMICOS ---
function updateSubcategories(selectedSub = "") {
    const catName = document.getElementById('p-category').value;
    const subSelect = document.getElementById('p-subcategory');
    const attrContainer = document.getElementById('dynamic-attributes-container');
    const attrFields = document.getElementById('attributes-fields');

    subSelect.innerHTML = '<option value="">Selecione...</option>';
    const catObj = categories.find(c => c.name === catName);
    if (catObj) {
        catObj.subcategories.forEach(s => {
            subSelect.innerHTML += `<option value="${s}" ${s === selectedSub ? 'selected' : ''}>${s}</option>`;
        });
    }

    const relevantAttrs = customAttributes.filter(a => a.category === catName);
    if (relevantAttrs.length > 0) {
        attrContainer.classList.remove('hidden');
        attrFields.innerHTML = relevantAttrs.map(attr => `
            <div class="flex flex-col">
                <label class="text-[10px] text-gray-500 uppercase font-bold">${attr.name}</label>
                ${attr.type === 'select' 
                    ? `<select class="dynamic-attr bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white focus:border-accent outline-none" data-name="${attr.name}">
                        <option value="">Selecione...</option>
                        ${attr.options.map(o => `<option value="${o}">${o}</option>`).join('')}
                       </select>`
                    : `<input type="text" class="dynamic-attr bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white focus:border-accent outline-none" data-name="${attr.name}" placeholder="Valor...">`
                }
            </div>
        `).join('');
    } else {
        attrContainer.classList.add('hidden');
    }
}

function previewImage(input) {
    const preview = document.getElementById('image-preview');
    
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover animate-in fade-in duration-300">`;
        };
        
        reader.readAsDataURL(input.files[0]);
    } else {
        // Se o usuário cancelar a seleção ou o input estiver vazio
        preview.innerHTML = `<span class="text-gray-600 text-xs italic">Sem foto</span>`;
    }
}

// --- CRUD ---
async function saveProduct() {
    const formData = new FormData();
    
    const name = document.getElementById('p-name').value;
    const sku = document.getElementById('p-sku').value;
    const price = document.getElementById('p-price').value || "0";
    const stock = document.getElementById('p-stock').value || "0";
    const category = document.getElementById('p-category').value;
    const subcategory = document.getElementById('p-subcategory').value;

    if (!name || !category) {
        showNotification("Nome e Categoria são obrigatórios", "error");
        return;
    }

    formData.append('name', name);
    formData.append('sku', sku);
    formData.append('category', category);
    formData.append('subcategory', subcategory);
    formData.append('price', price);
    formData.append('stock', stock);

    const attrs = {};
    document.querySelectorAll('.dynamic-attr').forEach(el => {
        const attrName = el.getAttribute('data-name');
        if (el.value) attrs[attrName] = el.value;
    });
    formData.append('attributes', JSON.stringify(attrs));

    const fileInput = document.getElementById('prod-file'); 
    if (fileInput && fileInput.files[0]) {
        formData.append('image', fileInput.files[0]);
    }

    // AJUSTE: URL utiliza o editingProductId (_id)
    const url = editingProductId ? `http://localhost:3000/api/products/${editingProductId}` : 'http://localhost:3000/api/products';
    const method = editingProductId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            body: formData 
        });

        if (res.ok) {
            showNotification(editingProductId ? "Produto atualizado!" : "Produto criado!");
            closeForm();
            await loadInitialData(); 
        } else {
            const errorData = await res.json();
            showNotification(errorData.message || "Erro no servidor", "error");
        }
    } catch (err) {
        showNotification("Erro de conexão", "error");
    }
}

function editProduct(id) {
    // AJUSTE: Comparação com _id
    const p = allProducts.find(item => item._id === id);
    if (!p) return;

    editingProductId = id; 
    
    document.getElementById('form-title').innerText = "Editando Produto";
    document.getElementById('btn-save-product').innerText = "Salvar Alterações";
    
    document.getElementById('p-name').value = p.name || '';
    document.getElementById('p-sku').value = p.sku || '';
    document.getElementById('p-price').value = p.price || 0;
    document.getElementById('p-stock').value = p.stock || 0;
    document.getElementById('p-category').value = p.category || '';
    
    // --- ATUALIZAÇÃO DO PREVIEW NA EDIÇÃO ---
    const preview = document.getElementById('image-preview');
    if (p.image) {
        const imagePath = `http://localhost:3000${p.image}`;
        preview.innerHTML = `<img src="${imagePath}" class="w-full h-full object-cover">`;
    } else {
        preview.innerHTML = `<span class="text-gray-600 text-xs italic">Sem foto</span>`;
    }

    updateSubcategories(p.subcategory);
    
    // Pequeno delay para os campos dinâmicos serem criados antes de preenchê-los
    setTimeout(() => {
        document.querySelectorAll('.dynamic-attr').forEach(el => {
            const attrName = el.getAttribute('data-name');
            if (p.attributes && p.attributes[attrName]) el.value = p.attributes[attrName];
        });
    }, 150);

    showFormUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// EXCLUSÃO
function deleteProduct(id) {
    const p = allProducts.find(item => item._id === id);
    if (!p) return;
    productToDeleteId = id;
    document.getElementById('delete-modal-msg').innerText = `Deseja realmente excluir o produto "${p.name}"?`;
    document.getElementById('delete-modal').classList.remove('hidden');
}

async function confirmDelete() {
    try {
        const res = await fetch(`http://localhost:3000/api/products/${productToDeleteId}`, { method: 'DELETE' });
        if (res.ok) {
            showNotification("Produto removido!");
            document.getElementById('delete-modal').classList.add('hidden');
            await loadInitialData();
        }
    } catch (err) { showNotification("Erro ao excluir", "error"); }
}

// --- RENDERIZAÇÃO ---
function filterProducts() {
    const term = document.getElementById('search-input').value.toLowerCase();
    const cat = document.getElementById('filter-category').value;
    const sub = document.getElementById('filter-subcategory').value;

    filteredProducts = allProducts.filter(p => {
        const matchesTerm = (p.name || "").toLowerCase().includes(term) || (p.sku || "").toLowerCase().includes(term);
        const matchesCat = cat === "" || p.category === cat;
        const matchesSub = sub === "" || p.subcategory === sub;
        return matchesTerm && matchesCat && matchesSub;
    });
    renderProducts();
}

function renderProducts() {
    const container = document.getElementById('product-list-body');
    if (!container) return;

    container.innerHTML = filteredProducts.map(p => {
        const imagePath = p.image ? `http://localhost:3000${p.image}` : null;
        // Preço garantido como número para o toFixed
        const price = parseFloat(p.price) || 0;

        return `
        <tr class="hover:bg-gray-800/30 transition-colors group">
            <td class="p-4">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-lg bg-gray-800 border border-gray-700 overflow-hidden flex-shrink-0">
                        ${imagePath 
                            ? `<img src="${imagePath}" class="w-full h-full object-cover">`
                            : `<div class="w-full h-full flex items-center justify-center text-[10px] text-gray-600 italic">N/A</div>`
                        }
                    </div>
                    <div>
                        <div class="text-sm font-bold text-white">${p.name}</div>
                        <div class="text-[10px] text-accent uppercase tracking-tighter">${p.category} > ${p.subcategory}</div>
                    </div>
                </div>
            </td>
            <td class="p-4 text-center font-mono text-xs text-gray-400">${p.sku || '-'}</td>
            <td class="p-4 text-center">
                <span class="px-2 py-1 rounded-md text-xs font-bold ${p.stock < 5 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}">
                    ${p.stock} un
                </span>
            </td>
            <td class="p-4 text-center font-bold text-white text-sm">R$ ${price.toFixed(2)}</td>
            <td class="p-4 text-right">
                <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editProduct('${p._id}')" class="p-2 hover:bg-blue-600/20 hover:text-blue-400 rounded-lg transition" title="Editar">✏️</button>
                    <button onclick="deleteProduct('${p._id}')" class="p-2 hover:bg-red-600/20 hover:text-red-400 rounded-lg transition" title="Excluir">🗑️</button>
                </div>
            </td>
        </tr>
        `;
    }).join('');

    document.getElementById('pagination-info').innerText = `Total: ${filteredProducts.length} produtos`;
}