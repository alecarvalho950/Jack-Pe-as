let allProducts = [];
let categories = [];
let customAttributes = [];
let currentPage = 1;
const itemsPerPage = 25;
let totalPages = 0;
let totalItems = 0;
let editingProductId = null;
let productToDeleteId = null;
const API_BASE_URL = "https://jack-pe-as-production.up.railway.app";

document.addEventListener('DOMContentLoaded', async () => {
    let searchTimer;
    document.getElementById('search-input')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        filterProducts();
    }, 400); // Aguarda 300ms após a última tecla
});
    document.getElementById('filter-category')?.addEventListener('change', updateFilterSubcategories);
    document.getElementById('filter-subcategory')?.addEventListener('change', filterProducts);

    await loadInitialData();

    const fileInput = document.getElementById('prod-file');
    if (fileInput) {
        fileInput.addEventListener('change', function () {
            previewImage(this);
        });
    }
});

async function loadInitialData(page = 1) {
    currentPage = page;
    const term = document.getElementById('search-input')?.value.trim();
    const cat = document.getElementById('filter-category')?.value || "";
    const sub = document.getElementById('filter-subcategory')?.value || "";

    try {
        const url = new URL(`${API_BASE_URL}/api/products`);
        url.searchParams.append('page', page);
        url.searchParams.append('limit', itemsPerPage);
        if (term) url.searchParams.append('search', term);
        if (cat) url.searchParams.append('category', cat);
        if (sub) url.searchParams.append('subcategory', sub);

        const [resCat, resProd, resAttr] = await Promise.all([
            fetch(`${API_BASE_URL}/api/categories`),
            fetch(url),
            fetch(`${API_BASE_URL}/api/attributes`)
        ]);

        categories = await resCat.json();
        const productData = await resProd.json();
        customAttributes = await resAttr.json();

        if (productData.products) {
            allProducts = productData.products;
            totalPages = productData.pages;
            totalItems = productData.total;
        } else {
            allProducts = Array.isArray(productData) ? productData : [];
            totalPages = 1;
            totalItems = allProducts.length;
        }

        populateCategorySelects();
        renderProducts();
    } catch (err) {
        console.error("Erro no loadInitialData:", err);
    }
}

function populateCategorySelects() {
    const pCat = document.getElementById('p-category');
    const fCat = document.getElementById('filter-category');
    if (!pCat || !fCat) return;

    const currentPCat = pCat.value;
    const currentFCat = fCat.value;

    pCat.innerHTML = '<option value="">Selecione...</option>';
    fCat.innerHTML = '<option value="">Todas as Categorias</option>';

    categories.forEach(c => {
        const opt = `<option value="${c.name}">${c.name}</option>`;
        pCat.innerHTML += opt;
        fCat.innerHTML += opt;
    });

    if (currentPCat) pCat.value = currentPCat;
    if (currentFCat) fCat.value = currentFCat;
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
    document.getElementById('p-has-variations').checked = false;
    document.getElementById('variations-list').innerHTML = '';
    document.getElementById('variations-container').classList.add('hidden');
    
    const stockField = document.getElementById('p-stock').parentElement;
    stockField.style.opacity = "1";
    stockField.style.pointerEvents = "auto";
}

// --- FILTROS DINÂMICOS ---
function updateSubcategories(selectedSub = "") {
    const catName = document.getElementById('p-category').value;
    const subSelect = document.getElementById('p-subcategory');
    const attrContainer = document.getElementById('dynamic-attributes-container');
    const attrFields = document.getElementById('attributes-fields');

    subSelect.innerHTML = '<option value="">Selecione...</option>';
    const catObj = categories.find(c => c.name === catName);
    if (catObj && catObj.subcategories) {
        catObj.subcategories.forEach(s => {
            const isSelected = s === selectedSub ? 'selected' : '';
            subSelect.innerHTML += `<option value="${s}" ${isSelected}>${s}</option>`;
        });
    }

    const relevantAttrs = customAttributes.filter(a => a.category === catName);
    if (relevantAttrs.length > 0) {
        attrContainer.classList.remove('hidden');
        attrFields.innerHTML = relevantAttrs.map(attr => `
            <div class="flex flex-col">
                <label class="text-[10px] text-gray-500 uppercase font-bold">${attr.name}</label>
                ${attr.type === 'select'
                ? `<select class="dynamic-attr bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white outline-none" data-name="${attr.name}">
                        <option value="">Selecione...</option>
                        ${attr.options.map(o => `<option value="${o}">${o}</option>`).join('')}
                       </select>`
                : `<input type="text" class="dynamic-attr bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white outline-none" data-name="${attr.name}" placeholder="Valor...">`
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
        reader.onload = e => {
            preview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover rounded-lg">`;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function toggleVariations() {
    const hasVar = document.getElementById('p-has-variations').checked;
    const container = document.getElementById('variations-container');
    const stockField = document.getElementById('p-stock').parentElement;

    if (hasVar) {
        container.classList.remove('hidden');
        stockField.style.opacity = "0.3";
        stockField.style.pointerEvents = "none";
        if (document.getElementById('variations-list').children.length === 0) {
            addVariationRow();
        }
    } else {
        container.classList.add('hidden');
        stockField.style.opacity = "1";
        stockField.style.pointerEvents = "auto";
    }
}

function addVariationRow(data = { type: 'Cor', value: '', stock: '', sku: '' }) {
    const list = document.getElementById('variations-list');
    const div = document.createElement('div');
    div.className = "variation-row grid grid-cols-1 md:grid-cols-4 gap-3 bg-[#1a2233] p-4 rounded-xl border border-gray-800 mb-2";

    div.innerHTML = `
        <div>
            <label class="text-[9px] text-gray-500 uppercase font-bold">Tipo</label>
            <input type="text" list="variation-types" placeholder="Ex: Versão" 
                value="${data.type || 'Cor'}" 
                class="v-type w-full p-2 mt-1 rounded bg-gray-900 border border-gray-700 text-xs text-white outline-none focus:border-accent">
            <datalist id="variation-types">
                <option value="Cor">
                <option value="Qualidade">
                <option value="Modelo">
                <option value="Versão">
            </datalist>
        </div>
        <div>
            <label class="text-[9px] text-gray-500 uppercase font-bold">Valor</label>
            <input type="text" placeholder="Ex: M15" value="${data.value || ''}" 
                class="v-value w-full p-2 mt-1 rounded bg-gray-900 border border-gray-700 text-xs text-white outline-none focus:border-accent">
        </div>
        <div>
            <label class="text-[9px] text-gray-500 uppercase font-bold">Estoque</label>
            <input type="number" placeholder="0" value="${data.stock || ''}" 
                class="v-stock w-full p-2 mt-1 rounded bg-gray-900 border border-gray-700 text-xs text-white outline-none focus:border-accent">
        </div>
        <div class="flex gap-2 items-end">
            <div class="flex-1">
                <label class="text-[9px] text-gray-500 uppercase font-bold">SKU</label>
                <input type="text" placeholder="Opcional" value="${data.sku || ''}" 
                    class="v-sku w-full p-2 mt-1 rounded bg-gray-900 border border-gray-700 text-xs text-white outline-none focus:border-accent">
            </div>
            <button type="button" onclick="this.closest('.variation-row').remove()" 
                class="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white p-2.5 rounded-lg transition-all mb-[1px]">✕</button>
        </div>
    `;
    list.appendChild(div);
}

// Paleta de cores para os atributos dinâmicos
const TAG_PALETTE = [
    { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20' },
    { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
    { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
    { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
    { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
    { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
    { bg: 'bg-lime-500/10', text: 'text-lime-400', border: 'border-lime-500/20' },
    { bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-400', border: 'border-fuchsia-500/20' },
    { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20' },
    { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
    { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20' },
    { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
    { bg: 'bg-blue-600/10', text: 'text-blue-400', border: 'border-blue-600/20' },
    { bg: 'bg-yellow-500/10', text: 'text-yellow-300', border: 'border-yellow-500/20' },
    { bg: 'bg-slate-400/10', text: 'text-slate-300', border: 'border-slate-400/20' },
    { bg: 'bg-green-600/10', text: 'text-green-400', border: 'border-green-600/20' },
    { bg: 'bg-zinc-400/10', text: 'text-zinc-300', border: 'border-zinc-400/20' },
    { bg: 'bg-blue-400/10', text: 'text-blue-300', border: 'border-blue-400/20' }
];

function getTagStyle(text) {
    if (!text) return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    const cleanText = text.toLowerCase();
    
    // Exceções manuais
    if (cleanText.includes('original')) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (cleanText.includes('china')) return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % TAG_PALETTE.length;
    const style = TAG_PALETTE[index];
    return `${style.bg} ${style.text} ${style.border}`;
}

// --- CRUD PRINCIPAL ---
async function saveProduct() {
    const formData = new FormData();
    const name = document.getElementById('p-name').value;
    const sku = document.getElementById('p-sku').value;
    const price = document.getElementById('p-price').value || "0";
    const category = document.getElementById('p-category').value;
    const subcategory = document.getElementById('p-subcategory').value;
    const hasVariations = document.getElementById('p-has-variations').checked;

    if (!name || !category) {
        showNotification("Nome e Categoria são obrigatórios", "error");
        return;
    }

    formData.append('name', name);
    formData.append('sku', sku);
    formData.append('category', category);
    formData.append('subcategory', subcategory);
    formData.append('price', price);
    formData.append('hasVariations', hasVariations);

    if (hasVariations) {
        const varRows = document.querySelectorAll('.variation-row');
        const variations = Array.from(varRows).map(row => ({
            type: row.querySelector('.v-type').value,
            value: row.querySelector('.v-value').value,
            stock: parseInt(row.querySelector('.v-stock').value) || 0,
            sku: row.querySelector('.v-sku').value,
            price: parseFloat(price)
        }));
        formData.append('variations', JSON.stringify(variations));
        
        const totalStock = variations.reduce((acc, v) => acc + v.stock, 0);
        formData.append('stock', totalStock);
    } else {
        const simpleStock = document.getElementById('p-stock').value || "0";
        formData.append('stock', simpleStock);
        formData.append('variations', JSON.stringify([]));
    }

    const attrs = {};
    document.querySelectorAll('.dynamic-attr').forEach(el => {
        if (el.value) attrs[el.getAttribute('data-name')] = el.value;
    });
    formData.append('attributes', JSON.stringify(attrs));

    const fileInput = document.getElementById('prod-file');
    if (fileInput?.files[0]) formData.append('image', fileInput.files[0]);

    const url = editingProductId ? `${API_BASE_URL}/api/products/${editingProductId}` : `${API_BASE_URL}/api/products`;
    const method = editingProductId ? 'PUT' : 'POST';

    const token = localStorage.getItem('admin_token');
    try {
        const res = await fetch(url, { 
            method, 
            headers: {
                // IMPORTANTE: Com FormData NÃO definimos Content-Type
                'Authorization': `Bearer ${token}`
            },
            body: formData 
        });

        if (res.ok) {
            showNotification(editingProductId ? "Produto atualizado!" : "Produto criado!");
            closeForm();
            loadInitialData(currentPage);
        } else if (res.status === 401 || res.status === 403) {
            showNotification("Sessão expirada. Faça login.", "error");
            window.location.href = 'login.html';
        } else {
            const errorData = await res.json();
            showNotification(errorData.error || "Erro ao salvar", "error");
        }
    } catch (err) {
        showNotification("Erro de conexão", "error");
    }
}

function editProduct(id) {
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

    const varCheck = document.getElementById('p-has-variations');
    const varList = document.getElementById('variations-list');
    varList.innerHTML = '';

    if (p.hasVariations) {
        varCheck.checked = true;
        document.getElementById('variations-container').classList.remove('hidden');
        if (p.variations && p.variations.length > 0) {
            p.variations.forEach(v => addVariationRow(v));
        } else {
            addVariationRow();
        }
    } else {
        varCheck.checked = false;
        toggleVariations();
    }

    const preview = document.getElementById('image-preview');
    if (p.image) {
        const fullImageUrl = p.image.startsWith('http') ? p.image : `${API_BASE_URL}${p.image}`;
        preview.innerHTML = `<img src="${fullImageUrl}" class="w-full h-full object-cover rounded-lg">`;
    } else {
        preview.innerHTML = `<span class="text-gray-600 text-xs italic">Sem foto</span>`;
    }

    updateSubcategories(p.subcategory);

    setTimeout(() => {
        if (p.attributes) {
            Object.keys(p.attributes).forEach(key => {
                const el = document.querySelector(`.dynamic-attr[data-name="${key}"]`);
                if (el) el.value = p.attributes[key];
            });
        }
    }, 300);

    showFormUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filterProducts() {
    loadInitialData(1);
}

function updateFilterSubcategories() {
    const catName = document.getElementById('filter-category').value;
    const subFilter = document.getElementById('filter-subcategory');
    if (!subFilter) return;

    subFilter.innerHTML = '<option value="">Todas as Subcategorias</option>';
    if (catName) {
        const catObj = categories.find(c => c.name === catName);
        if (catObj?.subcategories) {
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
        return;
    }

    container.innerHTML = allProducts.map(p => {
        const imagePath = p.image ? p.image : null;
        const hasVars = p.hasVariations && p.variations?.length > 0;

        // --- LÓGICA DE ATRIBUTOS DINÂMICOS ---
        // Transforma o objeto { Marca: 'Apple', Modelo: 'X' } em HTML de badges
        const attributeBadges = p.attributes ? Object.entries(p.attributes)
            .map(([key, value]) => {
                if (!value) return ''; 
                // Chamada da função de cor automática
                const badgeStyle = getTagStyle(value);
                return `<span class="${badgeStyle} text-[9px] px-1.5 py-0.5 rounded border mr-1 mt-1 inline-block uppercase font-bold">
                            ${value}
                        </span>`;
            }).join('') : '';

        // Ícone de Seta Profissional
        const arrowIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 transition-transform duration-300 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

        // Ícones de Ação
        const editIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
        const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;

        let rowsHtml = `
        <tr class="hover:bg-white/[0.02] transition-colors border-b border-gray-800/50 group">
            <td class="p-4">
                <div class="flex items-center gap-4">
                    <div class="w-6 flex justify-center">
                        ${hasVars ? `<button onclick="toggleVariationRows('${p._id}', this)" class="text-gray-500 hover:text-accent flex items-center justify-center transition-all">
                            ${arrowIcon}
                        </button>` : ''}
                    </div>
                    <div class="w-12 h-12 rounded-lg bg-gray-900 border border-gray-700 overflow-hidden flex-shrink-0">
                        ${p.image ? `<img src="${p.image}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-[8px] text-gray-600 font-bold p-1 text-center">SEM FOTO</div>`}
                    </div>
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-sm font-bold text-white group-hover:text-accent transition-colors">${p.name}</span>
                        </div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-tight">${p.category} • ${p.subcategory || 'Geral'}</div>
                        
                        <div class="flex flex-wrap mt-1">
                            ${attributeBadges}
                        </div>
                    </div>
                </div>
            </td>
            <td class="p-4 text-center font-mono text-xs text-gray-400">${p.sku || '---'}</td>
            <td class="p-4 text-center">
                <span class="px-2.5 py-1 rounded-md text-[10px] font-bold ${p.stock > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'} border border-current">
                    ${hasVars ? '<span class="opacity-50 mr-1 text-gray-400">TOTAL:</span>' : ''}${p.stock}
                </span>
            </td>
            <td class="p-4 text-center font-black text-white text-sm">R$ ${parseFloat(p.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td class="p-4 text-right">
                <div class="flex justify-end gap-1">
                    <button onclick="editProduct('${p._id}')" class="p-2 hover:bg-accent/20 text-gray-400 hover:text-accent rounded-lg transition-colors">${editIcon}</button>
                    <button onclick="deleteProduct('${p._id}')" class="p-2 hover:bg-red-600/20 text-gray-400 hover:text-red-400 rounded-lg transition-colors">${deleteIcon}</button>
                </div>
            </td>
        </tr>`;

        if (hasVars) {
            p.variations.forEach(v => {
                rowsHtml += `
        <tr class="child-of-${p._id} hidden bg-black/20 border-b border-gray-800/30">
            <td class="p-2 pl-12"> <div class="flex items-center gap-3 relative">
                    <div class="absolute -left-6 top-0 bottom-0 w-px bg-gray-700"></div>
                    <div class="absolute -left-6 top-1/2 w-4 h-px bg-gray-700"></div>
                    
                    <div class="text-[11px] flex items-center gap-2">
                        <span class="font-bold text-accent uppercase">${v.type}:</span>
                        <span class="text-gray-300">${v.value}</span>
                    </div>
                </div>
            </td>
            <td class="p-2 text-center font-mono text-[10px] text-gray-500">${v.sku || '---'}</td>
            <td class="p-2 text-center">
                <span class="text-[10px] text-gray-400 bg-gray-900 px-2 py-0.5 rounded-full border border-gray-800">
                    ${v.stock} un
                </span>
            </td>
            <td colspan="2" class="p-2"></td> </tr>`;
            });
        }
        return rowsHtml;
    }).join('');

    renderPaginationControls();
}

function toggleVariationRows(productId, btn) {
    const rows = document.querySelectorAll(`.child-of-${productId}`);
    const isHidden = rows[0]?.classList.contains('hidden');

    rows.forEach(row => {
        row.classList.toggle('hidden', !isHidden);
        row.classList.toggle('table-row', isHidden);
    });
    
    // Gira o ícone SVG que está dentro do botão
    btn.classList.toggle('rotate-90', isHidden);
}

function renderPaginationControls() {
    const nav = document.getElementById('pagination-nav');
    if (!nav) return;

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

   // Dentro de renderPaginationControls:
const iconLeft = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
const iconRight = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

nav.innerHTML = `
    <div class="text-xs text-gray-500 font-medium order-2 md:order-1">
        Exibindo <span class="text-white">${startItem}-${endItem}</span> de <span class="text-white">${totalItems}</span> resultados
    </div>
    <div class="flex items-center gap-2 order-1 md:order-2">
        <button onclick="loadInitialData(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} 
            class="p-2 bg-gray-900 border border-gray-800 rounded-xl hover:bg-gray-800 disabled:opacity-10 text-accent transition-all">
            ${iconLeft}
        </button>
        
        <div class="flex items-center gap-1.5">
            ${pages.map(p => {
                if (p === '...') return `<span class="px-2 text-gray-600 font-bold">...</span>`;
                return `<button onclick="loadInitialData(${p})" class="w-10 h-10 rounded-xl text-xs font-bold border ${p === currentPage ? 'bg-accent text-black border-accent' : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white'}">${p}</button>`;
            }).join('')}
        </div>

        <button onclick="loadInitialData(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''} 
            class="p-2 bg-gray-900 border border-gray-800 rounded-xl hover:bg-gray-800 disabled:opacity-10 text-accent transition-all">
            ${iconRight}
        </button>
    </div>
`;
}

function deleteProduct(id) {
    const p = allProducts.find(item => item._id === id);
    if (!p) return;
    productToDeleteId = id;
    document.getElementById('delete-modal-msg').innerText = `Deseja realmente excluir o produto "${p.name}"?`;
    document.getElementById('delete-modal').classList.remove('hidden');
}

async function confirmDelete() {
    const token = localStorage.getItem('admin_token');
    try {
        const res = await fetch(`${API_BASE_URL}/api/products/${productToDeleteId}`, { 
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (res.ok) {
            showNotification("Produto removido!");
            document.getElementById('delete-modal').classList.add('hidden');
            loadInitialData(currentPage);
        } else if (res.status === 401 || res.status === 403) {
            alert("Acesso negado. Faça login novamente.");
            window.location.href = 'login.html';
        }
    } catch (err) { showNotification("Erro ao excluir", "error"); }
}

function showNotification(message, type = 'success') {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toast-message');
    const content = document.getElementById('toast-content');
    const icon = document.getElementById('toast-icon');

    if (!toast || !msg) return;

    content.className = type === 'success'
        ? "px-6 py-3 rounded-xl flex items-center gap-3 shadow-2xl border font-bold bg-green-500/10 border-green-500 text-green-500"
        : "px-6 py-3 rounded-xl flex items-center gap-3 shadow-2xl border font-bold bg-red-500/10 border-red-500 text-red-500";

    icon.innerText = type === 'success' ? "✅" : "⚠️";
    msg.innerText = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3000);
}

async function handleUniversalUpload(event) {
    const file = event.target.files[0];
    const status = document.getElementById('upload-status');
    if (!file) return;

    status.innerText = "⏳ Processando planilha e calculando estoques...";
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            // Dicionário para organizar pais e filhos antes de enviar
            const productsMap = {};
            let currentParentSku = null;

            rows.forEach((row, index) => {
                const tipo = (row.Tipo || 'Simples').trim();
                const sku = String(row.SKU || `AUTO-${index}`).trim();
                
                // Tratamento de Preço (Brasileiro -> Decimal)
                let precoFinal = 0;
if (row.Preço) {
    let pRaw = String(row.Preço).replace('R$', '').trim();
    
    // Se houver vírgula e ponto (ex: 1.200,50), removemos o ponto e trocamos a vírgula por ponto
    if (pRaw.includes(',') && pRaw.includes('.')) {
        pRaw = pRaw.replace(/\./g, '').replace(',', '.');
    } 
    // Se houver apenas vírgula (ex: 214,29), trocamos por ponto
    else if (pRaw.includes(',')) {
        pRaw = pRaw.replace(',', '.');
    }
    
    precoFinal = parseFloat(pRaw) || 0;
}

                // Estrutura base do produto
                const p = {
                    sku: sku,
                    name: row["Nome do Produto"] || "Sem Nome",
                    price: precoFinal,
                    stock: parseInt(row.Estoque) || 0,
                    category: row.Categoria || "Telas",
                    subcategory: row.Subcategoria || "Iphone",
                    attributes: {}, 
                    variations: [],
                    hasVariations: false
                };

                // Captura Atributos Extras (Qualidade, Modelo, Taxa, etc)
                const camposFixos = ['SKU', 'Nome do Produto', 'Tipo', 'Preço', 'Estoque', 'Categoria', 'Subcategoria'];
                Object.keys(row).forEach(key => {
                    if (!camposFixos.includes(key) && row[key] !== undefined && row[key] !== "") {
                        p.attributes[key] = String(row[key]).trim();
                    }
                });

                if (tipo === 'Pai') {
                    p.hasVariations = true;
                    p.stock = 0; // Começa em 0 para somar os filhos abaixo
                    currentParentSku = sku;
                    productsMap[sku] = p;
                } 
               else if (tipo === 'Var' && currentParentSku && productsMap[currentParentSku]) {
    let nomeCompleto = p.name; // Ex: "Versão:M15"
    let tipoVar = 'Cor'; // Valor padrão caso não tenha :
    let valorVar = nomeCompleto;

    if (nomeCompleto.includes(':')) {
        const partes = nomeCompleto.split(':');
        tipoVar = partes[0].trim();  // Pega "Versão"
        valorVar = partes[1].trim(); // Pega "M15"
    }
    
    productsMap[currentParentSku].variations.push({
        sku: p.sku,
        type: tipoVar, // Agora salva "Versão" dinamicamente
        value: valorVar,
        price: p.price,
        stock: p.stock
    });
    
    // Soma o estoque no pai normalmente
    productsMap[currentParentSku].stock += p.stock;
}
                else {
                    // Produto Simples
                    productsMap[sku] = p;
                }
            });

            const toSend = Object.values(productsMap);
            console.log("📦 Lote final para sincronização:", toSend);
            
            await sendBatch(toSend);

        } catch (err) {
            status.innerText = "❌ Erro no processamento.";
            console.error(err);
            alert("Erro ao ler arquivo: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}
// Atualize também o sendBatch para mostrar números reais
async function sendBatch(products) {
    const token = localStorage.getItem('admin_token');
    try {
        const response = await fetch('http://localhost:3000/api/products/batch', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // --- ADICIONADO ---
            },
            body: JSON.stringify({ products })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            document.getElementById('upload-status').innerText = "✅ Sincronização Concluída!";
            const upserted = result.detalhes?.upsertedCount || result.detalhes?.nUpserted || 0;
            const modified = result.detalhes?.modifiedCount || result.detalhes?.nModified || 0;
            alert(`Sucesso! Processados: ${products.length} produtos.\n(Novos: ${upserted} | Atualizados: ${modified})`);
            loadInitialData(1);
        } else if (response.status === 401 || response.status === 403) {
            alert("Sua sessão expirou. Faça login para sincronizar a planilha.");
            window.location.href = 'login.html';
        } else { 
            throw new Error(result.error || "Erro desconhecido"); 
        }
    } catch (err) {
        alert("Erro no servidor: " + err.message);
        document.getElementById('upload-status').innerText = "❌ Eredro na sincronização.";
    }
}