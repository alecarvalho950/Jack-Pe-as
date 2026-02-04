let allProducts = [];
let categories = [];
let customAttributes = [];
let currentPage = 1;
const itemsPerPage = 25; // Mantido em 25
let totalPages = 0;
let totalItems = 0;
let editingProductId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Adiciona os eventos nos filtros para que eles funcionem visualmente
    document.getElementById('search-input')?.addEventListener('input', filterProducts);
    document.getElementById('filter-category')?.addEventListener('change', updateFilterSubcategories);
    document.getElementById('filter-subcategory')?.addEventListener('change', filterProducts);

    await loadInitialData();

    const fileInput = document.getElementById('prod-file');
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            previewImage(this);
        });
    }
});

async function loadInitialData(page = 1) {
    currentPage = page;
    
    const term = document.getElementById('search-input')?.value || "";
    const cat = document.getElementById('filter-category')?.value || "";
    const sub = document.getElementById('filter-subcategory')?.value || "";

    try {
        const url = new URL('http://localhost:3000/api/products');
        url.searchParams.append('page', page);
        url.searchParams.append('limit', itemsPerPage);
        if (term) url.searchParams.append('search', term);
        if (cat) url.searchParams.append('category', cat);
        if (sub) url.searchParams.append('subcategory', sub);

        const [resCat, resProd, resAttr] = await Promise.all([
            fetch('http://localhost:3000/api/categories'),
            fetch(url),
            fetch('http://localhost:3000/api/attributes')
        ]);
        
        categories = await resCat.json();
        const productData = await resProd.json();
        customAttributes = await resAttr.json();

        // SEGURANÇA: Verifica se a resposta é o objeto de paginação ou array direto
        if (productData.products) {
            allProducts = productData.products;
            totalPages = productData.pages;
            totalItems = productData.total;
        } else {
            allProducts = productData;
            totalPages = 1;
            totalItems = productData.length;
        }

        populateCategorySelects();
        renderProducts();
    } catch (err) {
        console.error("Erro no loadInitialData:", err);
    }
}

// Preenche os selects apenas se estiverem vazios (para não resetar o foco do usuário)
function populateCategorySelects() {
    const pCat = document.getElementById('p-category');
    const fCat = document.getElementById('filter-category');
    if (!pCat || !fCat || fCat.options.length > 1) return; 

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
    const formContainer = document.getElementById('product-form-container');
    const btnOpen = document.getElementById('btn-open-form');
    
    if (formContainer) formContainer.classList.add('hidden');
    if (btnOpen) btnOpen.classList.remove('hidden');
    
    editingProductId = null; // ESSENCIAL: Volta o estado para criação
    clearForm();
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
            
            // --- FECHAMENTO GARANTIDO ---
            closeForm(); // Fecha a UI e reseta editingProductId para null
            await loadInitialData(); // Atualiza a lista em segundo plano
        } else {
            const errorData = await res.json();
            showNotification(errorData.message || "Erro no servidor", "error");
        }
    } catch (err) {
        console.error("Erro ao salvar:", err);
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
    loadInitialData(1); 
}

function updateFilterSubcategories() {
    const catName = document.getElementById('filter-category').value;
    const subFilter = document.getElementById('filter-subcategory');
    if (!subFilter) return;

    subFilter.innerHTML = '<option value="">Todas as Subcategorias</option>';
    subFilter.value = ""; 

    if (catName) {
        const catObj = categories.find(c => c.name === catName);
        if (catObj && catObj.subcategories) {
            catObj.subcategories.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                subFilter.appendChild(opt);
            });
        }
    }
    filterProducts();
}

function renderProducts() {
    const container = document.getElementById('product-list-body');
    if (!container) return;

    if (allProducts.length === 0) {
        container.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-gray-500 italic">Nenhum produto encontrado.</td></tr>`;
        renderPaginationControls();
        return;
    }

    container.innerHTML = allProducts.map(p => {
        const imagePath = p.image ? `http://localhost:3000${p.image}` : null;
        const price = parseFloat(p.price) || 0;

        return `
        <tr class="hover:bg-white/[0.03] transition-all group border-b border-gray-800/50">
            <td class="p-4">
                <div class="flex items-center gap-4">
                    <div class="w-14 h-14 rounded-xl bg-gray-900 border border-gray-700 overflow-hidden flex-shrink-0 shadow-lg group-hover:border-accent/50 transition-colors">
                        ${imagePath 
                            ? `<img src="${imagePath}" class="w-full h-full object-cover">`
                            : `<div class="w-full h-full flex items-center justify-center text-[10px] text-gray-600 uppercase font-bold">Sem Foto</div>`
                        }
                    </div>
                    <div>
                        <div class="text-sm font-bold text-white group-hover:text-accent transition-colors">${p.name}</div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">${p.category} <span class="text-gray-700">/</span> ${p.subcategory}</div>
                    </div>
                </div>
            </td>
            <td class="p-4 text-center font-mono text-xs text-gray-400">${p.sku || '---'}</td>
            <td class="p-4 text-center">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${p.stock > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'} border ${p.stock > 0 ? 'border-green-500/20' : 'border-red-500/20'}">
                    ${p.stock} un
                </span>
            </td>
            <td class="p-4 text-center">
                <div class="text-sm font-black text-white">R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </td>
            <td class="p-4 text-right">
                <div class="flex justify-end gap-2">
                    <button onclick="editProduct('${p._id}')" class="p-2.5 hover:bg-blue-600/20 text-blue-400 rounded-xl transition-all hover:-translate-y-0.5" title="Editar">✏️</button>
                    <button onclick="deleteProduct('${p._id}')" class="p-2.5 hover:bg-red-600/20 text-red-400 rounded-xl transition-all hover:-translate-y-0.5" title="Excluir">🗑️</button>
                </div>
            </td>
        </tr>`;
    }).join('');

    renderPaginationControls();
}

function renderPaginationControls() {
    const nav = document.getElementById('pagination-nav');
    if (!nav) return;

    // Cálculo dinâmico para a legenda
    // Ex: Se estamos na página 1, mostra 1-25. Se na página 2, mostra 26-26.
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    const getPages = () => {
        const pages = [];
        const maxVisible = 2; 

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - maxVisible && i <= currentPage + maxVisible)) {
                pages.push(i);
            } else if (pages[pages.length - 1] !== '...') {
                pages.push('...');
            }
        }
        return pages;
    };

    const pages = getPages();

    nav.className = "flex flex-col md:flex-row items-center justify-between gap-6 mt-8 pb-10 pt-6 border-t border-gray-800";
    
    nav.innerHTML = `
        <div class="text-xs text-gray-500 font-medium order-2 md:order-1">
            Exibindo <span class="text-white">${startItem}-${endItem}</span> de <span class="text-white">${totalItems}</span> resultados
        </div>

        <div class="flex items-center gap-2 order-1 md:order-2">
            <button onclick="loadInitialData(${currentPage - 1})" 
                ${currentPage === 1 ? 'disabled' : ''} 
                class="p-2.5 bg-gray-900 border border-gray-800 rounded-xl hover:bg-gray-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all text-white">
                ⬅️
            </button>

            <div class="flex items-center gap-1.5">
                ${pages.map(p => {
                    if (p === '...') return `<span class="px-2 text-gray-600 font-bold">...</span>`;
                    
                    const isCurrent = p === currentPage;
                    return `
                        <button onclick="loadInitialData(${p})" 
                            class="w-10 h-10 rounded-xl text-xs font-bold transition-all border ${
                                isCurrent 
                                ? 'bg-accent text-black border-accent shadow-lg shadow-accent/20 scale-110 font-black' 
                                : 'bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-600 hover:text-white'
                            }">
                            ${p}
                        </button>
                    `;
                }).join('')}
            </div>

            <button onclick="loadInitialData(${currentPage + 1})" 
                ${currentPage >= totalPages ? 'disabled' : ''} 
                class="p-2.5 bg-gray-900 border border-gray-800 rounded-xl hover:bg-gray-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all text-white">
                ➡️
            </button>
        </div>

        <div class="hidden md:block w-32 order-3"></div>
    `;
}

function showNotification(message, type = 'success') {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toast-message');
    const content = document.getElementById('toast-content');
    const icon = document.getElementById('toast-icon');

    if (!toast || !msg) return; // Segurança caso o HTML não tenha o toast

    if (type === 'success') {
        content.className = "px-6 py-3 rounded-xl flex items-center gap-3 shadow-2xl border font-bold bg-green-500/10 border-green-500 text-green-500";
        icon.innerText = "✅";
    } else {
        content.className = "px-6 py-3 rounded-xl flex items-center gap-3 shadow-2xl border font-bold bg-red-500/10 border-red-500 text-red-500";
        icon.innerText = "⚠️";
    }

    msg.innerText = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3000);
}