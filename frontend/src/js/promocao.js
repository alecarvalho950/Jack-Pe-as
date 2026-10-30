let promotions = [];
let allProducts = [];
let categories = [];
let currentType = 'standard'; // 'standard' ou 'flash'
let selectedItems = new Map(); // Guarda { key: itemData }
let editingPromoId = null;

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
            fetch(`${API_BASE_URL}/api/products?limit=1000`), // Busca ampla para seleção
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
        
        // Atualiza status dinamicamente por data se estiver ativa/agendada
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
            : '<span class="px-2 py-0.5 rounded text-[9px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/30 uppercase">Padrão</span>';

        const formatDate = (d) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

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
                    <button onclick="editPromotion('${p._id || p.id}')" class="p-2 bg-gray-800 hover:bg-accent hover:text-black rounded-lg transition text-xs font-bold uppercase" title="Editar">
                        Editar
                    </button>
                    ${(calculatedStatus === 'ativa' || calculatedStatus === 'agendada') ? `
                        <button onclick="cancelPromotion('${p._id || p.id}')" class="p-2 bg-red-950/40 border border-red-800/40 hover:bg-red-900 text-red-300 rounded-lg transition text-xs font-bold uppercase" title="Encerrar">
                            Cancelar
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
        badge.innerText = type === 'flash' ? '⚡ Oferta Relâmpago (24h)' : 'Promoção Padrão';
        badge.className = type === 'flash' 
            ? 'text-[10px] font-black uppercase px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'text-[10px] font-black uppercase px-3 py-1 rounded-lg bg-accent/10 text-accent border border-accent/20';
    }

    openSelectProductsModal();
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

    if (subFilter && catName) {
        subFilter.innerHTML = '<option value="">Todas as Subcategorias</option>';
        const catObj = categories.find(c => c.name === catName);
        catObj?.subcategories?.forEach(s => {
            subFilter.innerHTML += `<option value="${s}">${s}</option>`;
        });
    }

    renderModalProductsList();
}

function renderModalProductsList() {
    const listContainer = document.getElementById('modal-products-list');
    if (!listContainer) return;

    const term = document.getElementById('modal-search-input')?.value.toLowerCase().trim() || '';
    const cat = document.getElementById('modal-filter-cat')?.value || '';
    const sub = document.getElementById('modal-filter-subcat')?.value || '';

    const filtered = allProducts.filter(p => {
        const matchesTerm = !term || p.name.toLowerCase().includes(term) || (p.sku && p.sku.toLowerCase().includes(term));
        const matchesCat = !cat || p.category === cat;
        const matchesSub = !sub || p.subcategory === sub;
        return matchesTerm && matchesCat && matchesSub;
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

                return `
                <div class="flex items-center justify-between bg-black/30 p-2.5 rounded-lg border border-gray-800 ml-6 mt-1.5">
                    <div class="flex items-center gap-3">
                        <input type="checkbox" onchange="toggleItemSelection('${key}', this.checked, ${JSON.stringify({
                            productId: p._id,
                            blingId: p.blingId,
                            variantBlingId: v.blingId,
                            name: `${p.name} (${v.type}: ${v.value})`,
                            sku: v.sku || p.sku,
                            originalPrice: v.price || p.price,
                            isVariation: true
                        }).replace(/"/g, '&quot;')})" ${isChecked ? 'checked' : ''} class="w-4 h-4 accent-accent cursor-pointer">
                        <div>
                            <span class="text-xs font-bold text-accent uppercase">${v.type}: ${v.value}</span>
                            <span class="text-[10px] text-gray-500 ml-2 font-mono">SKU: ${v.sku || '---'}</span>
                        </div>
                    </div>
                    <span class="text-xs font-bold text-white">R$ ${parseFloat(v.price || p.price || 0).toFixed(2)}</span>
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

            return `
            <div class="flex items-center justify-between bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                <div class="flex items-center gap-3">
                    <input type="checkbox" onchange="toggleItemSelection('${key}', this.checked, ${JSON.stringify({
                        productId: p._id,
                        blingId: p.blingId,
                        name: p.name,
                        sku: p.sku,
                        originalPrice: p.price,
                        isVariation: false
                    }).replace(/"/g, '&quot;')})" ${isChecked ? 'checked' : ''} class="w-4 h-4 accent-accent cursor-pointer">
                    <div>
                        <div class="text-xs font-bold text-white">${p.name}</div>
                        <div class="text-[10px] text-gray-500">${p.category || ''} • ${p.subcategory || 'Geral'} • SKU: ${p.sku || '---'}</div>
                    </div>
                </div>
                <span class="text-xs font-bold text-white">R$ ${parseFloat(p.price || 0).toFixed(2)}</span>
            </div>`;
        }
    }).join('');

    updateSelectedBadge();
}

function toggleItemSelection(key, isChecked, data) {
    if (isChecked) {
        data.promoPrice = data.originalPrice; // Preço inicial padrão
        selectedItems.set(key, data);
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
    if (selectedItems.size === 0) {
        showNotification("Selecione pelo menos um produto para continuar.", "error");
        return;
    }

    closeSelectProductsModal();
    document.getElementById('modal-pricing').classList.remove('hidden');

    // Ajusta visualização das datas conforme o tipo
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

    renderPricingList();
}

function backToProductSelection() {
    closePricingModal();
    openSelectProductsModal();
}

function closePricingModal() {
    document.getElementById('modal-pricing').classList.add('hidden');
}

function applyFlashDate24h() {
    const flashDateVal = document.getElementById('promo-flash-date-input').value;
    if (!flashDateVal) return;

    // Define 00:00 às 23:59 do dia selecionado
    document.getElementById('promo-start-input').value = `${flashDateVal}T00:00`;
    document.getElementById('promo-end-input').value = `${flashDateVal}T23:59`;
}

function renderPricingList() {
    const container = document.getElementById('selected-pricing-list');
    if (!container) return;

    container.innerHTML = Array.from(selectedItems.entries()).map(([key, item]) => {
        const orig = parseFloat(item.originalPrice || 0);
        const promo = parseFloat(item.promoPrice || orig);
        const discountPct = orig > 0 ? Math.round(((orig - promo) / orig) * 100) : 0;

        return `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between bg-gray-900/60 p-3 rounded-xl border border-gray-800 gap-3">
            <div class="flex-1">
                <div class="text-xs font-bold text-white">${item.name}</div>
                <div class="text-[10px] text-gray-500 font-mono">SKU: ${item.sku || '---'} • De: R$ ${orig.toFixed(2)}</div>
            </div>

            <div class="flex items-center gap-3">
                <div>
                    <label class="text-[9px] text-gray-400 uppercase font-bold block">Preço Promo (R$)</label>
                    <input type="number" step="0.01" value="${promo.toFixed(2)}" oninput="updateItemPromoPrice('${key}', this.value)" class="w-28 p-1.5 rounded bg-gray-800 border border-gray-700 text-xs font-bold text-accent outline-none focus:border-accent">
                </div>

                <div class="text-center min-w-[60px]">
                    <span class="text-[9px] text-gray-500 uppercase font-bold block">Desconto</span>
                    <span id="discount-tag-${key}" class="text-xs font-black text-emerald-400">${discountPct}% OFF</span>
                </div>

                <button onclick="removeItemFromPricing('${key}')" class="text-red-400 hover:text-red-300 p-1" title="Remover">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>`;
    }).join('');
}

function updateItemPromoPrice(key, value) {
    const item = selectedItems.get(key);
    if (!item) return;

    const orig = parseFloat(item.originalPrice || 0);
    const promo = parseFloat(value || 0);
    item.promoPrice = promo;

    const discountTag = document.getElementById(`discount-tag-${key}`);
    if (discountTag && orig > 0) {
        const pct = Math.max(0, Math.round(((orig - promo) / orig) * 100));
        discountTag.innerText = `${pct}% OFF`;
    }
}

function removeItemFromPricing(key) {
    selectedItems.delete(key);
    renderPricingList();
    if (selectedItems.size === 0) {
        backToProductSelection();
    }
}

/* ──────────────────────────────────────────
   SALVAMENTO / EDIÇÃO / CANCELAMENTO
────────────────────────────────────────── */

async function savePromotion() {
    const title = document.getElementById('promo-title-input').value.trim();
    let startDateVal = document.getElementById('promo-start-input').value;
    let endDateVal = document.getElementById('promo-end-input').value;

    if (currentType === 'flash') {
        const flashDate = document.getElementById('promo-flash-date-input').value;
        if (flashDate) {
            startDateVal = `${flashDate}T00:00`;
            endDateVal = `${flashDate}T23:59`;
        }
    }

    if (!title) {
        showNotification("Digite um título para a promoção.", "error");
        return;
    }
    if (!startDateVal || !endDateVal) {
        showNotification("Preencha a data de início e fim da promoção.", "error");
        return;
    }
    if (selectedItems.size === 0) {
        showNotification("Adicione pelo menos um produto na promoção.", "error");
        return;
    }

    const payload = {
        title,
        type: currentType,
        startDate: new Date(startDateVal).toISOString(),
        endDate: new Date(endDateVal).toISOString(),
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
            showNotification(editingPromoId ? "Promoção atualizada!" : "Promoção agendada com sucesso!");
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

function editPromotion(id) {
    const promo = promotions.find(p => (p._id || p.id) === id);
    if (!promo) return;

    editingPromoId = id;
    currentType = promo.type || 'standard';
    selectedItems.clear();

    (promo.items || []).forEach((item, idx) => {
        const key = `${item.productId}_${item.isVariation ? 'var_' + item.variantBlingId : 'simple'}`;
        selectedItems.set(key, item);
    });

    document.getElementById('promo-title-input').value = promo.title;

    const startLocal = new Date(promo.startDate).toISOString().slice(0, 16);
    const endLocal = new Date(promo.endDate).toISOString().slice(0, 16);

    document.getElementById('promo-start-input').value = startLocal;
    document.getElementById('promo-end-input').value = endLocal;

    if (promo.type === 'flash') {
        document.getElementById('promo-flash-date-input').value = promo.startDate.slice(0, 10);
    }

    goToPricingStep();
}

async function cancelPromotion(id) {
    if (!confirm("Deseja realmente cancelar/encerrar esta promoção?")) return;

    try {
        const token = localStorage.getItem('admin_token');
        const res = await fetch(`${API_BASE_URL}/api/promotions/${id}/cancel`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            showNotification("Promoção encerrada!");
            loadInitialData();
        } else {
            showNotification("Erro ao cancelar promoção.", "error");
        }
    } catch {
        showNotification("Erro de conexão.", "error");
    }
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