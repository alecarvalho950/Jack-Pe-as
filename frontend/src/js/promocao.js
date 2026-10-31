let promotions = [];
let allProducts = [];
let categories = [];
let currentType = 'standard'; // 'standard' ou 'flash'
let selectedItems = new Map(); // Guarda { key: itemData }
let editingPromoId = null;
let isViewMode = false; // Indica se estamos apenas visualizando detalhes (promoção finalizada)

const API_BASE_URL = "https://api.jackpecas.com.br";

document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
});

/* ──────────────────────────────────────────
   CARREGAMENTO DE DADOS
────────────────────────────────────────── */

async function loadInitialData() {
    try {
        const token = localStorage.getItem('admin_token');
        const [resPromos, resProds, resCats] = await Promise.all([
            fetch(`${API_BASE_URL}/api/promotions`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE_URL}/api/products?limit=9999`),
            fetch(`${API_BASE_URL}/api/categories`)
        ]);

        if (resPromos.ok) promotions = await resPromos.json();
        const prodData = await resProds.json();
        allProducts = prodData.products || prodData || [];
        categories = await resCats.json();

        populateCategoryFilters();
        renderPromotionsList();
    } catch (err) {
        console.error("Erro ao carregar dados de promoções:", err);
        showNotification("Erro ao conectar com o servidor.", "error");
    }
}

function populateCategoryFilters() {
    const catSelect = document.getElementById('modal-filter-cat');
    if (!catSelect) return;
    catSelect.innerHTML = '<option value="">Todas as Categorias</option>';
    categories.forEach(c => {
        catSelect.innerHTML += `<option value="${c.name}">${c.name}</option>`;
    });
}

/* ──────────────────────────────────────────
   RENDERIZAÇÃO DA TABELA DE PROMOÇÕES
────────────────────────────────────────── */

function renderPromotionsList() {
    const tbody = document.getElementById('promo-list-body');
    if (!tbody) return;

    if (!promotions || promotions.length === 0) {
        tbody.innerHTML = `
            <tr class="block md:table-row">
                <td colspan="6" class="p-10 text-center text-gray-500 italic block md:table-cell">
                    Nenhuma promoção cadastrada no momento. Clique em "Adicionar Promoção" para iniciar.
                </td>
            </tr>`;
        return;
    }

    const now = new Date();

    tbody.innerHTML = promotions.map(p => {
        const startDate = new Date(p.startDate);
        const endDate = new Date(p.endDate);

        let calculatedStatus = p.status || 'agendada';
        
        if (p.status !== 'cancelada' && p.status !== 'finalizada') {
            if (now < startDate) {
                calculatedStatus = 'agendada';
            } else if (now >= startDate && now <= endDate) {
                calculatedStatus = 'ativa';
            } else if (now > endDate) {
                calculatedStatus = 'finalizada';
            }
        }

        const statusBadges = {
            'agendada': '<span class="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">Agendada</span>',
            'ativa': '<span class="px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase animate-pulse">Ativa</span>',
            'finalizada': '<span class="px-2.5 py-1 rounded-md text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20 uppercase">Finalizada</span>',
            'cancelada': '<span class="px-2.5 py-1 rounded-md text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase">Cancelada</span>'
        };

        const typeBadge = p.type === 'flash'
            ? '<span class="px-2 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">⚡ Relâmpago (24h)</span>'
            : '<span class="px-2 py-0.5 rounded text-[9px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/30 uppercase">Promoção</span>';

        const formatDate = (d) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

        const canEdit = calculatedStatus !== 'cancelada' && calculatedStatus !== 'finalizada';

        return `
        <tr class="block md:table-row bg-[#111827] md:bg-transparent rounded-2xl border border-gray-800 md:border-b md:border-gray-800/60 mb-4 md:mb-0 hover:bg-white/[0.02] transition">
            <td class="block md:table-cell p-4 font-bold text-white">
                <div>${p.title}</div>
                <div class="text-[10px] text-gray-500 font-mono mt-0.5">ID: ${p._id || p.id}</div>
            </td>
            <td class="block md:table-cell p-4 text-center">${typeBadge}</td>
            <td class="block md:table-cell p-4 text-center">${statusBadges[calculatedStatus] || calculatedStatus}</td>
            <td class="block md:table-cell p-4 text-center font-bold text-accent">${p.items?.length || 0}</td>
            <td class="block md:table-cell p-4 text-center text-xs text-gray-400">
                <div>${formatDate(p.startDate)}</div>
                <div class="text-[10px] text-gray-600">até ${formatDate(p.endDate)}</div>
            </td>
            <td class="block md:table-cell p-4 text-right">
                <div class="flex items-center justify-end gap-2">
                    ${canEdit ? `
                        <button onclick="editPromotion('${p._id || p.id}', false)" class="p-2 bg-gray-800 hover:bg-accent hover:text-black rounded-lg transition text-xs font-bold uppercase" title="Editar">
                            Editar
                        </button>
                    ` : `
                        <button onclick="editPromotion('${p._id || p.id}', true)" class="p-2 bg-gray-800/50 text-gray-400 hover:text-white rounded-lg transition text-xs font-bold uppercase" title="Ver Detalhes">
                            Detalhes
                        </button>
                    `}
                    ${(calculatedStatus === 'ativa' || calculatedStatus === 'agendada') ? `
                        <button onclick="cancelPromotion('${p._id || p.id}')" class="p-2 bg-red-950/40 border border-red-800/40 hover:bg-red-900 text-red-300 rounded-lg transition text-xs font-bold uppercase" title="Finalizar">
                            Finalizar
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

/* ──────────────────────────────────────────
   FLUXO DOS MODAIS
────────────────────────────────────────── */

function openTypeModal() {
    editingPromoId = null;
    isViewMode = false;
    selectedItems.clear();
    document.getElementById('modal-type').classList.remove('hidden');
}

function closeTypeModal() {
    document.getElementById('modal-type').classList.add('hidden');
}

function selectPromoType(type) {
    currentType = type;
    closeTypeModal();

    const badge = document.getElementById('badge-promo-type-label');
    if (badge) {
        badge.innerText = type === 'flash' ? '⚡ Oferta Relâmpago (24h)' : 'Promoção';
        badge.className = type === 'flash' 
            ? 'text-[10px] font-black uppercase px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'text-[10px] font-black uppercase px-3 py-1 rounded-lg bg-accent/10 text-accent border border-accent/20';
    }

    const titleInput = document.getElementById('promo-title-input');
    if (titleInput) titleInput.value = '';

    const startInput = document.getElementById('promo-start-input');
    const endInput = document.getElementById('promo-end-input');
    const flashInput = document.getElementById('promo-flash-date-input');
    if (startInput) { startInput.value = ''; startInput.disabled = false; startInput.classList.remove('opacity-50', 'cursor-not-allowed'); }
    if (endInput) { endInput.value = ''; endInput.disabled = false; endInput.classList.remove('opacity-50', 'cursor-not-allowed'); }
    if (flashInput) { flashInput.value = ''; flashInput.disabled = false; flashInput.classList.remove('opacity-50', 'cursor-not-allowed'); }

    goToPricingStep();
}

function openSelectProductsModal() {
    document.getElementById('modal-select-products').classList.remove('hidden');
    renderModalProductsList();
}

function closeSelectProductsModal() {
    document.getElementById('modal-select-products').classList.add('hidden');
}

/* ──────────────────────────────────────────
   SELEÇÃO DE PRODUTOS E VARIAÇÕES
────────────────────────────────────────── */

function filterModalProducts() {
    const catName = document.getElementById('modal-filter-cat')?.value;
    const subFilter = document.getElementById('modal-filter-subcat');

    if (subFilter) {
        const currentSubVal = subFilter.value;
        subFilter.innerHTML = '<option value="">Todas as Subcategorias</option>';
        if (catName) {
            const catObj = categories.find(c => c.name === catName);
            catObj?.subcategories?.forEach(s => {
                const selectedAttr = s === currentSubVal ? 'selected' : '';
                subFilter.innerHTML += `<option value="${s}" ${selectedAttr}>${s}</option>`;
            });
        }
    }

    renderModalProductsList();
}

function renderModalProductsList() {
    const listContainer = document.getElementById('modal-products-list');
    if (!listContainer) return;

    const searchInput = document.getElementById('modal-search-input');
    const searchRaw = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const cat = document.getElementById('modal-filter-cat')?.value || '';
    const sub = document.getElementById('modal-filter-subcat')?.value || '';

    const filtered = allProducts.filter(p => {
        let matchesSearch = true;
        if (searchRaw) {
            const keywords = searchRaw.split(/\s+/);
            matchesSearch = keywords.every(word => {
                const s = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const nameMatch = new RegExp(`(^|\\s|[\\/\\-])(${s})($|\\s|[\\/\\-])`, 'i').test(p.name);
                const skuMatch = p.sku && p.sku.toLowerCase().includes(word);
                return nameMatch || skuMatch;
            });
        }
        const matchesCat = !cat || p.category === cat;
        const matchesSub = !sub || p.subcategory === sub;
        return matchesSearch && matchesCat && matchesSub;
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="p-6 text-center text-gray-500 text-xs">Nenhum produto localizado com estes filtros.</div>`;
        return;
    }

    listContainer.innerHTML = filtered.map(p => {
        const hasVars = p.hasVariations && p.variations?.length > 0;

        if (hasVars) {
            const varRows = p.variations.map((v, idx) => {
                const key = `${p._id}_var_${v.blingId || v.sku || idx}`;
                const isChecked = selectedItems.has(key);
                const isLockedOriginal = editingPromoId && isChecked; 

                const sr = v.stock_by_store?.SaoRoque ?? 0;
                const co = v.stock_by_store?.Cotia ?? 0;
                const ib = v.stock_by_store?.Ibiuna ?? 0;

                return `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between bg-black/30 p-2.5 rounded-lg border border-gray-800 ml-6 mt-1.5 gap-2">
                    <div class="flex items-center gap-3">
                        <input type="checkbox" onchange="toggleItemSelection('${key}', this.checked, ${JSON.stringify({
                            productId: p._id,
                            blingId: p.blingId,
                            variantBlingId: v.blingId,
                            name: `${p.name} (${v.type}: ${v.value})`,
                            sku: v.sku || p.sku,
                            originalPrice: v.price || p.price,
                            isVariation: true
                        }).replace(/"/g, '&quot;')})" ${isChecked ? 'checked' : ''} ${isLockedOriginal ? 'disabled title="Produto já pertencente à promoção."' : ''} class="w-4 h-4 accent-accent cursor-pointer ${isLockedOriginal ? 'opacity-60 cursor-not-allowed' : ''}">
                        <div>
                            <span class="text-xs font-bold text-accent uppercase">${v.type}: ${v.value}</span>
                            <span class="text-[10px] text-gray-500 ml-2 font-mono">SKU: ${v.sku || '---'}</span>
                            ${isLockedOriginal ? '<span class="ml-2 text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">Selecionado</span>' : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="flex items-center gap-2 text-[10px] bg-gray-900 px-2 py-1 rounded border border-gray-800">
                            <span class="text-orange-400 font-bold">SR: ${sr}</span>
                            <span class="text-sky-400 font-bold">CO: ${co}</span>
                            <span class="text-purple-400 font-bold">IB: ${ib}</span>
                        </div>
                        <span class="text-xs font-bold text-white">R$ ${parseFloat(v.price || p.price || 0).toFixed(2)}</span>
                    </div>
                </div>`;
            }).join('');

            return `
            <div class="bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                <div class="flex items-center justify-between">
                    <div>
                        <span class="text-xs font-bold text-white">${p.name}</span>
                        <span class="text-[9px] bg-sky-950 text-sky-400 border border-sky-900/50 px-1.5 py-0.5 rounded ml-2 uppercase font-black">Com Variações</span>
                        <div class="text-[10px] text-gray-500">${p.category || ''} • ${p.subcategory || 'Geral'}</div>
                    </div>
                </div>
                <div class="mt-2 space-y-1">${varRows}</div>
            </div>`;
        } else {
            const key = `${p._id}_simple`;
            const isChecked = selectedItems.has(key);
            const isLockedOriginal = editingPromoId && isChecked;

            const sr = p.stock_by_store?.SaoRoque ?? 0;
            const co = p.stock_by_store?.Cotia ?? 0;
            const ib = p.stock_by_store?.Ibiuna ?? 0;

            return `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between bg-gray-900/60 p-3 rounded-xl border border-gray-800 gap-2">
                <div class="flex items-center gap-3">
                    <input type="checkbox" onchange="toggleItemSelection('${key}', this.checked, ${JSON.stringify({
                        productId: p._id,
                        blingId: p.blingId,
                        name: p.name,
                        sku: p.sku,
                        originalPrice: p.price,
                        isVariation: false
                    }).replace(/"/g, '&quot;')})" ${isChecked ? 'checked' : ''} ${isLockedOriginal ? 'disabled title="Produto já pertencente à promoção."' : ''} class="w-4 h-4 accent-accent cursor-pointer ${isLockedOriginal ? 'opacity-60 cursor-not-allowed' : ''}">
                    <div>
                        <div class="text-xs font-bold text-white">${p.name}</div>
                        <div class="text-[10px] text-gray-500">${p.category || ''} • ${p.subcategory || 'Geral'} • SKU: ${p.sku || '---'}</div>
                        ${isLockedOriginal ? '<span class="inline-block mt-0.5 text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">Selecionado</span>' : ''}
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="flex items-center gap-2 text-[10px] bg-gray-900 px-2 py-1 rounded border border-gray-800">
                        <span class="text-orange-400 font-bold">SR: ${sr}</span>
                        <span class="text-sky-400 font-bold">CO: ${co}</span>
                        <span class="text-purple-400 font-bold">IB: ${ib}</span>
                    </div>
                    <span class="text-xs font-bold text-white">R$ ${parseFloat(p.price || 0).toFixed(2)}</span>
                </div>
            </div>`;
        }
    }).join('');

    updateSelectedBadge();
}

function toggleItemSelection(key, isChecked, data) {
    if (isChecked) {
        if (!selectedItems.has(key)) {
            data.promoPrice = data.originalPrice; 
            selectedItems.set(key, data);
        }
    } else {
        selectedItems.delete(key);
    }
    updateSelectedBadge();
}

function updateSelectedBadge() {
    const badge = document.getElementById('selected-counter-badge');
    if (badge) badge.innerText = `${selectedItems.size} item(ns) selecionado(s)`;
}

/* ──────────────────────────────────────────
   ETAPA DE PRECIFICAÇÃO E VIGÊNCIA
────────────────────────────────────────── */

function goToPricingStep() {
    if (selectedItems.size === 0 && !editingPromoId) {
        openSelectProductsModal();
        return;
    }

    closeSelectProductsModal();
    document.getElementById('modal-pricing').classList.remove('hidden');

    const startDateContainer = document.getElementById('start-date-container');
    const endDateContainer = document.getElementById('end-date-container');
    const flashDateContainer = document.getElementById('flash-date-container');

    if (currentType === 'flash') {
        startDateContainer.classList.add('hidden');
        endDateContainer.classList.add('hidden');
        flashDateContainer.classList.remove('hidden');
    } else {
        startDateContainer.classList.remove('hidden');
        endDateContainer.classList.remove('hidden');
        flashDateContainer.classList.add('hidden');
    }

    applyViewModeState();
    renderPricingList();
}

function applyViewModeState() {
    const titleInput = document.getElementById('promo-title-input');
    const startInput = document.getElementById('promo-start-input');
    const endInput = document.getElementById('promo-end-input');
    const flashInput = document.getElementById('promo-flash-date-input');
    const btnSave = document.getElementById('btn-save-promo');
    const btnAddProducts = document.getElementById('btn-add-more-products');

    if (isViewMode) {
        if (titleInput) titleInput.disabled = true;
        if (startInput) startInput.disabled = true;
        if (endInput) endInput.disabled = true;
        if (flashInput) flashInput.disabled = true;
        if (btnSave) btnSave.classList.add('hidden');
        if (btnAddProducts) btnAddProducts.classList.add('hidden');
    } else {
        if (titleInput) titleInput.disabled = false;
        if (btnSave) btnSave.classList.remove('hidden');
        if (btnAddProducts) btnAddProducts.classList.remove('hidden');
    }
}

function closePricingModal() {
    document.getElementById('modal-pricing').classList.add('hidden');
}

function applyFlashDate24h() {
    const flashDateVal = document.getElementById('promo-flash-date-input').value;
    if (!flashDateVal) return;

    document.getElementById('promo-start-input').value = `${flashDateVal}T00:00`;
    document.getElementById('promo-end-input').value = `${flashDateVal}T23:59`;
}

function renderPricingList() {
    const container = document.getElementById('selected-pricing-list');
    if (!container) return;

    container.innerHTML = Array.from(selectedItems.entries()).map(([key, item]) => {
        const orig = parseFloat(item.originalPrice || 0);
        const promo = parseFloat(item.promoPrice || orig);
        const discountPct = orig > 0 ? Math.max(0, Math.round(((orig - promo) / orig) * 100)) : 0;

        return `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between bg-gray-900/60 p-3 rounded-xl border border-gray-800 gap-3">
            <div class="flex-1">
                <div class="text-xs font-bold text-white">${item.name}</div>
                <div class="text-[10px] text-gray-400 font-mono flex items-center gap-2 mt-0.5">
                    <span>SKU: ${item.sku || '---'}</span>
                    <span class="text-gray-500">•</span>
                    <span class="text-amber-400 font-bold">De: R$ ${orig.toFixed(2)}</span>
                </div>
            </div>

            <div class="flex items-center gap-3">
                <div>
                    <label class="text-[9px] text-gray-400 uppercase font-bold block">Preço Promo (R$)</label>
                    <input type="number" step="0.01" id="price-input-${key}" value="${promo.toFixed(2)}" oninput="updateItemByPrice('${key}', this.value)" ${isViewMode ? 'disabled' : ''} class="w-28 p-1.5 rounded bg-gray-800 border border-gray-700 text-xs font-bold text-accent outline-none focus:border-accent ${isViewMode ? 'opacity-60 cursor-not-allowed' : ''}">
                </div>

                <div>
                    <label class="text-[9px] text-gray-400 uppercase font-bold block">Desconto (%)</label>
                    <input type="number" min="0" max="100" id="discount-input-${key}" value="${discountPct}" oninput="updateItemByDiscount('${key}', this.value)" ${isViewMode ? 'disabled' : ''} class="w-20 p-1.5 rounded bg-gray-800 border border-gray-700 text-xs font-bold text-emerald-400 outline-none focus:border-accent text-center ${isViewMode ? 'opacity-60 cursor-not-allowed' : ''}">
                </div>

                ${!isViewMode ? `
                    <button onclick="removeItemFromPricing('${key}')" class="text-red-400 hover:text-red-300 p-2 bg-red-950/40 rounded-lg border border-red-900/40 transition" title="Remover item">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                ` : ''}
            </div>
        </div>`;
    }).join('');
}

function updateItemByPrice(key, value) {
    const item = selectedItems.get(key);
    if (!item) return;

    const orig = parseFloat(item.originalPrice || 0);
    const promo = parseFloat(value || 0);
    item.promoPrice = promo;

    const discountInput = document.getElementById(`discount-input-${key}`);
    if (discountInput && orig > 0) {
        const pct = Math.max(0, Math.min(100, Math.round(((orig - promo) / orig) * 100)));
        discountInput.value = pct;
    }
}

function updateItemByDiscount(key, value) {
    const item = selectedItems.get(key);
    if (!item) return;

    const orig = parseFloat(item.originalPrice || 0);
    const pct = parseFloat(value || 0);
    
    const promo = orig * (1 - (pct / 100));
    item.promoPrice = Math.max(0, promo);

    const priceInput = document.getElementById(`price-input-${key}`);
    if (priceInput) {
        priceInput.value = item.promoPrice.toFixed(2);
    }
}

function removeItemFromPricing(key) {
    selectedItems.delete(key);
    renderPricingList();
}

/* ──────────────────────────────────────────
   SALVAMENTO / EDIÇÃO / CANCELAMENTO
────────────────────────────────────────── */

function editPromotion(id, viewOnly = false) {
    const promo = promotions.find(p => (p._id || p.id) === id);
    if (!promo) return;

    editingPromoId = id;
    isViewMode = viewOnly;
    currentType = promo.type || 'standard';
    selectedItems.clear();

    (promo.items || []).forEach((item) => {
        const key = `${item.productId}_${item.isVariation ? 'var_' + item.variantBlingId : 'simple'}`;
        selectedItems.set(key, item);
    });

    document.getElementById('promo-title-input').value = promo.title;

    const startDateObj = new Date(promo.startDate);
    const endDateObj = new Date(promo.endDate);

    const formatToInput = (dateObj) => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const startInput = document.getElementById('promo-start-input');
    const endInput = document.getElementById('promo-end-input');
    const flashInput = document.getElementById('promo-flash-date-input');

    startInput.value = formatToInput(startDateObj);
    endInput.value = formatToInput(endDateObj);

    startInput.disabled = true;
    startInput.classList.add('opacity-50', 'cursor-not-allowed');
    endInput.disabled = true;
    endInput.classList.add('opacity-50', 'cursor-not-allowed');

    if (promo.type === 'flash') {
        const year = startDateObj.getFullYear();
        const month = String(startDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(startDateObj.getDate()).padStart(2, '0');
        flashInput.value = `${year}-${month}-${day}`;
        flashInput.disabled = true;
        flashInput.classList.add('opacity-50', 'cursor-not-allowed');
    }

    goToPricingStep();
}

async function savePromotion() {
    if (isViewMode) return;

    const title = document.getElementById('promo-title-input').value.trim();
    let startDateVal = document.getElementById('promo-start-input').value;
    let endDateVal = document.getElementById('promo-end-input').value;

    if (editingPromoId) {
        const promoOriginal = promotions.find(p => (p._id || p.id) === editingPromoId);
        if (promoOriginal) {
            startDateVal = promoOriginal.startDate;
            endDateVal = promoOriginal.endDate;
        }
    } else if (currentType === 'flash') {
        const flashDate = document.getElementById('promo-flash-date-input').value;
        if (flashDate) {
            startDateVal = `${flashDate}T00:00`;
            endDateVal = `${flashDate}T23:59`;
        }
    }

    if (!title) {
        showNotification("O campo Título da Promoção é obrigatório.", "error");
        return;
    }
    if (!startDateVal || !endDateVal) {
        showNotification("Preencha a data e horário de início e fim da promoção.", "error");
        return;
    }
    if (selectedItems.size === 0) {
        showNotification("Selecione ao menos um produto antes de avançar.", "error");
        return;
    }

    let precosValidos = true;
    selectedItems.forEach((item) => {
        if (item.promoPrice === undefined || item.promoPrice === null || isNaN(item.promoPrice) || item.promoPrice < 0) {
            precosValidos = false;
        }
    });

    if (!precosValidos) {
        showNotification("Preencha corretamente os preços promocionais de todos os itens selecionados.", "error");
        return;
    }

    const finalStartIso = editingPromoId ? startDateVal : new Date(startDateVal).toISOString();
    const finalEndIso = editingPromoId ? endDateVal : new Date(endDateVal).toISOString();

    const payload = {
        title,
        type: currentType,
        startDate: finalStartIso,
        endDate: finalEndIso,
        items: Array.from(selectedItems.values())
    };

    const btnSave = document.getElementById('btn-save-promo');
    const origText = btnSave.innerHTML;

    try {
        btnSave.disabled = true;
        btnSave.innerHTML = `<span class="inline-block animate-spin border-2 border-primary border-t-transparent rounded-full w-4 h-4 mr-2"></span> Salvando...`;

        const token = localStorage.getItem('admin_token');
        const url = editingPromoId 
            ? `${API_BASE_URL}/api/promotions/${editingPromoId}`
            : `${API_BASE_URL}/api/promotions`;

        const res = await fetch(url, {
            method: editingPromoId ? 'PUT' : 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showNotification(editingPromoId ? "Promoção atualizada com sucesso!" : "Promoção agendada com sucesso!");
            closePricingModal();
            loadInitialData();
        } else {
            const err = await res.json();
            showNotification(err.message || "Erro ao salvar promoção.", "error");
        }
    } catch (err) {
        showNotification("Erro de conexão com o servidor.", "error");
    } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = origText;
    }
}

async function cancelPromotion(id) {
    const confirmModalHtml = `
        <div id="cancel-confirm-modal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div class="bg-[#111827] border border-red-500/30 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                <h3 class="text-base font-black text-white uppercase tracking-wider mb-2">Finalizar Promoção</h3>
                <p class="text-slate-300 text-xs mb-6">Deseja realmente finalizar/encerrar esta promoção?</p>
                <div class="flex gap-3 justify-end">
                    <button id="btn-no-cancel" class="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-xs font-bold uppercase">Não</button>
                    <button id="btn-yes-cancel" class="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold uppercase">Sim, Finalizar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', confirmModalHtml);

    document.getElementById('btn-no-cancel').addEventListener('click', () => {
        document.getElementById('cancel-confirm-modal').remove();
    });

    document.getElementById('btn-yes-cancel').addEventListener('click', async () => {
        document.getElementById('cancel-confirm-modal')?.remove();
        try {
            const token = localStorage.getItem('admin_token');
            const res = await fetch(`${API_BASE_URL}/api/promotions/${id}/cancel`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                showNotification("Promoção finalizada com sucesso!");
                loadInitialData();
            } else {
                showNotification("Erro ao finalizar promoção.", "error");
            }
        } catch {
            showNotification("Erro de conexão.", "error");
        }
    });
}

/* ──────────────────────────────────────────
   NOTIFICAÇÃO TOAST
────────────────────────────────────────── */

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