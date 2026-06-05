let allProducts = [];
let categories = [];
let searchTimer;
let currentView = "HOME";
let activeCat = null;
let activeSub = null;
let activeFilters = {};
let currentPage = 1;
const ITEMS_PER_PAGE = 20;

// Estado Global do Carrinho e Loja Ativa
let cart = [];
let activeStore = null;

// Números do WhatsApp por filial
const STORE_CONTACTS = {
    "São Roque": "5511941743113",
    "Cotia":     "5511943924756",
    "Ibiúna":    "5511943908395"
};

// Mapeamento das chaves do schema Mongoose
const STORE_SCHEMA_KEYS = {
    "São Roque": "SaoRoque",
    "Cotia":     "Cotia",
    "Ibiúna":    "Ibiuna"
};

const TAG_PALETTE = [
    { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    { bg: 'bg-sky-500/10',     text: 'text-sky-400',     border: 'border-sky-500/20' },
    { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
    { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/20' },
    { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/20' },
    { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/20' },
    { bg: 'bg-purple-500/10',  text: 'text-purple-400',  border: 'border-purple-500/20' },
    { bg: 'bg-cyan-500/10',    text: 'text-cyan-400',    border: 'border-cyan-500/20' },
    { bg: 'bg-lime-500/10',    text: 'text-lime-400',    border: 'border-lime-500/20' },
    { bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-400', border: 'border-fuchsia-500/20' },
    { bg: 'bg-pink-500/10',    text: 'text-pink-400',    border: 'border-pink-500/20' },
    { bg: 'bg-violet-500/10',  text: 'text-violet-400',  border: 'border-violet-500/20' },
    { bg: 'bg-teal-500/10',    text: 'text-teal-400',    border: 'border-teal-500/20' },
    { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20' },
    { bg: 'bg-blue-600/10',    text: 'text-blue-400',    border: 'border-blue-600/20' },
    { bg: 'bg-yellow-500/10',  text: 'text-yellow-300',  border: 'border-yellow-500/20' },
    { bg: 'bg-slate-400/10',   text: 'text-slate-300',   border: 'border-slate-400/20' },
    { bg: 'bg-green-600/10',   text: 'text-green-400',   border: 'border-green-600/20' },
    { bg: 'bg-zinc-400/10',    text: 'text-zinc-300',    border: 'border-zinc-400/20' },
    { bg: 'bg-blue-400/10',    text: 'text-blue-300',    border: 'border-blue-400/20' }
];

/* ──────────────────────────────────────────
   HELPERS DE ESTOQUE
────────────────────────────────────────── */

function getProductStock(p) {
    const storeKey = STORE_SCHEMA_KEYS[activeStore] || "SaoRoque";
    if (p.stock_by_store && p.stock_by_store[storeKey] !== undefined) {
        return p.stock_by_store[storeKey];
    }
    return p.stock !== undefined ? p.stock : (p.estoque || 0);
}

function getVariationStock(v) {
    const storeKey = STORE_SCHEMA_KEYS[activeStore] || "SaoRoque";
    if (v.stock_by_store && v.stock_by_store[storeKey] !== undefined) {
        return v.stock_by_store[storeKey];
    }
    return v.stock !== undefined ? v.stock : (v.estoque || 0);
}

/* ──────────────────────────────────────────
   HELPER: verifica se um produto/variação
   já está no carrinho (para o botão "Adicionado")
────────────────────────────────────────── */
function isInCart(id) {
    return cart.some(item => item.id === id);
}

/* ──────────────────────────────────────────
   INIT
────────────────────────────────────────── */

async function init() {
    const API_BASE_URL = "https://jack-pecas-backend.onrender.com";
    const overlay = document.getElementById('loading-overlay');

    showLocalLoading();

    try {
        const searchInput = document.getElementById("public-search");
        if (searchInput) searchInput.addEventListener("input", handleSearch);

        const fetchOptions = { method: 'GET', headers: { 'Content-Type': 'application/json' } };

        const [resCat, resProd] = await Promise.all([
            fetch(`${API_BASE_URL}/api/categories`, fetchOptions),
            fetch(`${API_BASE_URL}/api/products?limit=9999`, fetchOptions),
        ]);

        if (!resCat.ok || !resProd.ok) throw new Error("Erro na resposta do servidor");

        categories = await resCat.json();
        const prodData = await resProd.json();
        allProducts = prodData.products || [];

        const savedStore = localStorage.getItem("jack_pecas_preferred_store");
        if (savedStore && STORE_CONTACTS[savedStore]) {
            activeStore = savedStore;
            updateStoreLabel(activeStore);
            renderQuickNav();
            render();
        } else {
            openStoreSelector();
        }

        updateCartUI();

        if (overlay) {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.remove(), 500);
        }

    } catch (err) {
        console.error("Erro ao carregar dados:", err);
        const container = document.getElementById("catalog-content");
        if (container) container.innerHTML = `<p class="text-red-500 text-center py-10 uppercase font-black text-xs">Erro ao conectar com o servidor.</p>`;
        if (overlay) overlay.remove();
    }
}

/* ──────────────────────────────────────────
   GERENCIAMENTO DE LOJA
────────────────────────────────────────── */

function updateStoreLabel(storeName) {
    // Atualiza o botão no topo da página
    const el = document.getElementById("top-store-name");
    if (el) el.innerText = storeName;

    // Atualiza o label dentro do carrinho
    const cartLabel = document.getElementById("cart-store-label");
    if (cartLabel) cartLabel.innerText = `Loja ${storeName}`;
}

function openStoreSelector() {
    const backdrop = document.getElementById("store-selector-backdrop");
    const card     = document.getElementById("store-modal-card");
    if (!backdrop) return;
    backdrop.classList.remove("hidden");
    setTimeout(() => {
        backdrop.classList.remove("opacity-0");
        if (card) card.classList.remove("scale-95");
    }, 10);
}

function closeStoreSelector() {
    const backdrop = document.getElementById("store-selector-backdrop");
    const card     = document.getElementById("store-modal-card");
    if (!backdrop) return;
    backdrop.classList.add("opacity-0");
    if (card) card.classList.add("scale-95");
    setTimeout(() => backdrop.classList.add("hidden"), 300);
}

// Função para enviar os dados de escolha de loja para o Backend
async function sendAnalyticsEvent(type, location) {
    try {
        const API_BASE_URL = "https://jack-pecas-backend.onrender.com";
        await fetch(`${API_BASE_URL}/api/analytics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: type,
                location: location,
                isNewUser: false // Opcional, dependendo da sua regra de novos usuários
            })
        });
    } catch (err) {
        console.error("Erro ao registrar analytics:", err);
    }
}

function selectStore(storeName) {
    // Se mudar de loja com itens no carrinho, confirma limpeza
    if (cart.length > 0 && activeStore && activeStore !== storeName) {
        const ok = confirm(`Ao mudar para ${storeName}, o carrinho atual (${activeStore}) será esvaziado. Deseja continuar?`);
        if (!ok) return;
        cart = [];
    }

    activeStore = storeName;
    localStorage.setItem("jack_pecas_preferred_store", storeName);
    updateStoreLabel(storeName);
    closeStoreSelector();
    renderQuickNav();
    render();
    updateCartUI();

    // ── DISPARO DO ANALYTICS ADAPTADO PARA O SEU FORMATO ──
    // Mapeia o nome bonito da tela para o formato do banco de dados (minúsculo e com underline)
    let locationKey = "sao_roque"; 
    if (storeName === "Cotia") locationKey = "cotia";
    if (storeName === "Ibiúna") locationKey = "ibiuna";

    // Envia o evento para o servidor computar no Dashboard
    sendAnalyticsEvent('select_store', locationKey);
}

/* ──────────────────────────────────────────
   NAVEGAÇÃO E FILTROS
────────────────────────────────────────── */

function resetAll() {
    document.getElementById("public-search").value = "";
    activeFilters = {};
    changeView("HOME");
}

function renderQuickNav() {
    const nav = document.getElementById("quick-nav");
    if (!nav || !activeStore) return;

    const isHomeActive  = currentView === "HOME" || !activeCat;
    const styleInactive = "bg-accent/10 border border-accent/20 text-white hover:bg-accent/20";
    const styleActive   = "bg-accent border border-accent text-dark font-black shadow-lg shadow-accent/20";

    let html = `<button onclick="resetAll()" class="whitespace-nowrap px-4 py-2 rounded-xl text-[10px] uppercase font-bold transition-all active:scale-95 ${isHomeActive ? styleActive : styleInactive}">Tudo</button>`;

    (Array.isArray(categories) ? categories : []).forEach(cat => {
        const name = typeof cat === 'object' ? (cat.name || cat.categoria || "") : cat;
        if (!name) return;

        const hasProducts = allProducts.some(p => {
            if (!p.category || p.category.trim().toLowerCase() !== name.trim().toLowerCase()) return false;
            if (p.hasVariations && p.variations) return p.variations.some(v => getVariationStock(v) > 0);
            return getProductStock(p) > 0;
        });
        if (!hasProducts) return;

        const isActive   = !isHomeActive && activeCat && activeCat.trim().toLowerCase() === name.trim().toLowerCase();
        html += `<button onclick="changeView('CATEGORY','${name}')" class="whitespace-nowrap px-4 py-2 rounded-xl text-[10px] uppercase font-bold transition-all active:scale-95 ${isActive ? styleActive : styleInactive}">${name}</button>`;
    });

    nav.innerHTML = html;
}

function changeView(view, cat = null, sub = null) {
    showLocalLoading();
    setTimeout(() => {
        currentView = view;
        activeCat   = cat;
        activeSub   = sub;
        if (view === "HOME") activeFilters = {};
        currentPage = 1;
        render();
        renderQuickNav();
        if (view !== "HOME") window.scrollTo({ top: 320, behavior: "smooth" });
    }, 50);
}

function handleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        showLocalLoading();
        setTimeout(() => { currentPage = 1; render(); }, 100);
    }, 400);
}

function handleSubFilter(sub) {
    if (sub === "") changeView("CATEGORY", activeCat);
    else changeView("SUBCATEGORY", activeCat, sub);
}

function setAttrFilter(key, val) {
    if (val === "") delete activeFilters[key];
    else activeFilters[key] = val;
    currentPage = 1;
    render();
}

function toggleFilters() {
    const extra = document.getElementById("extra-filters");
    extra.classList.toggle("hidden");
    if (!extra.classList.contains("hidden")) extra.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showLocalLoading() {
    const container = document.getElementById("catalog-content");
    if (!container) return;
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-32 w-full col-span-full animate-in">
            <span class="loader"></span>
            <p class="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mt-6 animate-pulse">Sincronizando Unidade...</p>
        </div>`;
}

/* ──────────────────────────────────────────
   RENDER PRINCIPAL
────────────────────────────────────────── */

function render() {
    const container  = document.getElementById("catalog-content");
    const header     = document.getElementById("view-header");
    const footer     = document.getElementById("catalog-footer");
    const attrBox    = document.getElementById("attribute-filters");
    const brandBox   = document.getElementById("brand-filter-container");
    const searchInput = document.getElementById("public-search");

    if (!container || !activeStore) return;

    const isMobile  = window.innerWidth < 768;
    const searchRaw = searchInput ? searchInput.value.toLowerCase().trim() : "";

    let htmlOutput = "";
    footer.innerHTML = "";
    attrBox.innerHTML = "";

    let filtered = allProducts.filter(p => {
        let matchesSearch = true;
        if (searchRaw) {
            const keywords = searchRaw.split(/\s+/);
            matchesSearch  = keywords.every(word => {
                const s = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                return new RegExp(`(^|\\s|[\\/\\-])(${s})($|\\s|[\\/\\-])`, "i").test(p.name);
            });
        }
        const matchesCat = activeCat ? p.category === activeCat : true;
        const matchesSub = activeSub ? p.subcategory === activeSub : true;
        return matchesSearch && matchesCat && matchesSub;
    });

    Object.keys(activeFilters).forEach(key => {
        filtered = filtered.filter(p => p.attributes && p.attributes[key] === activeFilters[key]);
    });

    filtered.sort((a, b) => {
        const stockA = a.hasVariations && a.variations ? a.variations.reduce((acc, v) => acc + getVariationStock(v), 0) : getProductStock(a);
        const stockB = b.hasVariations && b.variations ? b.variations.reduce((acc, v) => acc + getVariationStock(v), 0) : getProductStock(b);
        if (stockA > 0 && stockB <= 0) return -1;
        if (stockA <= 0 && stockB > 0) return 1;
        return 0;
    });

    if (activeCat && currentView !== "HOME") renderAttributeSelectors(filtered, attrBox);
    else attrBox.innerHTML = "";

    if (activeCat) { brandBox.classList.remove("hidden"); setupBrandSelect(); }
    else brandBox.classList.add("hidden");

    const isFiltering = Object.keys(activeFilters).length > 0 || searchRaw.length > 0;

    if (currentView === "HOME" && !isFiltering) {
        header.classList.add("hidden");
        categories.forEach(cat => {
            const catProducts = filtered.filter(p => p.category === cat.name);
            if (catProducts.length > 0) {
                htmlOutput += createSectionHTML(cat.name, catProducts.slice(0, isMobile ? 6 : 8), "CATEGORY", cat.name);
            }
        });
    } else if (currentView === "CATEGORY" && !isFiltering) {
        header.classList.remove("hidden");
        document.getElementById("active-title").innerText = activeCat;
        const catData = categories.find(c => c.name === activeCat);
        catData?.subcategories.forEach(sub => {
            const products = filtered.filter(p => p.subcategory && p.subcategory.trim().toLowerCase() === sub.trim().toLowerCase());
            if (products.length > 0) {
                htmlOutput += createSectionHTML(`${activeCat} ${sub}`, products.slice(0, isMobile ? 6 : 8), "SUBCATEGORY", activeCat, sub);
            }
        });
    } else {
        header.classList.remove("hidden");
        document.getElementById("active-title").innerText = activeSub ? `${activeCat} ${activeSub}` : activeCat || "Busca";

        if (filtered.length === 0) {
            htmlOutput = `<div class="py-20 text-center w-full"><p class="text-gray-500 font-black uppercase text-xs">Sem resultados para esta unidade.</p></div>`;
        } else {
            const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
            const pageItems  = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
            htmlOutput = `<div class="flex flex-col gap-3 animate-in">${pageItems.map(p => renderCard(p)).join("")}</div>`;
            renderPager(currentPage, totalPages, filtered.length, footer);
        }
    }

    container.innerHTML = htmlOutput;
}

let lastWidth = window.innerWidth;
window.addEventListener("resize", () => {
    if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(render, 250);
    }
});

/* ──────────────────────────────────────────
   RENDER DOS CARDS
────────────────────────────────────────── */

function renderCard(p) {
    const hasVars  = p.hasVariations && p.variations?.length > 0;
    const lojaAtual = activeStore || "Geral";

    // ── PRODUTO SIMPLES ──
    if (!hasVars) {
        const currentStock  = getProductStock(p);
        const isOutOfStock  = currentStock <= 0;
        const itemId        = p._id || p.id;
        const alreadyInCart = isInCart(itemId);

        const stockCardClasses = isOutOfStock
            ? "opacity-50 grayscale-[30%] border-gray-900/50 bg-gray-950/40 pointer-events-none"
            : "hover:border-accent/30 hover:bg-gray-800/20 shadow-xl hover:shadow-accent/5";

        // Botão dinâmico: "Adicionado" ou "Adicionar"
        let addBtn = "";
        if (isOutOfStock) {
            addBtn = `<button disabled class="bg-gray-900 text-gray-600 font-bold text-[10px] uppercase tracking-wider px-5 py-3 rounded-xl cursor-not-allowed border border-gray-800/40">Indisponível</button>`;
        } else if (alreadyInCart) {
            addBtn = `<button disabled class="bg-emerald-900/40 text-emerald-400 border border-emerald-800/50 font-black text-[10px] uppercase tracking-wider px-5 py-3 rounded-xl flex items-center gap-1.5">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                        Adicionado
                      </button>`;
        } else {
            addBtn = `<button onclick="addToCart('${itemId}','${encodeURIComponent(p.name)}',${p.price},'${lojaAtual}')"
                        class="bg-white hover:bg-accent text-dark font-black text-[10px] md:text-xs uppercase tracking-wider px-5 py-3 rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-lg hover:shadow-accent/20">
                        Adicionar
                      </button>`;
        }

        return `
            <div class="gpu-card bg-gradient-to-r from-card to-card/70 border border-gray-800/80 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 w-full relative transition-all duration-300 ${stockCardClasses}">
                ${isOutOfStock ? `<div class="absolute top-3 right-3 bg-rose-950/80 border border-rose-800/60 text-rose-400 font-black uppercase text-[8px] tracking-widest px-2.5 py-1 rounded-lg">Esgotado na Loja</div>` : ""}
                <div class="flex-grow space-y-2.5 md:max-w-[65%]">
                    <div class="flex items-center gap-2">
                        <span class="text-[9px] font-black text-accent bg-accent/10 px-2 py-0.5 rounded-md uppercase tracking-wider">${p.category || 'Peça'}</span>
                        ${p.subcategory ? `<span class="text-[9px] font-bold text-gray-400 uppercase tracking-wide">/ ${p.subcategory}</span>` : ''}
                    </div>
                    <h4 class="text-sm md:text-base font-extrabold text-gray-100 leading-snug tracking-tight">${p.name}</h4>
                    <div class="flex flex-wrap gap-1.5 pt-0.5">
                        ${p.attributes ? Object.entries(p.attributes).map(([k,v]) => v ? `<span class="px-2 py-0.5 rounded-md text-[8px] md:text-[9px] font-bold border uppercase tracking-wide ${getTagStyle(v)}">${v}</span>` : "").join("") : ""}
                    </div>
                </div>
                <div class="flex flex-row items-center justify-between md:flex-col md:items-end md:justify-center pt-4 md:pt-0 border-t border-gray-800/80 md:border-t-0 shrink-0 md:pl-6 md:min-w-[200px] gap-4">
                    <div class="flex flex-col md:items-end">
                        <span class="text-[9px] font-black text-gray-500 uppercase tracking-widest">Preço à vista</span>
                        <p class="text-2xl md:text-3xl font-black ${isOutOfStock ? 'text-gray-600' : 'text-accent font-mono'} tracking-tight leading-none mt-1">
                            <span class="text-xs md:text-sm font-bold mr-0.5">R$</span>${parseFloat(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    ${addBtn}
                </div>
            </div>`;
    }

    // ── PRODUTO COM VARIAÇÕES ──
    const totalStock       = p.variations.reduce((acc, v) => acc + getVariationStock(v), 0);
    const isParentOutOfStock = totalStock <= 0;
    const minPrice         = Math.min(...p.variations.map(v => v.price || p.price));
    const productId        = p._id || p.id;

    const sortedVariations = [...p.variations].sort((a, b) => {
        const sA = getVariationStock(a), sB = getVariationStock(b);
        if (sA > 0 && sB <= 0) return -1;
        if (sA <= 0 && sB > 0) return 1;
        return 0;
    });

    const variationsHTML = sortedVariations.map((v, index) => {
        const vStock       = getVariationStock(v);
        const isVOOS       = vStock <= 0;
        const varId        = `${productId}-${index}`;
        const alreadyInCart = isInCart(varId);
        const varFullName  = `${p.name} (${v.type}: ${v.value})`;
        const vStyleClasses = isVOOS ? "opacity-40 grayscale-[40%] bg-gray-950/20 pointer-events-none" : "hover:bg-gray-800/40";

        let varBtn = "";
        if (isVOOS) {
            varBtn = `<span class="text-[10px] font-bold text-gray-600 uppercase tracking-wider px-4 py-2.5">Indisponível</span>`;
        } else if (alreadyInCart) {
            varBtn = `<button disabled class="bg-emerald-900/40 text-emerald-400 border border-emerald-800/50 font-black text-[9px] uppercase tracking-wider px-4 py-2.5 rounded-lg flex items-center gap-1.5">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                        Adicionado
                      </button>`;
        } else {
            varBtn = `<button onclick="addToCart('${varId}','${encodeURIComponent(varFullName)}',${v.price || p.price},'${lojaAtual}')"
                        class="bg-gray-800 hover:bg-accent text-gray-200 hover:text-dark font-black text-[9px] uppercase tracking-wider px-4 py-2.5 rounded-lg transition-all active:scale-95 border border-gray-700/60 hover:border-transparent">
                        Adicionar
                      </button>`;
        }

        return `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-gray-800/40 bg-card/40 transition-all ${vStyleClasses}">
                <div class="flex items-center gap-3">
                    <div class="bg-gray-800 text-[10px] font-black text-gray-300 px-2.5 py-1 rounded-md border border-gray-700/50 uppercase">
                        ${v.type}: <span class="text-accent">${v.value}</span>
                    </div>
                    ${isVOOS ? `<span class="text-[9px] font-extrabold uppercase text-rose-500 tracking-wider bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-900/30">Sem estoque</span>` : ""}
                </div>
                <div class="flex items-center justify-between sm:justify-end gap-6 mt-3 sm:mt-0 pt-3 sm:pt-0 border-t border-gray-800/40 sm:border-t-0">
                    <p class="text-lg font-black ${isVOOS ? 'text-gray-600' : 'text-accent font-mono'}">
                        <span class="text-[10px] font-bold mr-0.5">R$</span>${parseFloat(v.price || p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                    ${varBtn}
                </div>
            </div>`;
    }).join("");

    return `
        <div class="w-full bg-gradient-to-r from-card to-card/70 border border-gray-800/80 rounded-2xl overflow-hidden transition-all duration-300 ${isParentOutOfStock ? 'opacity-50' : ''}">
            <div onclick="toggleDropdown('${productId}')" class="p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 w-full relative cursor-pointer hover:bg-gray-800/10 group select-none">
                ${isParentOutOfStock ? `<div class="absolute top-3 right-3 bg-rose-950/80 border border-rose-800/60 text-rose-400 font-black uppercase text-[8px] tracking-widest px-2.5 py-1 rounded-lg">Esgotado</div>` : ""}
                <div class="flex-grow space-y-2.5 md:max-w-[65%]">
                    <div class="flex items-center gap-2">
                        <span class="text-[9px] font-black text-accent bg-accent/10 px-2 py-0.5 rounded-md uppercase tracking-wider">${p.category || 'Peça'}</span>
                        <span class="text-[9px] font-black text-sky-400 bg-sky-950/50 border border-sky-900/40 px-2 py-0.5 rounded-md uppercase tracking-wider">Possui Variações</span>
                    </div>
                    <h4 class="text-sm md:text-base font-extrabold text-gray-100 leading-snug tracking-tight group-hover:text-accent transition-colors">${p.name}</h4>
                    <div class="flex flex-wrap gap-1.5 pt-0.5">
                        ${p.attributes ? Object.entries(p.attributes).map(([k,v]) => v ? `<span class="px-2 py-0.5 rounded-md text-[8px] md:text-[9px] font-bold border uppercase tracking-wide ${getTagStyle(v)}">${v}</span>` : "").join("") : ""}
                    </div>
                </div>
                <div class="flex flex-row items-center justify-between md:flex-col md:items-end md:justify-center pt-4 md:pt-0 border-t border-gray-800/80 md:border-t-0 shrink-0 md:pl-6 md:min-w-[200px] gap-4">
                    <div class="flex flex-col md:items-end">
                        <span class="text-[9px] font-black text-gray-500 uppercase tracking-widest">A partir de</span>
                        <p class="text-2xl md:text-3xl font-black text-white font-mono tracking-tight leading-none mt-1">
                            <span class="text-xs md:text-sm font-bold mr-0.5">R$</span>${parseFloat(minPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div id="arrow-${productId}" class="text-accent bg-gray-800/60 p-2.5 rounded-xl border border-gray-700/40 group-hover:bg-accent group-hover:text-dark transition-all duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 transform transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </div>
                </div>
            </div>
            <div id="dropdown-${productId}" class="hidden border-t border-gray-800/60 bg-gray-950/20 px-5 pb-5 pt-2">
                <p class="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-3">Selecione a opção desejada:</p>
                <div class="flex flex-col gap-2.5">${variationsHTML}</div>
            </div>
        </div>`;
}

function toggleDropdown(productId) {
    const panel = document.getElementById(`dropdown-${productId}`);
    const arrow = document.getElementById(`arrow-${productId}`)?.querySelector('svg');
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        if (arrow) arrow.classList.add('rotate-180');
    } else {
        panel.classList.add('hidden');
        if (arrow) arrow.classList.remove('rotate-180');
    }
}

function createSectionHTML(title, products, targetView, cat, sub = null) {
    return `
        <div class="animate-in mb-10">
            <div class="flex items-center justify-between mb-4 px-1">
                <h3 class="text-xs font-black uppercase tracking-[0.3em] text-gray-500">${title}</h3>
                <button onclick="changeView('${targetView}','${cat}','${sub || ""}')" class="text-[9px] font-black text-accent border border-accent/20 px-4 py-1.5 rounded-full uppercase hover:bg-accent hover:text-black transition-all">Ver Tudo</button>
            </div>
            <div class="flex flex-col gap-3">${products.map(p => renderCard(p)).join("")}</div>
        </div>`;
}

function renderAttributeSelectors(products, container) {
    if (!container) return;
    const attrOptions = {};
    products.forEach(p => {
        if (p.attributes) Object.entries(p.attributes).forEach(([k, v]) => {
            if (!attrOptions[k]) attrOptions[k] = new Set();
            attrOptions[k].add(v);
        });
    });
    container.innerHTML = "";
    Object.entries(attrOptions).forEach(([key, values]) => {
        const select = document.createElement("select");
        select.className = `bg-card border border-gray-700 rounded-lg px-3 py-2 pr-8 text-[10px] font-black uppercase outline-none focus:border-accent transition-all ${activeFilters[key] ? "border-accent text-accent" : "text-gray-400"}`;
        select.onchange  = e => setAttrFilter(key, e.target.value);
        select.innerHTML = `<option value="">${key}</option>` +
            Array.from(values).sort().map(v => `<option value="${v}" ${activeFilters[key] === v ? "selected" : ""}>${v}</option>`).join("");
        container.appendChild(select);
    });
}

function setupBrandSelect() {
    const subSelect = document.getElementById("sub-filter");
    if (!subSelect) return;
    const subs = [...new Set(
        allProducts
            .filter(p => p.category && p.category.trim().toLowerCase() === activeCat.trim().toLowerCase() && p.subcategory)
            .map(p => p.subcategory)
    )];
    subSelect.innerHTML = `<option value="">Subcategoria</option>` +
        subs.sort().map(s => `<option value="${s}" ${activeSub === s ? "selected" : ""}>${s}</option>`).join("");
}

function renderPager(current, total, totalItems, footer) {
    if (total <= 1) {
        footer.innerHTML = `<p class="text-[10px] font-black text-gray-600 uppercase tracking-widest">${totalItems} PRODUTOS ENCONTRADOS</p>`;
        return;
    }
    const startItem = (current - 1) * ITEMS_PER_PAGE + 1;
    const endItem   = Math.min(current * ITEMS_PER_PAGE, totalItems);
    footer.innerHTML = `
        <div class="flex flex-col items-center gap-4 w-full max-w-xs mx-auto">
            <div class="text-center space-y-1">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                    Exibindo <span class="text-accent">${startItem}-${endItem}</span> de <span class="text-white">${totalItems}</span> produtos
                </p>
                <div class="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div class="h-full bg-accent transition-all duration-500" style="width:${(current/total)*100}%"></div>
                </div>
            </div>
            <div class="flex items-center gap-2 bg-card border border-gray-800 p-1.5 rounded-2xl w-full justify-between shadow-2xl">
                <button onclick="goToPage(${current-1})" ${current===1?"disabled":""} class="flex-1 flex items-center justify-center py-3 rounded-xl transition-all active:scale-95 disabled:opacity-20 disabled:grayscale">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <div class="px-4 border-x border-gray-800">
                    <span class="text-xs font-black text-white font-mono">${String(current).padStart(2,"0")}</span>
                    <span class="text-[10px] font-bold text-gray-600 uppercase mx-1">/</span>
                    <span class="text-[10px] font-bold text-gray-600 uppercase">${String(total).padStart(2,"0")}</span>
                </div>
                <button onclick="goToPage(${current+1})" ${current===total?"disabled":""} class="flex-1 flex items-center justify-center py-3 rounded-xl transition-all active:scale-95 disabled:opacity-20 disabled:grayscale">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"/></svg>
                </button>
            </div>
        </div>`;
}

function goToPage(p) {
    currentPage = p;
    render();
    window.scrollTo({ top: 400, behavior: "smooth" });
}

/* ──────────────────────────────────────────
   CARRINHO
────────────────────────────────────────── */

// AJUSTE 2: toggleCartPanel abre/fecha o drawer — NÃO é chamado pelo addToCart
function toggleCartPanel() {
    const panel    = document.getElementById("cart-panel");
    const backdrop = document.getElementById("cart-backdrop");
    if (!panel) return;

    const isOpen = !panel.classList.contains("translate-x-full");

    if (isOpen) {
        // Fecha
        panel.classList.add("translate-x-full");
        if (backdrop) {
            backdrop.classList.add("opacity-0");
            setTimeout(() => backdrop.classList.add("hidden"), 300);
        }
    } else {
        // Abre
        if (backdrop) {
            backdrop.classList.remove("hidden");
            setTimeout(() => backdrop.classList.remove("opacity-0"), 10);
        }
        panel.classList.remove("translate-x-full");
    }
}

// AJUSTE 2: addToCart NÃO abre o carrinho — apenas atualiza o estado e re-renderiza os cards
function addToCart(id, name, price, store) {
    const decodedName   = decodeURIComponent(name);
    const existingItem  = cart.find(item => item.id === id && item.store === store);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ id, name: decodedName, price: Number(price), store, quantity: 1 });
    }

    updateCartUI();
    render(); // AJUSTE 3: re-renderiza para trocar o botão para "Adicionado"
}

function updateQuantity(id, store, change) {
    const idx = cart.findIndex(item => item.id === id && item.store === store);
    if (idx === -1) return;

    cart[idx].quantity += change;
    if (cart[idx].quantity < 1) cart.splice(idx, 1);

    updateCartUI();
    render(); // AJUSTE 3: re-renderiza para restaurar o botão "Adicionar" se o item for removido
}

function clearCart() {
    cart = [];
    updateCartUI();
    render();
}

function updateCartUI() {
    const badge          = document.getElementById("cart-badge");
    const listContainer  = document.getElementById("cart-items-list");
    const totalQtyLabel  = document.getElementById("cart-total-qty");
    const totalPriceLabel = document.getElementById("cart-total-price");

    let totalItems = 0;
    let totalPrice = 0;

    if (cart.length === 0) {
        if (badge) badge.classList.add("hidden");
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="text-center py-16 text-gray-500 font-black uppercase text-xs tracking-wider">
                    Seu carrinho está vazio.
                </div>`;
        }
        if (totalQtyLabel)   totalQtyLabel.innerText   = "0";
        if (totalPriceLabel) totalPriceLabel.innerText = "R$ 0,00";
        return;
    }

    cart.forEach(item => {
        totalItems += item.quantity;
        totalPrice += item.price * item.quantity;
    });

    if (badge) {
        badge.innerText = totalItems;
        badge.classList.remove("hidden");
        // Pequena animação de bump no badge
        badge.classList.add("bump");
        setTimeout(() => badge.classList.remove("bump"), 200);
    }

    if (totalQtyLabel)   totalQtyLabel.innerText   = totalItems;
    if (totalPriceLabel) totalPriceLabel.innerText = totalPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    if (listContainer) {
        listContainer.innerHTML = cart.map(item => {
            const itemTotal = item.price * item.quantity;
            return `
                <div class="p-4 bg-dark/60 border border-gray-800 rounded-xl flex flex-col gap-3">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex-grow">
                            <h5 class="text-xs font-extrabold text-gray-100 leading-snug">${item.name}</h5>
                            <span class="text-[9px] font-black text-accent bg-accent/10 px-1.5 py-0.5 rounded uppercase mt-1 inline-block tracking-wide">
                                Filial: ${item.store}
                            </span>
                        </div>
                        <span class="text-xs font-black text-gray-400 font-mono shrink-0">
                            ${item.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                    </div>
                    <div class="flex items-center justify-between pt-2 border-t border-gray-800/50">
                        <div class="flex items-center bg-dark border border-gray-800 rounded-lg p-0.5">
                            <button onclick="updateQuantity('${item.id}','${item.store}',-1)"
                                class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-rose-400 rounded-md transition-colors active:scale-90 font-black text-sm">−</button>
                            <span class="w-8 text-center text-xs font-black font-mono text-white">${item.quantity}</span>
                            <button onclick="updateQuantity('${item.id}','${item.store}',1)"
                                class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-accent rounded-md transition-colors active:scale-90 font-black text-sm">+</button>
                        </div>
                        <span class="text-xs font-black text-accent font-mono">
                            ${itemTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                    </div>
                </div>`;
        }).join("");
    }
}

// AJUSTE 4: checkoutCart limpa o carrinho após enviar a mensagem
function checkoutCart() {
    if (cart.length === 0) { alert("Seu carrinho está vazio!"); return; }

    const phoneNumber = STORE_CONTACTS[activeStore] || STORE_CONTACTS["São Roque"];

    let totalGeral = 0;
    let message = `*NOVO PEDIDO - JACK PEÇAS*\n`;
    message    += `*Unidade:* Loja ${activeStore}\n`;
    message    += `───────────────────────────\n\n`;

    cart.forEach((item, index) => {
        const subtotal  = item.price * item.quantity;
        totalGeral     += subtotal;
        message += `*${item.quantity}x* ${item.name}\n`;
        message += `Preço Unitário: ${item.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n`;
        message += `Subtotal: *${subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}*\n\n`;
    });

    message += `───────────────────────────\n`;
    message += `*TOTAL: ${totalGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}*\n\n`;
    message += `Gostaria de verificar disponibilidade e finalizar este pedido.`;

    window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`, "_blank");

    // AJUSTE 4: limpa o carrinho e fecha o drawer após envio
    cart = [];
    updateCartUI();
    render();
    toggleCartPanel();
}

function getTagStyle(text) {
    if (!text) return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
    const style = TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
    return `${style.bg} ${style.text} ${style.border}`;
}

window.onload = init;