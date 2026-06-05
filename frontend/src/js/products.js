let allProducts = [];
let categories = [];
let customAttributes = [];
let currentPage = 1;
const itemsPerPage = 25;
let totalPages = 0;
let totalItems = 0;
let editingProductId = null;
let productToDeleteId = null;
const API_BASE_URL = "https://jack-pecas-backend.onrender.com";
//const API_BASE_URL = "http://localhost:3000";

document.addEventListener('DOMContentLoaded', async () => {
    let searchTimer;
    document.getElementById('search-input')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            filterProducts();
        }, 400);
    });
    document.getElementById('filter-category')?.addEventListener('change', updateFilterSubcategories);
    document.getElementById('filter-subcategory')?.addEventListener('change', filterProducts);

    await loadInitialData();
});

async function loadInitialData(page = 1) {
    currentPage = page;
    const term = document.getElementById('search-input')?.value.trim();
    const cat = document.getElementById('filter-category')?.value || "";
    const sub = document.getElementById('filter-subcategory')?.value || "";

    const tableBody = document.getElementById('product-list-body');

    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="p-20 text-center">
                    <div class="flex flex-col items-center justify-center gap-4">
                        <span class="loader"></span>
                        <p class="text-gray-400 animate-pulse font-bold text-sm tracking-widest">CARREGANDO PRODUTOS...</p>
                    </div>
                </td>
            </tr>
        `;
    }

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
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-red-500">Erro ao conectar com o servidor.</td></tr>`;
        }
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
    
    // Libera os campos para novos produtos
    setInputLockState(false);
    
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
    
    if (document.getElementById('p-stock-sao-roque')) document.getElementById('p-stock-sao-roque').value = '';
    if (document.getElementById('p-stock-cotia')) document.getElementById('p-stock-cotia').value = '';
    if (document.getElementById('p-stock-ibiuna')) document.getElementById('p-stock-ibiuna').value = '';
    
    document.getElementById('p-category').value = '';
    document.getElementById('p-subcategory').innerHTML = '<option value="">Selecione a categoria primeiro</option>';
    document.getElementById('attributes-fields').innerHTML = '';
    document.getElementById('p-has-variations').checked = false;
    document.getElementById('variations-list').innerHTML = '';
    document.getElementById('variations-container').classList.add('hidden');
    
    const storesFields = ['p-stock-sao-roque', 'p-stock-cotia', 'p-stock-ibiuna'];
    storesFields.forEach(id => {
        const fieldEl = document.getElementById(id)?.parentElement;
        if (fieldEl) {
            fieldEl.style.opacity = "1";
            fieldEl.style.pointerEvents = "auto";
        }
    });
}

/**
 * Controla se os campos de estoque e preço podem ser editados ou não.
 */
function setInputLockState(disabled) {
    const fields = ['p-price', 'p-stock-sao-roque', 'p-stock-cotia', 'p-stock-ibiuna', 'p-has-variations'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = disabled;
            // Se for checkbox e estiver bloqueado, desativa a div dele
            if(el.type === 'checkbox') {
                el.parentElement.style.opacity = disabled ? "0.5" : "1";
                el.parentElement.style.pointerEvents = disabled ? "none" : "auto";
            } else {
                // Muda o visual de inputs de texto/número bloqueados
                if (disabled) {
                    el.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-800');
                } else {
                    el.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-800');
                }
            }
        }
    });
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

function toggleVariations() {
    // Se estiver editando, não permite alternar variações manualmente
    if (editingProductId) return;

    const hasVar = document.getElementById('p-has-variations').checked;
    const container = document.getElementById('variations-container');
    const storesFields = ['p-stock-sao-roque', 'p-stock-cotia', 'p-stock-ibiuna'];

    if (hasVar) {
        container.classList.remove('hidden');
        storesFields.forEach(id => {
            const fieldEl = document.getElementById(id)?.parentElement;
            if (fieldEl) {
                fieldEl.style.opacity = "0.3";
                fieldEl.style.pointerEvents = "none";
            }
        });
        if (document.getElementById('variations-list').children.length === 0) {
            addVariationRow();
        }
    } else {
        container.classList.add('hidden');
        storesFields.forEach(id => {
            const fieldEl = document.getElementById(id)?.parentElement;
            if (fieldEl) {
                fieldEl.style.opacity = "1";
                fieldEl.style.pointerEvents = "auto";
            }
        });
    }
}

function addVariationRow(data = {}) {
    const list = document.getElementById('variations-list');
    const div = document.createElement('div');
    div.className = "variation-row grid grid-cols-1 md:grid-cols-6 gap-3 bg-[#1a2233] p-4 rounded-xl border border-gray-800 mb-2";

    const stockSR = data.stock_by_store?.SaoRoque ?? data.stockSaoRoque ?? data.stock ?? 0;
    const stockCO = data.stock_by_store?.Cotia ?? data.stockCotia ?? 0;
    const stockIB = data.stock_by_store?.Ibiuna ?? data.stockIbiuna ?? 0;

    // Verifica se os campos devem estar travados (se o produto veio do Bling/Edição)
    const isDisabled = editingProductId ? 'disabled' : '';
    const inputClasses = editingProductId 
        ? "v-stock w-full p-2 mt-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-400 outline-none cursor-not-allowed opacity-60"
        : "v-stock w-full p-2 mt-1 rounded bg-gray-900 border border-gray-700 text-xs text-white outline-none focus:border-accent";

    div.innerHTML = `
        <div>
            <label class="text-[9px] text-gray-500 uppercase font-bold">Tipo</label>
            <input type="text" list="variation-types" placeholder="Ex: Versão" 
                value="${data.type || 'Cor'}" ${isDisabled}
                class="v-type w-full p-2 mt-1 rounded ${editingProductId ? 'bg-gray-800 text-gray-400' : 'bg-gray-900 text-white'} border border-gray-700 text-xs outline-none focus:border-accent">
            <datalist id="variation-types">
                <option value="Cor">
                <option value="Qualidade">
                <option value="Modelo">
                <option value="Versão">
            </datalist>
        </div>
        <div>
            <label class="text-[9px] text-gray-500 uppercase font-bold">Valor</label>
            <input type="text" placeholder="Ex: M15" value="${data.value || ''}" ${isDisabled}
                class="v-value w-full p-2 mt-1 rounded ${editingProductId ? 'bg-gray-800 text-gray-400' : 'bg-gray-900 text-white'} border border-gray-700 text-xs outline-none focus:border-accent">
        </div>
        <div>
            <label class="text-[9px] text-orange-400 uppercase font-bold">Estoque S.R</label>
            <input type="number" placeholder="0" value="${stockSR}" ${isDisabled} class="v-stock-sao-roque ${inputClasses}">
        </div>
        <div>
            <label class="text-[9px] text-sky-400 uppercase font-bold">Estoque Cotia</label>
            <input type="number" placeholder="0" value="${stockCO}" ${isDisabled} class="v-stock-cotia ${inputClasses}">
        </div>
        <div>
            <label class="text-[9px] text-purple-400 uppercase font-bold">Estoque Ibiúna</label>
            <input type="number" placeholder="0" value="${stockIB}" ${isDisabled} class="v-stock-ibiuna ${inputClasses}">
        </div>
        <div class="flex gap-2 items-end">
            <div class="flex-1">
                <label class="text-[9px] text-gray-500 uppercase font-bold">SKU</label>
                <input type="text" placeholder="Opcional" value="${data.sku || ''}" ${isDisabled}
                    class="v-sku w-full p-2 mt-1 rounded ${editingProductId ? 'bg-gray-800 text-gray-400' : 'bg-gray-900 text-white'} border border-gray-700 text-xs outline-none focus:border-accent">
            </div>
            ${!editingProductId ? `
                <button type="button" onclick="this.closest('.variation-row').remove()" 
                    class="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white p-2.5 rounded-lg transition-all mb-[1px]">✕</button>
            ` : `<div class="w-[38px]"></div>`}
        </div>
    `;
    list.appendChild(div);
    
    // Oculta botão de adicionar novas variações na tela de edição
    const addVarBtn = document.getElementById('btn-add-variation');
    if (addVarBtn) {
        addVarBtn.style.display = editingProductId ? 'none' : 'block';
    }
}

const TAG_PALETTE = [
    { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20' },
    { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
    { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' }
];

function getTagStyle(text) {
    if (!text) return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    const cleanText = text.toLowerCase();
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
    const btnSave = document.getElementById('btn-save-product');
    const originalBtnText = btnSave.innerHTML;
    
    const name = document.getElementById('p-name').value;
    const category = document.getElementById('p-category').value;
    if (!name || !category) {
        showNotification("Nome e Categoria são obrigatórios", "error");
        return;
    }

    try {
        btnSave.disabled = true;
        btnSave.classList.add('opacity-50', 'cursor-not-allowed');
        btnSave.innerHTML = `<svg class="animate-spin h-4 w-4 mr-2 border-t-2 border-white rounded-full inline-block" viewBox="0 0 24 24"></svg> SALVANDO...`;

        const sku = document.getElementById('p-sku').value;
        const price = document.getElementById('p-price').value || "0";
        const subcategory = document.getElementById('p-subcategory').value;
        const hasVariations = document.getElementById('p-has-variations').checked;

        const productPayload = {
            name,
            sku,
            category,
            subcategory,
            price: parseFloat(price),
            hasVariations
        };

        if (hasVariations) {
            const varRows = document.querySelectorAll('.variation-row');
            const variations = Array.from(varRows).map(row => ({
                type: row.querySelector('.v-type').value,
                value: row.querySelector('.v-value').value,
                sku: row.querySelector('.v-sku').value,
                price: parseFloat(price),
                stock_by_store: {
                    SaoRoque: parseInt(row.querySelector('.v-stock-sao-roque').value) || 0,
                    Cotia: parseInt(row.querySelector('.v-stock-cotia').value) || 0,
                    Ibiuna: parseInt(row.querySelector('.v-stock-ibiuna').value) || 0
                }
            }));
            
            productPayload.variations = variations;
            productPayload.stock_by_store = {
                SaoRoque: variations.reduce((acc, v) => acc + v.stock_by_store.SaoRoque, 0),
                Cotia: variations.reduce((acc, v) => acc + v.stock_by_store.Cotia, 0),
                Ibiuna: variations.reduce((acc, v) => acc + v.stock_by_store.Ibiuna, 0)
            };
        } else {
            productPayload.stock_by_store = {
                SaoRoque: parseInt(document.getElementById('p-stock-sao-roque').value) || 0,
                Cotia: parseInt(document.getElementById('p-stock-cotia').value) || 0,
                Ibiuna: parseInt(document.getElementById('p-stock-ibiuna').value) || 0
            };
            productPayload.variations = [];
        }

        const attrs = {};
        document.querySelectorAll('.dynamic-attr').forEach(el => {
            if (el.value) attrs[el.getAttribute('data-name')] = el.value;
        });
        productPayload.attributes = attrs;

        const url = editingProductId ? `${API_BASE_URL}/api/products/${editingProductId}` : `${API_BASE_URL}/api/products`;
        const method = editingProductId ? 'PUT' : 'POST';
        const token = localStorage.getItem('admin_token');

        const res = await fetch(url, { 
            method, 
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(productPayload)
        });

        if (res.ok) {
            showNotification(editingProductId ? "Produto atualizado!" : "Produto criado!");
            closeForm();
            loadInitialData(currentPage);
        } else {
            const errorData = await res.json();
            showNotification(errorData.error || "Erro ao salvar", "error");
        }

    } catch (err) {
        console.error(err);
        showNotification("Erro de conexão ou processamento", "error");
    } finally {
        btnSave.disabled = false;
        btnSave.classList.remove('opacity-50', 'cursor-not-allowed');
        btnSave.innerHTML = originalBtnText;
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
    
    if (document.getElementById('p-stock-sao-roque')) {
        document.getElementById('p-stock-sao-roque').value = p.stock_by_store?.SaoRoque ?? p.stockSaoRoque ?? 0;
    }
    if (document.getElementById('p-stock-cotia')) {
        document.getElementById('p-stock-cotia').value = p.stock_by_store?.Cotia ?? p.stockCotia ?? 0;
    }
    if (document.getElementById('p-stock-ibiuna')) {
        document.getElementById('p-stock-ibiuna').value = p.stock_by_store?.Ibiuna ?? p.stockIbiuna ?? 0;
    }
    
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
        document.getElementById('variations-container').classList.add('hidden');
    }

    // TRAVA os campos de estoque e preço para edição
    setInputLockState(true);

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
        container.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-gray-500 italic">Nenhum produto encontrado.</td></tr>`;
        return;
    }

    container.innerHTML = allProducts.map(p => {
        const hasVars = p.hasVariations && p.variations?.length > 0;

        let stSaoRoque = 0;
        let stCotia = 0;
        let stIbiuna = 0;

        if (hasVars) {
            p.variations.forEach(v => {
                stSaoRoque += v.stock_by_store?.SaoRoque ?? v.stockSaoRoque ?? 0;
                stCotia += v.stock_by_store?.Cotia ?? v.stockCotia ?? 0;
                stIbiuna += v.stock_by_store?.Ibiuna ?? v.stockIbiuna ?? 0;
            });
        } else {
            stSaoRoque = p.stock_by_store?.SaoRoque ?? p.stockSaoRoque ?? 0;
            stCotia = p.stock_by_store?.Cotia ?? p.stockCotia ?? 0;
            stIbiuna = p.stock_by_store?.Ibiuna ?? p.stockIbiuna ?? 0;
        }

        const attributeBadges = p.attributes ? Object.entries(p.attributes)
            .map(([key, value]) => {
                if (!value) return ''; 
                const badgeStyle = getTagStyle(value);
                return `<span class="${badgeStyle} text-[9px] px-1.5 py-0.5 rounded border mr-1 mt-1 inline-block uppercase font-bold">${value}</span>`;
            }).join('') : '';

        const arrowIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 transition-transform duration-300 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
        const editIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
        const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;

        let rowsHtml = `
        <tr class="hover:bg-white/[0.02] transition-colors border-b border-gray-800/50 group">
            <td class="p-4">
                <div class="flex items-center gap-4">
                    <div class="w-6 flex justify-center">
                        ${hasVars ? `<button onclick="toggleVariationRows('${p._id}', this)" class="text-gray-500 hover:text-accent flex items-center justify-center transition-all">${arrowIcon}</button>` : ''}
                    </div>
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-sm font-bold text-white group-hover:text-accent transition-colors">${p.name}</span>
                        </div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-tight">${p.category} • ${p.subcategory || 'Geral'}</div>
                        <div class="flex flex-wrap mt-1">${attributeBadges}</div>
                    </div>
                </div>
            </td>
            <td class="p-4 text-center font-mono text-xs text-gray-400">${p.sku || '---'}</td>
            
            <td class="p-4 text-center">
                <span class="px-2.5 py-1 rounded-md text-[10px] font-bold ${stSaoRoque > 0 ? 'bg-orange-500/10 text-orange-400' : 'bg-red-500/10 text-red-400'} border border-current">
                    ${hasVars ? '<span class="opacity-40 mr-0.5 text-gray-400">Total:</span>' : ''}${stSaoRoque}
                </span>
            </td>
            
            <td class="p-4 text-center">
                <span class="px-2.5 py-1 rounded-md text-[10px] font-bold ${stCotia > 0 ? 'bg-sky-500/10 text-sky-400' : 'bg-red-500/10 text-red-400'} border border-current">
                    ${hasVars ? '<span class="opacity-40 mr-0.5 text-gray-400">Total:</span>' : ''}${stCotia}
                </span>
            </td>
            
            <td class="p-4 text-center">
                <span class="px-2.5 py-1 rounded-md text-[10px] font-bold ${stIbiuna > 0 ? 'bg-purple-500/10 text-purple-400' : 'bg-red-500/10 text-red-400'} border border-current">
                    ${hasVars ? '<span class="opacity-40 mr-0.5 text-gray-400">Total:</span>' : ''}${stIbiuna}
                </span>
            </td>

            <td class="p-4 text-center font-black text-white text-sm">R$ ${parseFloat(p.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td class="p-4 text-right">
                <div class="flex justify-end gap-1">
                    <button onclick="editProduct('${p._id}')" class="p-2 hover:bg-accent/20 text-gray-400 hover:text-accent rounded-lg transition-colors">${editIcon}</button>
                    <button onclick="deleteProduct('${p._id}')" class="p-2 hover:bg-red-600/20 text-gray-400 hover:text-red-400 rounded-lg transition-colors">${deleteIcon}</button>
                </div>
            </td>
        </tr>`;

        if (hasVars) {
            p.variations.forEach(v => {
                const vSR = v.stock_by_store?.SaoRoque ?? v.stockSaoRoque ?? 0;
                const vCO = v.stock_by_store?.Cotia ?? v.stockCotia ?? 0;
                const vIB = v.stock_by_store?.Ibiuna ?? v.stockIbiuna ?? 0;

                rowsHtml += `
        <tr class="child-of-${p._id} hidden bg-black/20 border-b border-gray-800/30">
            <td class="p-2 pl-12"> 
                <div class="flex items-center gap-3 relative">
                    <div class="absolute -left-6 top-0 bottom-0 w-px bg-gray-700"></div>
                    <div class="absolute -left-6 top-1/2 w-4 h-px bg-gray-700"></div>
                    <div class="text-[11px] flex items-center gap-2">
                        <span class="font-bold text-accent uppercase">${v.type}:</span>
                        <span class="text-gray-300">${v.value}</span>
                    </div>
                </div>
            </td>
            <td class="p-2 text-center font-mono text-[10px] text-gray-500">${v.sku || '---'}</td>
            <td class="p-2 text-center text-[10px] text-orange-400 font-medium">${vSR} un</td>
            <td class="p-2 text-center text-[10px] text-sky-400 font-medium">${vCO} un</td>
            <td class="p-2 text-center text-[10px] text-purple-400 font-medium">${vIB} un</td>
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

    const msgElement = document.getElementById('delete-modal-msg');
    if (msgElement) {
        msgElement.innerHTML = `Deseja realmente excluir o produto <br><b class="text-white">${p.name}</b>?`;
    }

    document.getElementById('delete-modal').classList.remove('hidden');
}

async function confirmDelete() {
    const token = localStorage.getItem('admin_token');
    const btnConfirm = document.getElementById('confirm-delete-btn');
    const originalBtnText = "Sim, Excluir";

    try {
        if (btnConfirm) {
            btnConfirm.disabled = true;
            btnConfirm.innerHTML = `<span class="inline-block animate-spin mr-2">⏳</span> EXCLUINDO...`;
            btnConfirm.classList.replace('bg-red-600', 'bg-red-800');
        }

        const res = await fetch(`${API_BASE_URL}/api/products/${productToDeleteId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            showNotification("Produto removido com sucesso!");
            closeDeleteModal(); 
            loadInitialData(currentPage);
        } else if (res.status === 401 || res.status === 403) {
            alert("Sessão expirada. Faça login novamente.");
            window.location.href = 'login.html';
        } else {
            const errorData = await res.json();
            showNotification(errorData.error || "Erro ao excluir", "error");
        }
    } catch (err) {
        showNotification("Erro de conexão", "error");
    } finally {
        if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.innerText = originalBtnText;
            btnConfirm.classList.replace('bg-red-800', 'bg-red-600');
        }
    }
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.add('hidden');
    productToDeleteId = null;
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

            const productsMap = {};
            let currentParentSku = null;

            rows.forEach((row, index) => {
                const tipo = (row.Tipo || 'Simples').trim();
                const sku = String(row.SKU || `AUTO-${index}`).trim();
                
                let precoFinal = 0;
                if (row.Preço) {
                    let pRaw = String(row.Preço).replace('R$', '').trim();
                    if (pRaw.includes(',') && pRaw.includes('.')) {
                        pRaw = pRaw.replace(/\./g, '').replace(',', '.');
                    } else if (pRaw.includes(',')) {
                        pRaw = pRaw.replace(',', '.');
                    }
                    precoFinal = parseFloat(pRaw) || 0;
                }

                const p = {
                    sku: sku,
                    name: row["Nome do Produto"] || "Sem Nome",
                    price: precoFinal,
                    stock_by_store: {
                        SaoRoque: parseInt(row.SaoRoque || row.Estoque) || 0,
                        Cotia: parseInt(row.Cotia) || 0,
                        Ibiuna: parseInt(row.Ibiuna) || 0
                    },
                    category: row.Categoria || "Telas",
                    subcategory: row.Subcategoria || "Iphone",
                    attributes: {}, 
                    variations: [],
                    hasVariations: false
                };

                const camposFixos = ['SKU', 'Nome do Produto', 'Tipo', 'Preço', 'Estoque', 'Categoria', 'Subcategoria', 'SaoRoque', 'Cotia', 'Ibiuna'];
                Object.keys(row).forEach(key => {
                    if (!camposFixos.includes(key) && row[key] !== undefined && row[key] !== "") {
                        p.attributes[key] = String(row[key]).trim();
                    }
                });

                if (tipo === 'Pai') {
                    p.hasVariations = true;
                    p.stock_by_store = { SaoRoque: 0, Cotia: 0, Ibiuna: 0 };
                    currentParentSku = sku;
                    productsMap[sku] = p;
                } else if (tipo === 'Var' && currentParentSku && productsMap[currentParentSku]) {
                    let nomeCompleto = p.name;
                    let tipoVar = 'Cor'; 
                    let valorVar = nomeCompleto;

                    if (nomeCompleto.includes(':')) {
                        const partes = nomeCompleto.split(':');
                        tipoVar = partes[0].trim(); 
                        valorVar = partes[1].trim(); 
                    }
                    
                    productsMap[currentParentSku].variations.push({
                        sku: p.sku,
                        type: tipoVar, 
                        value: valorVar,
                        price: p.price,
                        stock_by_store: p.stock_by_store
                    });
                    
                    productsMap[currentParentSku].stock_by_store.SaoRoque += p.stock_by_store.SaoRoque;
                    productsMap[currentParentSku].stock_by_store.Cotia += p.stock_by_store.Cotia;
                    productsMap[currentParentSku].stock_by_store.Ibiuna += p.stock_by_store.Ibiuna;
                } else {
                    productsMap[sku] = p;
                }
            });

            const toSend = Object.values(productsMap);
            await sendBatch(toSend);

        } catch (err) {
            status.innerText = "❌ Erro no processamento.";
            console.error(err);
            alert("Erro ao ler arquivo: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

async function sendBatch(products) {
    const token = localStorage.getItem('admin_token');
    try {
        const response = await fetch(`${API_BASE_URL}/api/products/batch`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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
        document.getElementById('upload-status').innerText = "❌ Erro na sincronização.";
    }
}