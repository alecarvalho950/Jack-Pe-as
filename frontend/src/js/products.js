let allProducts = [];
let categories = [];
let customAttributes = [];
let currentPage = 1;
const itemsPerPage = 25;
let totalPages = 0;
let totalItems = 0;
let editingProductId = null;
const API_BASE_URL = "https://jack-pecas-backend.onrender.com";
// const API_BASE_URL = "http://localhost:3000";

document.addEventListener('DOMContentLoaded', async () => {
    let searchTimer;
    document.getElementById('search-input')?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => filterProducts(), 400);
    });
    document.getElementById('filter-category')?.addEventListener('change', updateFilterSubcategories);
    document.getElementById('filter-subcategory')?.addEventListener('change', filterProducts);

    await loadInitialData();
});

/* ──────────────────────────────────────────
   CARREGAMENTO DE DADOS
────────────────────────────────────────── */

async function loadInitialData(page = 1) {
    currentPage = page;
    const term = document.getElementById('search-input')?.value.trim();
    const cat  = document.getElementById('filter-category')?.value  || "";
    const sub  = document.getElementById('filter-subcategory')?.value || "";

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
            </tr>`;
    }

    try {
        const url = new URL(`${API_BASE_URL}/api/products`);
        url.searchParams.append('page', page);
        url.searchParams.append('limit', itemsPerPage);
        if (term) url.searchParams.append('search', term);
        if (cat)  url.searchParams.append('category', cat);
        if (sub)  url.searchParams.append('subcategory', sub);

        const [resCat, resProd, resAttr] = await Promise.all([
            fetch(`${API_BASE_URL}/api/categories`),
            fetch(url),
            fetch(`${API_BASE_URL}/api/attributes`)
        ]);

        categories       = await resCat.json();
        const productData = await resProd.json();
        customAttributes = await resAttr.json();

        if (productData.products) {
            allProducts = productData.products;
            totalPages  = productData.pages;
            totalItems  = productData.total;
        } else {
            allProducts = Array.isArray(productData) ? productData : [];
            totalPages  = 1;
            totalItems  = allProducts.length;
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

    const savedPCat = pCat.value;
    const savedFCat = fCat.value;

    pCat.innerHTML = '<option value="">Selecione...</option>';
    fCat.innerHTML = '<option value="">Todas as Categorias</option>';

    categories.forEach(c => {
        const opt = `<option value="${c.name}">${c.name}</option>`;
        pCat.innerHTML += opt;
        fCat.innerHTML += opt;
    });

    if (savedPCat) pCat.value = savedPCat;
    if (savedFCat) fCat.value = savedFCat;
}

/* ──────────────────────────────────────────
   FORMULÁRIO DE EDIÇÃO
────────────────────────────────────────── */

function showFormUI() {
    document.getElementById('product-form-container').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeForm() {
    document.getElementById('product-form-container').classList.add('hidden');
    editingProductId = null;
}

// Preenche subcategorias no select (só leitura, mas precisa ter o valor correto)
function updateSubcategories(selectedSub = "") {
    const catName  = document.getElementById('p-category').value;
    const subSelect = document.getElementById('p-subcategory');

    subSelect.innerHTML = '<option value="">Selecione...</option>';
    const catObj = categories.find(c => c.name === catName);
    if (catObj?.subcategories) {
        catObj.subcategories.forEach(s => {
            subSelect.innerHTML += `<option value="${s}" ${s === selectedSub ? 'selected' : ''}>${s}</option>`;
        });
    }

    // Atributos técnicos dinâmicos
    const attrContainer = document.getElementById('dynamic-attributes-container');
    const attrFields    = document.getElementById('attributes-fields');
    const relevantAttrs = customAttributes.filter(a => a.category === catName);

    if (relevantAttrs.length > 0) {
        attrContainer.classList.remove('hidden');
        attrFields.innerHTML = relevantAttrs.map(attr => `
            <div class="flex flex-col">
                <label class="text-[10px] text-gray-500 uppercase font-bold">${attr.name}</label>
                ${attr.type === 'select'
                    ? `<select class="dynamic-attr bg-gray-800 border border-gray-700 p-2 rounded text-sm text-white outline-none focus:border-accent" data-name="${attr.name}">
                           <option value="">Selecione...</option>
                           ${attr.options.map(o => `<option value="${o}">${o}</option>`).join('')}
                       </select>`
                    : `<input type="text" class="dynamic-attr bg-gray-800 border border-gray-700 p-2 rounded text-sm text-white outline-none focus:border-accent" data-name="${attr.name}" placeholder="Valor...">`
                }
            </div>`).join('');
    } else {
        attrContainer.classList.add('hidden');
    }
}

function editProduct(id) {
    const p = allProducts.find(item => item._id === id);
    if (!p) return;

    editingProductId = id;

    // Preenche campos somente-leitura
    document.getElementById('p-name').value  = p.name  || '';
    document.getElementById('p-sku').value   = p.sku   || '';
    document.getElementById('p-price').value = p.price || 0;

    document.getElementById('p-stock-sao-roque').value = p.stock_by_store?.SaoRoque ?? 0;
    document.getElementById('p-stock-cotia').value     = p.stock_by_store?.Cotia    ?? 0;
    document.getElementById('p-stock-ibiuna').value    = p.stock_by_store?.Ibiuna   ?? 0;

    document.getElementById('p-category').value = p.category || '';

    // Variações: só exibição
    const varCheck     = document.getElementById('p-has-variations');
    const varContainer = document.getElementById('variations-container');
    const varList      = document.getElementById('variations-list');

    varList.innerHTML = '';
    varCheck.checked  = !!p.hasVariations;

    if (p.hasVariations && p.variations?.length > 0) {
        varContainer.classList.remove('hidden');
        p.variations.forEach(v => addVariationRow(v));
    } else {
        varContainer.classList.add('hidden');
    }

    // Popula subcategoria + atributos
    updateSubcategories(p.subcategory);

    // Aguarda render do select para setar atributos existentes
    setTimeout(() => {
        if (p.attributes) {
            Object.keys(p.attributes).forEach(key => {
                const el = document.querySelector(`.dynamic-attr[data-name="${key}"]`);
                if (el) el.value = p.attributes[key];
            });
        }
    }, 150);

    showFormUI();
}

// Renderiza linha de variação em modo somente-leitura
function addVariationRow(data = {}) {
    const list = document.getElementById('variations-list');
    const div  = document.createElement('div');
    div.className = "variation-row grid grid-cols-1 md:grid-cols-6 gap-3 bg-[#1a2233] p-4 rounded-xl border border-gray-800 mb-2";

    const sr = data.stock_by_store?.SaoRoque ?? 0;
    const co = data.stock_by_store?.Cotia    ?? 0;
    const ib = data.stock_by_store?.Ibiuna   ?? 0;

    const roClass = "w-full p-2 mt-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-400 outline-none cursor-not-allowed opacity-60";

    div.innerHTML = `
        <div>
            <label class="text-[9px] text-gray-500 uppercase font-bold">Tipo</label>
            <input type="text" value="${data.type || 'Cor'}" readonly class="${roClass}">
        </div>
        <div>
            <label class="text-[9px] text-gray-500 uppercase font-bold">Valor</label>
            <input type="text" value="${data.value || ''}" readonly class="${roClass}">
        </div>
        <div>
            <label class="text-[9px] text-orange-400 uppercase font-bold">Estoque S.R</label>
            <input type="number" value="${sr}" readonly class="${roClass}">
        </div>
        <div>
            <label class="text-[9px] text-sky-400 uppercase font-bold">Estoque Cotia</label>
            <input type="number" value="${co}" readonly class="${roClass}">
        </div>
        <div>
            <label class="text-[9px] text-purple-400 uppercase font-bold">Estoque Ibiúna</label>
            <input type="number" value="${ib}" readonly class="${roClass}">
        </div>
        <div>
            <label class="text-[9px] text-gray-500 uppercase font-bold">SKU</label>
            <input type="text" value="${data.sku || ''}" readonly class="${roClass}">
        </div>`;

    list.appendChild(div);
}

/* ──────────────────────────────────────────
   SALVAR (apenas atributos)
────────────────────────────────────────── */

async function saveProduct() {
    if (!editingProductId) return;

    const btnSave   = document.getElementById('btn-save-product');
    const origLabel = btnSave.innerHTML;

    // Coleta somente atributos dinâmicos
    const attrs = {};
    document.querySelectorAll('.dynamic-attr').forEach(el => {
        if (el.value) attrs[el.getAttribute('data-name')] = el.value;
    });

    const payload = { attributes: attrs };

    try {
        btnSave.disabled  = true;
        btnSave.innerHTML = `<span class="inline-block animate-spin mr-2 border-t-2 border-black rounded-full w-4 h-4"></span> SALVANDO...`;
        btnSave.classList.add('opacity-60', 'cursor-not-allowed');

        const token = localStorage.getItem('admin_token');
        const res   = await fetch(`${API_BASE_URL}/api/products/${editingProductId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showNotification("Atributos atualizados com sucesso!");
            closeForm();
            loadInitialData(currentPage);
        } else if (res.status === 401 || res.status === 403) {
            alert("Sessão expirada. Faça login novamente.");
            window.location.href = 'login.html';
        } else {
            const err = await res.json();
            showNotification(err.error || err.message || "Erro ao salvar", "error");
        }
    } catch (err) {
        showNotification("Erro de conexão", "error");
    } finally {
        btnSave.disabled  = false;
        btnSave.innerHTML = origLabel;
        btnSave.classList.remove('opacity-60', 'cursor-not-allowed');
    }
}

/* ──────────────────────────────────────────
   FILTROS
────────────────────────────────────────── */

function filterProducts() {
    loadInitialData(1);
}

function updateFilterSubcategories() {
    const catName  = document.getElementById('filter-category').value;
    const subFilter = document.getElementById('filter-subcategory');
    if (!subFilter) return;

    subFilter.innerHTML = '<option value="">Todas as Subcategorias</option>';
    if (catName) {
        const catObj = categories.find(c => c.name === catName);
        catObj?.subcategories?.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s; opt.textContent = s;
            subFilter.appendChild(opt);
        });
    }
    filterProducts();
}

/* ──────────────────────────────────────────
   RENDER DA TABELA
────────────────────────────────────────── */

const TAG_PALETTE = [
    { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    { bg: 'bg-sky-500/10',     text: 'text-sky-400',     border: 'border-sky-500/20' },
    { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
    { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/20' },
    { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/20' }
];

function getTagStyle(text) {
    if (!text) return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    const t = text.toLowerCase();
    if (t.includes('original')) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (t.includes('china'))    return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
    const s = TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
    return `${s.bg} ${s.text} ${s.border}`;
}

/* ──────────────────────────────────────────
   RENDER DA TABELA (Responsiva)
────────────────────────────────────────── */

function renderProducts() {
    const container = document.getElementById('product-list-body');
    if (!container) return;

    if (allProducts.length === 0) {
        container.innerHTML = `<tr class="block md:table-row"><td colspan="7" class="block md:table-cell p-10 text-center text-gray-500 italic">Nenhum produto encontrado.</td></tr>`;
        return;
    }

    const editIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
    const arrowIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 transition-transform duration-300 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

    container.innerHTML = allProducts.map(p => {
        const hasVars = p.hasVariations && p.variations?.length > 0;

        let srTotal = 0, coTotal = 0, ibTotal = 0;
        if (hasVars) {
            p.variations.forEach(v => {
                srTotal += v.stock_by_store?.SaoRoque ?? 0;
                coTotal += v.stock_by_store?.Cotia    ?? 0;
                ibTotal += v.stock_by_store?.Ibiuna   ?? 0;
            });
        } else {
            srTotal = p.stock_by_store?.SaoRoque ?? 0;
            coTotal = p.stock_by_store?.Cotia    ?? 0;
            ibTotal = p.stock_by_store?.Ibiuna   ?? 0;
        }

        const attrBadges = p.attributes
            ? Object.entries(p.attributes).map(([, v]) => v
                ? `<span class="${getTagStyle(v)} text-[9px] px-1.5 py-0.5 rounded border mr-1 mt-1 inline-block uppercase font-bold">${v}</span>`
                : '').join('')
            : '';

        const stockBadge = (val, color) => {
            const hasStock = val > 0;
            return `<span class="px-2.5 py-1 rounded-md text-[10px] font-bold ${hasStock ? `bg-${color}-500/10 text-${color}-400` : 'bg-red-500/10 text-red-400'} border border-current">
                        ${hasVars ? `<span class="opacity-40 mr-0.5 text-gray-400">∑</span>` : ''}${val}
                    </span>`;
        };

        // NOVO: Container de Variações exclusivo para MOBILE (Fica dentro do bloco do Produto)
        let mobileVariationsHtml = '';
        if (hasVars) {
            mobileVariationsHtml = `<div class="var-mobile-${p._id} hidden md:hidden mt-4 bg-gray-900/60 rounded-xl p-3 border border-gray-800 w-full shadow-inner">`;
            p.variations.forEach(v => {
                const vSR = v.stock_by_store?.SaoRoque ?? 0;
                const vCO = v.stock_by_store?.Cotia    ?? 0;
                const vIB = v.stock_by_store?.Ibiuna   ?? 0;
                mobileVariationsHtml += `
                    <div class="mb-3 last:mb-0 pb-3 last:pb-0 border-b border-gray-800/50 last:border-0">
                        <div class="flex items-center justify-between mb-2">
                            <div class="text-[11px] flex items-center gap-2">
                                <span class="font-bold text-accent uppercase">${v.type}:</span>
                                <span class="text-gray-300 font-medium">${v.value}</span>
                            </div>
                            <span class="font-mono text-[10px] text-gray-500">${v.sku || '---'}</span>
                        </div>
                        <div class="flex items-center justify-between bg-black/20 p-2 rounded-lg border border-gray-800/30">
                            <div class="flex flex-col items-center"><span class="text-[8px] text-gray-500 uppercase font-bold tracking-widest mb-1">S. Roque</span><span class="text-xs font-bold text-orange-400">${vSR}</span></div>
                            <div class="flex flex-col items-center"><span class="text-[8px] text-gray-500 uppercase font-bold tracking-widest mb-1">Cotia</span><span class="text-xs font-bold text-sky-400">${vCO}</span></div>
                            <div class="flex flex-col items-center"><span class="text-[8px] text-gray-500 uppercase font-bold tracking-widest mb-1">Ibiúna</span><span class="text-xs font-bold text-purple-400">${vIB}</span></div>
                        </div>
                    </div>
                `;
            });
            mobileVariationsHtml += `</div>`;
        }

        // Adicionado: md:border-b para restaurar a linha da tabela no Desktop
        let html = `
        <tr class="block md:table-row bg-[#111827] md:bg-transparent rounded-2xl border border-gray-800 md:border-b md:border-gray-800/60 md:border-x-0 md:border-t-0 mb-6 md:mb-0 hover:bg-white/[0.02] transition-colors group shadow-lg md:shadow-none overflow-hidden">
            
            <!-- PRODUTO -->
            <td class="block md:table-cell p-4 md:py-4 border-b border-gray-800/60 md:border-none bg-gray-900/30 md:bg-transparent">
                <div class="flex items-start md:items-center gap-4">
                    <div class="w-6 flex justify-center mt-1 md:mt-0">
                        ${hasVars ? `<button onclick="toggleVariationRows('${p._id}', this)" class="text-gray-500 hover:text-accent flex items-center justify-center transition-all bg-gray-800 md:bg-transparent p-1.5 md:p-0 rounded-lg">${arrowIcon}</button>` : ''}
                    </div>
                    <div class="flex-1 w-full">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-sm font-bold text-white group-hover:text-accent transition-colors">${p.name}</span>
                            ${hasVars ? `<span class="text-[9px] font-black bg-sky-950/50 text-sky-400 border border-sky-900/40 px-1.5 py-0.5 rounded uppercase">Variações</span>` : ''}
                        </div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-tight">${p.category || ''} • ${p.subcategory || 'Geral'}</div>
                        <div class="flex flex-wrap mt-2 md:mt-1">${attrBadges}</div>
                        
                        <!-- Variações renderizadas dentro do Card no Celular -->
                        ${mobileVariationsHtml}
                    </div>
                </div>
            </td>

            <!-- SKU -->
            <td class="flex md:table-cell justify-between items-center p-3 md:p-4 border-b border-gray-800/40 md:border-none mx-2 md:mx-0">
                <span class="md:hidden text-[10px] uppercase font-bold text-gray-500 tracking-widest">SKU</span>
                <span class="text-center font-mono text-xs text-gray-400">${p.sku || '---'}</span>
            </td>

            <!-- ESTOQUES -->
            <td class="flex md:table-cell justify-between items-center p-3 md:p-4 border-b border-gray-800/40 md:border-none mx-2 md:mx-0">
                <span class="md:hidden text-[10px] uppercase font-bold text-gray-500 tracking-widest">São Roque</span>
                <span class="text-center">${stockBadge(srTotal, 'orange')}</span>
            </td>
            <td class="flex md:table-cell justify-between items-center p-3 md:p-4 border-b border-gray-800/40 md:border-none mx-2 md:mx-0">
                <span class="md:hidden text-[10px] uppercase font-bold text-gray-500 tracking-widest">Cotia</span>
                <span class="text-center">${stockBadge(coTotal, 'sky')}</span>
            </td>
            <td class="flex md:table-cell justify-between items-center p-3 md:p-4 border-b border-gray-800/40 md:border-none mx-2 md:mx-0">
                <span class="md:hidden text-[10px] uppercase font-bold text-gray-500 tracking-widest">Ibiúna</span>
                <span class="text-center">${stockBadge(ibTotal, 'purple')}</span>
            </td>

            <!-- PREÇO -->
            <td class="flex md:table-cell justify-between items-center p-3 md:p-4 border-b border-gray-800/40 md:border-none mx-2 md:mx-0">
                <span class="md:hidden text-[10px] uppercase font-bold text-gray-500 tracking-widest">Preço</span>
                <span class="text-center font-black text-white text-sm">R$ ${parseFloat(p.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </td>

            <!-- AÇÕES -->
            <td class="block md:table-cell p-4 md:text-right bg-gray-900/30 md:bg-transparent">
                <button onclick="editProduct('${p._id}')" class="w-full md:w-auto p-3 md:p-2 bg-gray-800/80 md:bg-transparent flex justify-center items-center gap-2 hover:bg-accent/20 text-gray-300 hover:text-accent rounded-xl transition-colors border border-gray-700 md:border-none" title="Editar atributos">
                    ${editIcon}
                    <span class="md:hidden text-xs font-bold uppercase tracking-widest">Editar Produto</span>
                </button>
            </td>
        </tr>`;

        // Linhas filhas (Variações DESKTOP APENAS)
        if (hasVars) {
            p.variations.forEach(v => {
                const vSR = v.stock_by_store?.SaoRoque ?? 0;
                const vCO = v.stock_by_store?.Cotia    ?? 0;
                const vIB = v.stock_by_store?.Ibiuna   ?? 0;

                html += `
        <tr class="var-desktop-${p._id} hidden bg-black/20 md:border-b border-gray-800/30">
            <td class="p-2 pl-14 relative">
                <div class="absolute -left-6 top-0 bottom-0 w-px bg-gray-700"></div>
                <div class="absolute -left-6 top-1/2 w-4 h-px bg-gray-700"></div>
                
                <div class="flex items-center justify-start">
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
            <td colspan="2" class="p-2"></td>
        </tr>`;
            });
        }

        return html;
    }).join('');

    renderPaginationControls();
}

function toggleVariationRows(productId, btn) {
    const desktopRows = document.querySelectorAll(`.var-desktop-${productId}`);
    const mobileContainer = document.querySelector(`.var-mobile-${productId}`);
    
    // Verifica se já está expandido analisando a rotação do botão
    const isExpanded = btn.classList.contains('rotate-90');
    
    if (isExpanded) {
        // Ação de RECOLHER
        btn.classList.remove('rotate-90');
        desktopRows.forEach(row => {
            row.classList.remove('md:table-row'); // Tira a classe de tabela
        });
        if (mobileContainer) mobileContainer.classList.add('hidden'); // Esconde no celular
    } else {
        // Ação de EXPANDIR
        btn.classList.add('rotate-90');
        desktopRows.forEach(row => {
            row.classList.add('md:table-row'); // Adiciona a classe que força a exibição apenas no Desktop
        });
        if (mobileContainer) mobileContainer.classList.remove('hidden'); // Mostra no celular
    }
}

/* ──────────────────────────────────────────
   PAGINAÇÃO
────────────────────────────────────────── */

function renderPaginationControls() {
    const nav = document.getElementById('pagination-nav');
    if (!nav) return;

    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endItem   = Math.min(currentPage * itemsPerPage, totalItems);

    const getPages = () => {
        const pages = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
                pages.push(i);
            } else if (pages[pages.length - 1] !== '...') {
                pages.push('...');
            }
        }
        return pages;
    };

    const iconL = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
    const iconR = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

    nav.className = "flex flex-col md:flex-row items-center justify-between gap-6 mt-8 pb-10 pt-6 border-t border-gray-800";
    nav.innerHTML = `
        <div class="text-xs text-gray-500 font-medium order-2 md:order-1 text-center md:text-left">
            Exibindo <span class="text-white">${startItem}–${endItem}</span> de <span class="text-white">${totalItems}</span> resultados
        </div>
        <div class="flex flex-wrap items-center justify-center gap-2 order-1 md:order-2 w-full md:w-auto">
            <button onclick="loadInitialData(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}
                class="p-2 bg-gray-900 border border-gray-800 rounded-xl hover:bg-gray-800 disabled:opacity-10 text-accent transition-all">
                ${iconL}
            </button>
            <div class="flex flex-wrap justify-center items-center gap-1.5">
                ${getPages().map(p =>
                    p === '...'
                        ? `<span class="px-2 text-gray-600 font-bold">...</span>`
                        : `<button onclick="loadInitialData(${p})" class="w-10 h-10 rounded-xl text-xs font-bold border ${p === currentPage ? 'bg-accent text-black border-accent' : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white'}">${p}</button>`
                ).join('')}
            </div>
            <button onclick="loadInitialData(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}
                class="p-2 bg-gray-900 border border-gray-800 rounded-xl hover:bg-gray-800 disabled:opacity-10 text-accent transition-all">
                ${iconR}
            </button>
        </div>`;
}

/* ──────────────────────────────────────────
   NOTIFICAÇÃO TOAST
────────────────────────────────────────── */

function showNotification(message, type = 'success') {
    const toast   = document.getElementById('toast');
    const msg     = document.getElementById('toast-message');
    const content = document.getElementById('toast-content');
    const icon    = document.getElementById('toast-icon');
    if (!toast || !msg) return;

    content.className = type === 'success'
        ? "px-6 py-3 rounded-xl flex items-center gap-3 shadow-2xl border font-bold bg-green-500/10 border-green-500 text-green-500"
        : "px-6 py-3 rounded-xl flex items-center gap-3 shadow-2xl border font-bold bg-red-500/10 border-red-500 text-red-500";

    icon.innerText = type === 'success' ? "✅" : "⚠️";
    msg.innerText  = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3000);
}