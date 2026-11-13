let allProducts = [];
let categories = [];
let activePromotions = [];
let flashCountdownInterval = null;

let searchTimer;
let currentView = "HOME"; // "HOME", "CATEGORY", "SUBCATEGORY", "PROMOTION"
let activeCat = null;
let activeSub = null;
let activePromoId = null;
let currentPage = 1;
let currentSort = 'default';
const ITEMS_PER_PAGE = 20;
let socket;

// Estado Global do Carrinho e Loja Ativa
let cart = [];
let activeStore = null;
let attributeColorMap = {};

// Números do WhatsApp por filial
const STORE_CONTACTS = {
  "São Roque": "5511941743113",
  Cotia: "5511943924756",
  Ibiúna: "5511943908395",
};

// Mapeamento das chaves do schema Mongoose
const STORE_SCHEMA_KEYS = {
  "São Roque": "SaoRoque",
  Cotia: "Cotia",
  Ibiúna: "Ibiuna",
};

const TAG_PALETTE = [
  { bg: "bg-[#7ed1cc]/10", text: "text-[#007267]", border: "border-[#007267]" },
  { bg: "bg-[#0ea5e9]/10", text: "text-[#0ea5e9]", border: "border-[#0ea5e9]" },
  { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
  { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/20" },
  { bg: "bg-orange-500/10", text: "text-[#f97800]", border: "border-[#f97800]" },
  { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
  { bg: "bg-cyan-500/10", text: "text-[#0094fd]", border: "border-[#0094fd]" },
  { bg: "bg-lime-500/10", text: "text-[#09af00]", border: "border-[#09af00]" },
  { bg: "bg-fuchsia-500/10", text: "text-fuchsia-400", border: "border-fuchsia-500/20" },
  { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/20" },
  { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  { bg: "bg-teal-500/10", text: "text-teal-400", border: "border-teal-500/20" },
  { bg: "bg-red-500/10", text: "text-[#D32F2F]", border: "border-[#D32F2F]" },
  { bg: "bg-blue-600/10", text: "text-blue-400", border: "border-blue-600/20" },
  { bg: "bg-yellow-500/10", text: "text-yellow-300", border: "border-yellow-500/20" },
  { bg: "bg-slate-400/10", text: "text-slate-300", border: "border-slate-400/20" },
  { bg: "bg-green-600/10", text: "text-[#008b00]", border: "border-[#008b00]" },
  { bg: "bg-zinc-400/10", text: "text-zinc-300", border: "border-zinc-400/20" },
  { bg: "bg-[#002cf1]/10", text: "text-[#002cf1]", border: "border-[#002cf1]" },
];

/* ──────────────────────────────────────────
   HELPERS DE ESTOQUE E PREÇO PROMOCIONAL
────────────────────────────────────────── */

function getProductStock(p) {
  const storeKey = STORE_SCHEMA_KEYS[activeStore] || "SaoRoque";
  if (p.stock_by_store && p.stock_by_store[storeKey] !== undefined) {
    return p.stock_by_store[storeKey];
  }
  return p.stock !== undefined ? p.stock : p.estoque || 0;
}

function getVariationStock(v) {
  const storeKey = STORE_SCHEMA_KEYS[activeStore] || "SaoRoque";
  if (v.stock_by_store && v.stock_by_store[storeKey] !== undefined) {
    return v.stock_by_store[storeKey];
  }
  return v.stock !== undefined ? v.stock : v.estoque || 0;
}

function isInCart(id) {
  return cart.some((item) => item.id === id);
}

/* ──────────────────────────────────────────
   HELPERS GERAIS DE PROMOÇÃO
────────────────────────────────────────── */

const formatBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const getPromoId = (promo) => String(promo._id || promo.id);

function findPromoById(id) {
  return activePromotions.find((pr) => getPromoId(pr) === String(id)) || null;
}

function isPromoLive(promo, now = Date.now()) {
  if (!promo || promo.status === "cancelada" || promo.status === "finalizada") return false;
  const start = new Date(promo.startDate).getTime();
  const end = new Date(promo.endDate).getTime();
  return now >= start && now <= end;
}

function pruneExpiredPromotions() {
  const live = activePromotions.filter((p) => isPromoLive(p));
  if (live.length !== activePromotions.length) activePromotions = live;
}

function getTotalStock(p) {
  if (p.hasVariations && p.variations?.length) {
    return p.variations.reduce((acc, v) => acc + getVariationStock(v), 0);
  }
  return getProductStock(p);
}

function getPromoProducts(promo) {
  const ids = new Set((promo.items || []).map((i) => String(i.productId)));
  return allProducts.filter((p) => ids.has(String(p._id || p.id)));
}

function getPromoMaxDiscount(promo) {
  return (promo.items || []).reduce((max, i) => {
    const o = parseFloat(i.originalPrice);
    const pr = parseFloat(i.promoPrice);
    if (o > 0 && pr < o) return Math.max(max, Math.round(((o - pr) / o) * 100));
    return max;
  }, 0);
}

/* ──────────────────────────────────────────
   ÍNDICE DE PROMOÇÕES (O(1))
────────────────────────────────────────── */

let _promoIndex = null;
let _promoIndexSource = null;
let _promoIndexSize = -1;

function getPromoIndex() {
  if (
    _promoIndex &&
    _promoIndexSource === activePromotions &&
    _promoIndexSize === activePromotions.length
  ) {
    return _promoIndex;
  }

  const idx = new Map();
  (activePromotions || []).forEach((promo) => {
    (promo.items || []).forEach((item) => {
      const key = `${item.productId}|${item.isVariation ? String(item.variantBlingId) : ""}`;
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key).push({ promo, item });
    });
  });

  _promoIndex = idx;
  _promoIndexSource = activePromotions;
  _promoIndexSize = activePromotions.length;
  return idx;
}

function getPromotionalInfo(productId, variantBlingId = null, defaultPrice = 0, preferredPromo = null) {
  if (!activePromotions || activePromotions.length === 0) return null;

  const key = `${productId}|${variantBlingId ? String(variantBlingId) : ""}`;
  const entries = getPromoIndex().get(key);
  if (!entries) return null;

  let ordered = entries;
  if (preferredPromo) {
    const pid = getPromoId(preferredPromo);
    ordered = [...entries].sort(
      (a, b) => (getPromoId(b.promo) === pid) - (getPromoId(a.promo) === pid)
    );
  }

  const now = Date.now();
  const current = parseFloat(defaultPrice) || 0;

  for (const { promo, item } of ordered) {
    if (!isPromoLive(promo, now)) continue;

    const promoP = parseFloat(item.promoPrice);
    if (!Number.isFinite(promoP)) continue;

    const itemOrig = parseFloat(item.originalPrice);
    const reference = current > 0 ? current : itemOrig;
    if (!(promoP < reference)) continue;

    const orig = itemOrig > promoP ? itemOrig : reference;
    const discountPct = Math.max(1, Math.round(((orig - promoP) / orig) * 100));

    return {
      originalPrice: orig,
      promoPrice: promoP,
      discountPct,
      promoId: getPromoId(promo),
      promoTitle: promo.type === "flash" ? "Oferta Relâmpago" : "Promoção Jack",
      promoType: promo.type,
    };
  }

  return null;
}

function getProductParentPromoInfo(p, preferredPromo = null) {
  if (!p.hasVariations || !p.variations?.length) return null;
  const productId = p._id || p.id;

  const rows = p.variations.map((v) => {
    const price = parseFloat(v.price || p.price) || 0;
    return {
      price,
      stock: getVariationStock(v),
      promo: getPromotionalInfo(productId, v.blingId, price, preferredPromo),
    };
  });

  const inStock = rows.filter((r) => r.stock > 0);
  const pool = inStock.length ? inStock : rows;

  const minPrice = Math.min(...pool.map((r) => (r.promo ? r.promo.promoPrice : r.price)));
  const promoRows = pool.filter((r) => r.promo);

  if (!promoRows.length) return { hasPromo: false, minPrice };

  const pcts = promoRows.map((r) => r.promo.discountPct);
  const maxPct = Math.max(...pcts);
  const minPct = Math.min(...pcts);
  const cheapest = promoRows.reduce((a, b) => (b.promo.promoPrice < a.promo.promoPrice ? b : a));

  return {
    hasPromo: true,
    sameDiscount: maxPct === minPct,
    minPct,
    maxPct,
    minPromoPrice: cheapest.promo.promoPrice,
    originalOfMin: cheapest.promo.originalPrice,
    promoType: promoRows.some((r) => r.promo.promoType === "flash") ? "flash" : "standard",
    promoCount: promoRows.length,
    totalCount: pool.length,
    minPrice,
  };
}

/* ──────────────────────────────────────────
   INIT & FETCH
────────────────────────────────────────── */

function startBlackFridayCountdown() {
  const targetDate = new Date("2026-11-27T00:00:00").getTime();
  let countdownInterval = null;

  const updateTimer = () => {
    const difference = targetDate - Date.now();
    const elements = {
      days: document.getElementById("cd-days"),
      hours: document.getElementById("cd-hours"),
      minutes: document.getElementById("cd-minutes"),
      seconds: document.getElementById("cd-seconds"),
    };

    if (difference <= 0) {
      Object.values(elements).forEach((element) => {
        if (element) element.textContent = "00";
      });
      if (countdownInterval) clearInterval(countdownInterval);
      return;
    }

    const values = {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((difference % (1000 * 60)) / 1000),
    };

    Object.entries(values).forEach(([unit, value]) => {
      const element = elements[unit];
      if (element) element.textContent = String(value).padStart(2, "0");
    });
  };

  updateTimer();
  if (targetDate > Date.now()) {
    countdownInterval = setInterval(updateTimer, 1000);
  }
}

async function init() {
  startBlackFridayCountdown();

  const API_BASE_URL = "https://api.jackpecas.com.br";
  const overlay = document.getElementById("loading-overlay");

  showLocalLoading();

  try {
    const searchInput = document.getElementById("public-search");
    if (searchInput) searchInput.addEventListener("input", handleSearch);

    const fetchOptions = {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    };

    const [resCat, resProd, resAttr, resPromo] = await Promise.all([
      fetch(`${API_BASE_URL}/api/categories`, fetchOptions),
      fetch(`${API_BASE_URL}/api/products?limit=9999`, fetchOptions),
      fetch(`${API_BASE_URL}/api/attributes`, fetchOptions),
      fetch(`${API_BASE_URL}/api/promotions`, fetchOptions).catch(() => null)
    ]);

    if (!resCat.ok || !resProd.ok)
      throw new Error("Erro na resposta do servidor");

    categories = await resCat.json();
    const prodData = await resProd.json();
    allProducts = prodData.products || [];

    if (resPromo && resPromo.ok) {
      const allPromos = await resPromo.json();
      const now = new Date();
      activePromotions = allPromos.filter(p => {
        if (p.status === 'cancelada' || p.status === 'finalizada') return false;
        const start = new Date(p.startDate);
        const end = new Date(p.endDate);
        return now >= start && now <= end;
      });

      activePromotions.sort((a, b) => (b.type === 'flash' ? 1 : 0) - (a.type === 'flash' ? 1 : 0));
    }

    if (resAttr && resAttr.ok) {
      const attributesData = await resAttr.json();
      attributesData.forEach(attr => {
        if (attr.options && Array.isArray(attr.options)) {
          attr.options.forEach(opt => {
            if (typeof opt === 'object' && opt.name) {
              attributeColorMap[opt.name] = opt.color;
            }
          });
        }
      });
    }

    if (typeof io !== 'undefined') {
      socket = io(API_BASE_URL);

      socket.on("product_stock_updated", (data) => {
        handleSocketStockUpdate(data);
      });

      socket.on("product_updated", (data) => {
        handleSocketProductUpdate(data.product);
      });

      socket.on("product_deleted", (data) => {
        handleSocketProductDelete(data.blingId);
      });
    }

    const savedStore = localStorage.getItem("jack_pecas_preferred_store");
    if (savedStore && STORE_CONTACTS[savedStore]) {
      activeStore = savedStore;
      updateStoreLabel(activeStore);
      renderCategoriesDrawer();
      render();
    } else {
      openStoreSelector();
    }

    updateCartUI();

    if (overlay) {
      overlay.classList.add("opacity-0");
      setTimeout(() => overlay.remove(), 500);
    }
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
    const container = document.getElementById("catalog-content");
    if (container)
      container.innerHTML = `<p class="text-red-500 text-center py-10 uppercase font-black text-xs">Erro ao conectar com o servidor.</p>`;
    if (overlay) overlay?.remove();
  }
}

/* ──────────────────────────────────────────
   REAL-TIME (SOCKET) HANDLERS
────────────────────────────────────────── */

function handleSocketProductUpdate(updatedProduct) {
  if (!updatedProduct) return;
  const productId = updatedProduct._id || updatedProduct.id;

  const status = updatedProduct.situacao || updatedProduct.status || "";
  const isInactive = String(status).toLowerCase().startsWith("i") || String(status).toLowerCase().startsWith("e") || updatedProduct.action === "delete";

  if (isInactive) {
    if (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) {
      allProducts = allProducts.filter(p => String(p._id || p.id) !== String(productId));
    }
    
    if (typeof cart !== 'undefined' && Array.isArray(cart)) {
      const itensAntes = cart.length;
      cart = cart.filter(item => !String(item.id).startsWith(String(productId)));
      if (cart.length < itensAntes) {
        mostrarAvisoCarrinho(`Um produto que estava no seu carrinho foi inativado e removido.`);
        if (typeof updateCartUI === 'function') updateCartUI();
      }
    }
    render();
    return; 
  }

  const idx = allProducts.findIndex(p => String(p._id || p.id) === String(productId));
  if (idx !== -1) {
    allProducts[idx] = updatedProduct;
  } else {
    allProducts.unshift(updatedProduct);
  }

  atualizarDadosCarrinhoRealTime(productId, updatedProduct);
  render();
}

function handleSocketProductDelete(blingId) {
  if (!blingId) return;
  let mongoIdsToRemove = [];

  if (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) {
    allProducts = allProducts.filter(p => {
      if (String(p.blingId) === String(blingId)) {
        mongoIdsToRemove.push(String(p._id || p.id));
        return false;
      }
      if (p.variations) {
        p.variations = p.variations.filter(v => String(v.blingId) !== String(blingId));
        if (p.variations.length === 0 && p.hasVariations) {
          mongoIdsToRemove.push(String(p._id || p.id));
          return false; 
        }
      }
      return true;
    });
  }

  if (typeof cart !== 'undefined' && Array.isArray(cart) && mongoIdsToRemove.length > 0) {
    cart = cart.filter(item => {
      const itemBaseMongoId = String(item.id).split('-')[0];
      return !mongoIdsToRemove.includes(itemBaseMongoId);
    });
    if (typeof updateCartUI === 'function') updateCartUI();
  }

  render();
}

function handleSocketStockUpdate(data) {
  if (!data || !data.productId) return;
  const targetProduct = allProducts.find(p => 
    String(p._id || p.id) === String(data.productId) || String(p.blingId) === String(data.productId)
  );
  if (!targetProduct) return;

  const storeKey = STORE_SCHEMA_KEYS[activeStore] || "SaoRoque";
  
  if (data.isVariation && targetProduct.variations) {
    const vIdx = targetProduct.variations.findIndex(v => String(v.blingId) === String(data.variantBlingId));
    if (vIdx !== -1) {
      targetProduct.variations[vIdx].stock_by_store = data.stock_by_store;
      const newStock = data.stock_by_store[storeKey] || 0;
      const varName = targetProduct.variations[vIdx].name;
      const cartId = `${targetProduct._id || targetProduct.id}-${targetProduct.variations[vIdx].blingId}`;
      verificarLimitesCarrinhoRealTime(cartId, newStock, varName);
    }
  } else {
    targetProduct.stock_by_store = data.stock_by_store;
    const newStock = data.stock_by_store[storeKey] || 0;
    verificarLimitesCarrinhoRealTime(targetProduct._id || targetProduct.id, newStock, targetProduct.name);
  }

  render(); 
}

function atualizarDadosCarrinhoRealTime(productId, updatedProduct) {
  if (!cart || !Array.isArray(cart)) return;
  const storeKey = STORE_SCHEMA_KEYS[activeStore] || "SaoRoque";
  let cartChanged = false;

  cart = cart.filter(item => {
    if (String(item.id).startsWith(String(productId))) {
      let newStock = item.maxStock;
      let itemName = item.name;
      let varAindaExiste = true;

      if (updatedProduct.hasVariations && updatedProduct.variations) {
        const parts = String(item.id).split('-');
        const varBlingId = parts[1]; 
        const matchedVar = updatedProduct.variations.find(v => String(v.blingId) === String(varBlingId));
        if (matchedVar) {
          item.name = matchedVar.name;
          item.price = matchedVar.price;
          newStock = matchedVar.stock_by_store ? (matchedVar.stock_by_store[storeKey] || 0) : 0;
          itemName = item.name;
        } else {
          varAindaExiste = false;
        }
      } else {
        item.name = updatedProduct.name;
        item.price = updatedProduct.price;
        newStock = updatedProduct.stock_by_store ? (updatedProduct.stock_by_store[storeKey] || 0) : 0;
        itemName = item.name;
      }

      if (!varAindaExiste) {
        mostrarAvisoCarrinho(`A opção "${itemName}" foi removida do catálogo e do seu carrinho.`);
        cartChanged = true;
        return false;
      }

      item.maxStock = newStock;

      if (newStock <= 0) {
        mostrarAvisoCarrinho(`A opção "${itemName}" esgotou na loja ativa e foi removida do carrinho.`);
        cartChanged = true;
        return false;
      } else if (item.quantity > newStock) {
        mostrarAvisoCarrinho(`A quantidade de "${itemName}" foi ajustada para ${newStock} devido à disponibilidade do estoque.`);
        item.quantity = newStock;
        cartChanged = true;
      }
    }
    return true;
  });

  if (cartChanged) updateCartUI();
}

function verificarLimitesCarrinhoRealTime(itemId, newStock, itemName) {
  const cartItem = cart.find(item => String(item.id) === String(itemId));
  if (!cartItem) return;

  cartItem.maxStock = newStock;

  if (newStock <= 0) {
    mostrarAvisoCarrinho(`O produto "${itemName}" esgotou na unidade ativa e foi removido do carrinho.`);
    cart = cart.filter(item => String(item.id) !== String(itemId));
  } else if (cartItem.quantity > newStock) {
    mostrarAvisoCarrinho(`A quantidade de "${itemName}" foi ajustada para ${newStock} devido ao estoque.`);
    cartItem.quantity = newStock;
  }

  updateCartUI();
}

function mostrarAvisoCarrinho(mensagem) {
  const antigoModal = document.getElementById("socket-alert-modal");
  if (antigoModal) antigoModal.remove();

  const modalHtml = `
    <div id="socket-alert-modal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity duration-300">
      <div class="bg-card border border-amber-500/30 rounded-xl p-6 max-w-sm w-full shadow-2xl transform scale-95 opacity-0 transition-all duration-300">
        <div class="flex items-center gap-3 text-accent mb-4">
          <svg class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <h3 class="text-base font-black text-white uppercase tracking-wider">Aviso de Estoque</h3>
        </div>
        <p class="text-slate-300 text-sm leading-relaxed mb-6">${mensagem}</p>
        <button id="close-socket-modal" class="w-full bg-accent hover:bg-amber-500 text-dark font-black text-xs uppercase py-3 px-4 rounded-lg transition-colors duration-200 tracking-widest">
          OK
        </button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  const modalElement = document.getElementById("socket-alert-modal");
  const contentElement = modalElement.querySelector("div");

  setTimeout(() => {
    contentElement.classList.remove("scale-95", "opacity-0");
    contentElement.classList.add("scale-100", "opacity-100");
  }, 10);

  document.getElementById("close-socket-modal").addEventListener("click", () => {
    contentElement.classList.remove("scale-100", "opacity-100");
    contentElement.classList.add("scale-95", "opacity-0");
    setTimeout(() => modalElement.remove(), 250);
  });
}

/* ──────────────────────────────────────────
   GERENCIAMENTO DE LOJA
────────────────────────────────────────── */

function updateStoreLabel(storeName) {
  const el = document.getElementById("top-store-name");
  if (el) el.innerText = storeName;

  const cartLabel = document.getElementById("cart-store-label");
  if (cartLabel) cartLabel.innerText = `Loja ${storeName}`;
}

function openStoreSelector() {
  const backdrop = document.getElementById("store-selector-backdrop");
  const card = document.getElementById("store-modal-card");
  if (!backdrop) return;
  backdrop.classList.remove("hidden");
  setTimeout(() => {
    backdrop.classList.remove("opacity-0");
    if (card) card.classList.remove("scale-95");
  }, 10);
  updateStoreBadgesUI();
}

function closeStoreSelector() {
  const backdrop = document.getElementById("store-selector-backdrop");
  const card = document.getElementById("store-modal-card");
  if (!backdrop) return;
  backdrop.classList.add("opacity-0");
  if (card) card.classList.add("scale-95");
  setTimeout(() => backdrop.classList.add("hidden"), 300);
}

async function sendAnalyticsEvent(type, location) {
  try {
    const API_BASE_URL = "https://jack-pecas-backend.onrender.com";
    await fetch(`${API_BASE_URL}/api/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, location, isNewUser: false }),
    });
  } catch (err) {
    console.error("Erro ao registrar analytics:", err);
  }
}

function selectStore(storeName) {
  if (cart.length > 0 && activeStore && activeStore !== storeName) {
    const ok = confirm(
      `Ao mudar para ${storeName}, o carrinho atual (${activeStore}) será esvaziado. Deseja continuar?`,
    );
    if (!ok) return;
    cart = [];
  }

  activeStore = storeName;
  localStorage.setItem("jack_pecas_preferred_store", storeName);
  updateStoreBadgesUI();
  updateStoreLabel(storeName);
  closeStoreSelector();
  renderCategoriesDrawer();
  render();
  updateCartUI();

  let locationKey = "sao_roque";
  if (storeName === "Cotia") locationKey = "cotia";
  if (storeName === "Ibiúna") locationKey = "ibiuna";
  sendAnalyticsEvent("select_store", locationKey);
}

function updateStoreBadgesUI() {
  const badges = document.querySelectorAll(".store-badge");
  badges.forEach((badge) => {
    const storeName = badge.getAttribute("data-store");
    if (activeStore === storeName) {
      badge.textContent = "Selecionado";
      badge.className = "store-badge text-[9px] bg-[#FFC107] text-[#0a0f1a] font-black px-2 py-1 rounded-md transition-colors border border-[#FFC107]";
    } else {
      badge.textContent = "Selecionar";
      badge.className = "store-badge text-[9px] bg-white text-[#0a0f1a] group-hover:bg-[#FFC107] group-hover:text-[#0a0f1a] font-black px-2 py-1 rounded-md transition-colors border border-white";
    }
  });
}

/* ──────────────────────────────────────────
   ORDENAÇÃO
────────────────────────────────────────── */

function updateSort(value) {
  currentSort = currentSort === value ? "default" : value;
  currentPage = 1;
  render();
}

function updateSortButtons() {
  const activeClasses = ["bg-cor-azul-escuro", "text-white", "border-white", "shadow-md", "hover:bg-blue-900"];
  const inactiveClasses = [
    "bg-white",
    "text-[#0a0f1a]",
    "border-gray-300",
    "shadow-sm",
    "hover:bg-cor-azul-escuro",
    "hover:text-white",
    "hover:border-cor-azul-escuro",
    "hover:shadow-md",
  ];
  const buttons = [
    { id: "sort-btn-asc", value: "price-asc" },
    { id: "sort-btn-desc", value: "price-desc" },
  ];

  buttons.forEach(({ id, value }) => {
    const button = document.getElementById(id);
    if (!button) return;

    const isActive = currentSort === value;
    button.classList.remove(...(isActive ? inactiveClasses : activeClasses));
    button.classList.add(...(isActive ? activeClasses : inactiveClasses));
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function applySort(list) {
  const getProductTotalStock = (p) => {
    if (p.hasVariations && p.variations) {
      return p.variations.reduce((acc, v) => acc + getVariationStock(v), 0);
    }
    return getProductStock(p);
  };

  let inStock = list.filter(p => getProductTotalStock(p) > 0);
  let outOfStock = list.filter(p => getProductTotalStock(p) <= 0);

  const sortByCriteria = (a, b) => {
    const getMinPrice = (prod) => {
      if (prod.hasVariations && prod.variations?.length > 0) {
        return Math.min(...prod.variations.map(v => {
          const promoInfo = getPromotionalInfo(prod._id || prod.id, v.blingId, v.price || prod.price || 0);
          return promoInfo ? promoInfo.promoPrice : (v.price || prod.price || 0);
        }));
      }
      const promoInfo = getPromotionalInfo(prod._id || prod.id, null, prod.price || 0);
      return promoInfo ? promoInfo.promoPrice : (prod.price || 0);
    };
    
    if (currentSort === 'price-asc') return getMinPrice(a) - getMinPrice(b);
    if (currentSort === 'price-desc') return getMinPrice(b) - getMinPrice(a);
    return 0;
  };

  if (currentSort !== 'default') {
    inStock.sort(sortByCriteria);
    outOfStock.sort(sortByCriteria);
  }

  return [...inStock, ...outOfStock];
}

/* ──────────────────────────────────────────
   NAVEGAÇÃO E FILTROS
────────────────────────────────────────── */

function resetAll() {
  document.getElementById("public-search").value = "";
  activePromoId = null;
  changeView("HOME");
}

function renderCategoriesDrawer() {
  const nav = document.getElementById("categories-list");
  if (!nav) return;

  const isHomeActive = currentView === "HOME" || (!activeCat && !activePromoId);
  const isActive = "border-amber-400 bg-amber-50 text-[#0a0f1a]";
  const isInactive = "border-gray-200 bg-white text-[#0a0f1a] hover:bg-gray-50";
  const categoryList = Array.isArray(categories) ? categories : [];

  let html = `<button type="button" data-view-home="true" class="w-full text-left px-4 py-3 rounded-xl border text-xs uppercase font-bold transition-all active:scale-[0.98] ${isHomeActive ? isActive : isInactive}">Tudo</button>`;

  categoryList.forEach((cat, index) => {
    const name = typeof cat === "object" ? cat.name || cat.categoria || "" : cat;
    if (!name) return;

    const categoryName = String(name);
    const isActiveCategory = activeCat && activeCat.trim().toLowerCase() === categoryName.trim().toLowerCase();
    const isExpanded = Boolean(isActiveCategory);
    const panelId = `category-subcategories-${index}`;
    const subcategories = Array.isArray(cat.subcategories) ? cat.subcategories : [];
    const subcategoryButtons = subcategories.map((subcategory) => {
      const subcategoryName = typeof subcategory === "object"
        ? subcategory.name || subcategory.categoria || ""
        : subcategory;
      if (!subcategoryName) return "";

      const label = String(subcategoryName);
      const isActiveSubcategory = isActiveCategory && activeSub && activeSub.toLowerCase() === label.toLowerCase();
      return `<button type="button" data-view-subcategory="${escapeHTML(label)}" class="flex w-full items-center justify-between border-b border-gray-200 px-3 py-3 text-left text-xs font-medium transition-colors ${isActiveSubcategory ? "bg-amber-50 text-[#0a0f1a]" : "text-gray-700 hover:bg-gray-100"}"><span>${escapeHTML(label)}</span><svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" /></svg></button>`;
    }).join("");

    html += `
      <section data-category-group="${escapeHTML(categoryName)}" class="overflow-hidden rounded-xl border ${isActiveCategory ? "border-amber-300" : "border-gray-200"}">
        <div class="p-1">
          <button type="button" data-category-toggle aria-expanded="${isExpanded}" aria-controls="${panelId}" class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-xs font-black uppercase text-[#0a0f1a] transition-colors hover:bg-gray-50">
            <span class="min-w-0 flex-1">${escapeHTML(categoryName)}</span>
            <svg data-category-chevron class="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-300 ${isExpanded ? "rotate-90" : ""}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
        <div id="${panelId}" data-category-content class="grid transition-[grid-template-rows] duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}">
          <div class="min-h-0 overflow-hidden bg-gray-50/50">
            <div class="border-y border-gray-200 px-3">
              ${subcategoryButtons}
              <button type="button" data-view-category class="flex w-full items-center justify-between border-b border-gray-200 px-3 py-3 text-left text-xs font-bold text-amber-700 transition-colors hover:bg-amber-50">
                <span>Ver tudo</span>
                <svg class="h-3.5 w-3.5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" /></svg>
              </button>
            </div>
          </div>
        </div>
      </section>`;
  });

  nav.innerHTML = html;
  nav.querySelector("[data-view-home]").addEventListener("click", resetAll);
  nav.querySelectorAll("[data-category-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const isExpanded = button.getAttribute("aria-expanded") === "true";
      const content = document.getElementById(button.getAttribute("aria-controls"));
      const group = button.closest("[data-category-group]");
      const chevron = button.querySelector("[data-category-chevron]");

      button.setAttribute("aria-expanded", String(!isExpanded));
      content?.classList.toggle("grid-rows-[1fr]", !isExpanded);
      content?.classList.toggle("grid-rows-[0fr]", isExpanded);
      group?.classList.toggle("border-amber-300", !isExpanded);
      group?.classList.toggle("border-gray-200", isExpanded);
      chevron?.classList.toggle("rotate-90", !isExpanded);
    });
  });
  nav.querySelectorAll("[data-view-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.closest("[data-category-group]")?.dataset.categoryGroup;
      if (category) changeView("CATEGORY", category);
    });
  });
  nav.querySelectorAll("[data-view-subcategory]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.closest("[data-category-group]")?.dataset.categoryGroup;
      if (category) changeView("SUBCATEGORY", category, button.dataset.viewSubcategory);
    });
  });
}

function toggleCategoriesPanel() {
  const panel = document.getElementById("categories-panel");
  const backdrop = document.getElementById("categories-backdrop");
  const menuButton = document.querySelector('[aria-controls="categories-panel"]');
  if (!panel) return;

  const isOpen = !panel.classList.contains("-translate-x-full");

  if (isOpen) {
    panel.classList.add("-translate-x-full");
    panel.setAttribute("aria-hidden", "true");
    if (menuButton) menuButton.setAttribute("aria-expanded", "false");
    if (backdrop) {
      backdrop.classList.add("opacity-0");
      setTimeout(() => backdrop.classList.add("hidden"), 300);
    }
    return;
  }

  renderCategoriesDrawer();
  if (backdrop) {
    backdrop.classList.remove("hidden");
    setTimeout(() => backdrop.classList.remove("opacity-0"), 10);
  }
  panel.classList.remove("-translate-x-full");
  panel.setAttribute("aria-hidden", "false");
  if (menuButton) menuButton.setAttribute("aria-expanded", "true");
}

function changeView(view, cat = null, sub = null, promoId = null) {
  const panel = document.getElementById("categories-panel");
  if (panel && !panel.classList.contains("-translate-x-full")) toggleCategoriesPanel();

  showLocalLoading();
  setTimeout(() => {
    currentView = view;
    activeCat = cat;
    activeSub = sub;
    activePromoId = promoId;
    currentPage = 1;
    render();
    renderCategoriesDrawer();
    if (view !== "HOME") window.scrollTo({ top: 320, behavior: "smooth" });
  }, 50);
}

function handleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    showLocalLoading();
    setTimeout(() => {
      currentPage = 1;
      render();
    }, 100);
  }, 400);
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
   ESTILOS (animações sutis) — injetados uma única vez
────────────────────────────────────────── */

function ensurePromoStyles() {
  if (document.getElementById("promo-styles")) return;
  const style = document.createElement("style");
  style.id = "promo-styles";
  style.textContent = `
    @keyframes promoFrameGlow {
      0%, 100% { box-shadow: 0 4px 20px -2px rgba(3,7,204,0.3); }
      50%      { box-shadow: 0 6px 30px 0px rgba(3,7,204,0.45); }
    }
    @keyframes flashFrameGlow {
      0%, 100% { box-shadow: 0 4px 20px -2px rgba(249,115,22,0.3); }
      50%      { box-shadow: 0 6px 30px 0px rgba(249,115,22,0.45); }
    }
    .promo-frame-flash { animation: promoFrameGlow 3s ease-in-out infinite; }
    .flash-frame-glow { animation: flashFrameGlow 3s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) {
      .promo-frame-flash, .flash-frame-glow { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

/* ──────────────────────────────────────────
   CONTADOR DA OFERTA RELÂMPAGO
────────────────────────────────────────── */

function renderCountdownHTML(endDateIso) {
  const box = (unit, label) => `
    <div class="flex flex-col items-center">
      <div class="min-w-[2.6rem] md:min-w-[3rem] text-center bg-orange-950 border border-orange-400/40 rounded-xl px-2 py-1.5 shadow-inner">
        <span data-cd="${unit}" class="font-mono font-black text-lg md:text-xl text-orange-300 tabular-nums leading-none">00</span>
      </div>
      <span class="mt-1 text-[8px] font-black uppercase tracking-widest text-orange-200">${label}</span>
    </div>`;
  const sep = `<span class="text-orange-300 font-black text-lg mt-1 animate-pulse">:</span>`;

  return `
    <div class="flex flex-col items-start md:items-end gap-1.5 shrink-0">
      <span class="text-[9px] font-black text-orange-200 uppercase tracking-[0.2em]">Encerra em</span>
      <div data-countdown-end="${escapeHTML(endDateIso)}" class="flex items-start gap-1">
        ${box("h", "horas")}${sep}${box("m", "min")}${sep}${box("s", "seg")}
      </div>
    </div>`;
}

function startFlashCountdown() {
  if (flashCountdownInterval) {
    clearInterval(flashCountdownInterval);
    flashCountdownInterval = null;
  }

  const tick = () => {
    const boxes = document.querySelectorAll("[data-countdown-end]");
    if (!boxes.length) {
      clearInterval(flashCountdownInterval);
      flashCountdownInterval = null;
      return;
    }

    let expired = false;
    boxes.forEach((box) => {
      const diff = new Date(box.dataset.countdownEnd).getTime() - Date.now();
      if (diff <= 0) expired = true;
      const total = Math.max(0, Math.floor(diff / 1000) || 0);
      const parts = {
        h: Math.floor(total / 3600),
        m: Math.floor((total % 3600) / 60),
        s: total % 60,
      };
      Object.entries(parts).forEach(([unit, val]) => {
        const el = box.querySelector(`[data-cd="${unit}"]`);
        if (el) el.textContent = String(val).padStart(2, "0");
      });
    });

    if (expired) {
      clearInterval(flashCountdownInterval);
      flashCountdownInterval = null;
      pruneExpiredPromotions();
      render();
    }
  };

  tick();
  if (document.querySelector("[data-countdown-end]")) {
    flashCountdownInterval = setInterval(tick, 1000);
  }
}

/* ──────────────────────────────────────────
   MOLDURA / CABEÇALHO SEPARADOS (PROMOÇÃO vs OFERTA RELÂMPAGO)
────────────────────────────────────────── */

function formatPromoEnd(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

function renderPromoFrame(promo, bodyHTML, footerHTML = "") {
  ensurePromoStyles();

  const isFlash = promo.type === "flash";
  const maxPct = getPromoMaxDiscount(promo);
  const endLabel = formatPromoEnd(promo.endDate);
  
  const title = isFlash ? "Oferta Relâmpago" : "Promoção Jack";

  if (isFlash) {
    // ── ESTILO OFERTA RELÂMPAGO (Laranja) ──
    const frameCls = "p-0.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 flash-frame-glow shadow-xl";
    const headerCls = "bg-orange-600 border-b border-orange-700/60";
    const bodyBgCls = "bg-orange-50/90";

    const pctChip = maxPct > 0
      ? `<span class="inline-flex items-center text-xs md:text-sm font-black uppercase tracking-wider px-3.5 py-1.5 rounded-lg text-orange-700 bg-white border border-orange-300 shadow-md">Até ${maxPct}% OFF</span>`
      : "";

    const rightSide = promo.endDate ? renderCountdownHTML(promo.endDate) : "";

    return `
      <section class="promo-preview-scope rounded-2xl overflow-hidden ${frameCls}">
        <div>
          <div class="relative px-5 py-4 ${headerCls}">
            <div class="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div class="flex flex-col min-w-0">
                <div class="flex flex-wrap items-center gap-3">
                  <h3 class="text-xl md:text-2xl font-black text-white uppercase tracking-tight leading-tight break-words">${title}</h3>
                  ${pctChip}
                </div>
                <p class="text-[11px] md:text-xs font-bold text-orange-100 mt-1">Descontos especiais por tempo limitado</p>
              </div>
              ${rightSide}
            </div>
          </div>
          <div class="p-3 md:p-6 ${bodyBgCls}">
            ${bodyHTML}
            ${footerHTML}
          </div>
        </div>
      </section>`;
  } else {
    // ── ESTILO PROMOÇÃO JACK (Azul) ──
    const frameCls = "p-0.5 bg-[rgb(3,7,204)] shadow-lg border border-blue-600/30";
    const headerCls = "bg-[rgb(3,7,204)] border-b border-blue-800/60";
    const bodyBgCls = "bg-blue-50/60";

    const pctChip = maxPct > 0
      ? `<span class="inline-flex items-center text-xs md:text-sm font-black uppercase tracking-wider px-3.5 py-1.5 rounded-lg text-[rgb(3,7,204)] bg-white border border-blue-200 shadow-sm">Até ${maxPct}% OFF</span>`
      : "";

    const subtitle = endLabel ? `Ofertas válidas até ${endLabel}` : "Condições especiais enquanto durar o estoque";

    return `
      <section class="promo-preview-scope rounded-2xl overflow-hidden ${frameCls}">
        <div>
          <div class="relative px-5 py-4 ${headerCls}">
            <div class="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div class="flex flex-col min-w-0">
                <div class="flex flex-wrap items-center gap-3">
                  <h3 class="text-xl md:text-2xl font-black text-white uppercase tracking-tight leading-tight break-words">${title}</h3>
                  ${pctChip}
                </div>
                <p class="text-[11px] md:text-xs font-bold text-blue-200 mt-1">${subtitle}</p>
              </div>
            </div>
          </div>
          <div class="p-3 md:p-6 ${bodyBgCls}">
            ${bodyHTML}
            ${footerHTML}
          </div>
        </div>
      </section>`;
  }
}

/* ──────────────────────────────────────────
   RENDER DA SEÇÃO DE PROMOÇÕES NO TOPO DA HOME
────────────────────────────────────────── */

function renderPromotionsHeaderSection(isMobile) {
  if (!activePromotions || activePromotions.length === 0) return "";

  const limit = isMobile ? 6 : 8;

  return activePromotions
    .map((promo) => {
      if (!isPromoLive(promo)) return "";

      const promoProducts = getPromoProducts(promo);
      if (promoProducts.length === 0) return "";

      const ordered = [...promoProducts].sort(
        (a, b) => (getTotalStock(a) > 0 ? 0 : 1) - (getTotalStock(b) > 0 ? 0 : 1)
      );

      const hasMore = ordered.length > limit;
      const products = ordered.slice(0, limit);
      const isFlash = promo.type === "flash";

      // Botão "Ver todos os produtos..." com cor baseada no design respectivo
      const btnCls = isFlash
        ? "bg-orange-600 hover:bg-orange-700 text-white font-black shadow-md border border-orange-500"
        : "bg-[rgb(3,7,204)] hover:bg-blue-800 text-white font-black shadow-md border border-blue-500";

      const footer = `<div class="mt-5 flex justify-center">
           <button onclick="changeView('PROMOTION', null, null, '${getPromoId(promo)}')"
             class="${btnCls} text-xs uppercase tracking-widest px-8 py-3 rounded-xl transition-all active:scale-95 flex items-center gap-2">
             <span>Ver todos os produtos</span>
             <span class="opacity-90">(${ordered.length})</span>
             <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
           </button>
         </div>`;

      return `<div class="animate-in mb-10">${renderPromoFrame(
        promo,
        renderProductColumns(products, promo),
        footer
      )}</div>`;
    })
    .join("");
}

/* ──────────────────────────────────────────
   RENDER PRINCIPAL
────────────────────────────────────────── */

function render() {
  const container = document.getElementById("catalog-content");
  const header = document.getElementById("view-header");
  const footer = document.getElementById("catalog-footer");
  const searchInput = document.getElementById("public-search");

  updateSortButtons();
  if (!container || !activeStore) return;

  pruneExpiredPromotions();

  const isMobile = window.innerWidth < 768;
  const searchRaw = searchInput ? searchInput.value.toLowerCase().trim() : "";

  let htmlOutput = "";
  footer.innerHTML = "";

  const isPromoView = currentView === "PROMOTION" && !!activePromoId;
  const promoObj = isPromoView ? findPromoById(activePromoId) : null;
  const promoProductIds = promoObj
    ? new Set((promoObj.items || []).map((i) => String(i.productId)))
    : null;

  let filtered = allProducts.filter((p) => {
    let matchesSearch = true;
    if (searchRaw) {
      const keywords = searchRaw.split(/\s+/);
      matchesSearch = keywords.every((word) => {
        const s = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|\\s|[\\/\\-])(${s})($|\\s|[\\/\\-])`, "i").test(p.name);
      });
    }

    if (isPromoView) {
      if (!promoProductIds || !promoProductIds.has(String(p._id || p.id))) return false;
    }

    const matchesCat = activeCat ? p.category === activeCat : true;
    const matchesSub = activeSub ? p.subcategory === activeSub : true;
    return matchesSearch && matchesCat && matchesSub;
  });

  filtered = applySort(filtered);

  const isFiltering = searchRaw.length > 0;

  const clampPage = (totalPages) => {
    currentPage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
  };

  if (isPromoView) {
    header.classList.remove("hidden");
    const titleEl = document.getElementById("active-title");
    if (titleEl) {
      titleEl.innerText = promoObj
        ? promoObj.type === "flash" ? "Oferta Relâmpago" : "Promoção Jack"
        : "Oferta Especial";
    }

    if (!promoObj) {
      htmlOutput = `
        <div class="py-20 text-center w-full space-y-4">
          <p class="text-gray-500 font-black uppercase text-xs">Esta promoção não está mais disponível.</p>
          <button onclick="resetAll()" class="bg-cor-amarelo text-[#0a0f1a] font-black text-[10px] uppercase tracking-widest px-6 py-2.5 rounded-xl active:scale-95 transition-all">Voltar ao início</button>
        </div>`;
    } else {
      if (filtered.length === 0) {
        htmlOutput = `<div class="animate-in">${renderPromoFrame(
          promoObj,
          `<p class="py-10 text-center text-gray-600 font-black uppercase text-xs">Nenhum produto desta promoção encontrado.</p>`
        )}</div>`;
      } else {
        const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
        clampPage(totalPages);
        const pageItems = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
        htmlOutput = `<div class="animate-in">${renderPromoFrame(
          promoObj,
          renderProductColumns(pageItems, promoObj)
        )}</div>`;
        renderPager(currentPage, totalPages, filtered.length, footer);
      }
    }
  } else if (currentView === "HOME" && !isFiltering) {
    header.classList.remove("hidden");
    document.getElementById("active-title").innerText = "Catálogo";

    htmlOutput += renderPromotionsHeaderSection(isMobile);

    categories.forEach((cat) => {
      const catProducts = filtered.filter((p) => p.category === cat.name);
      if (catProducts.length > 0) {
        htmlOutput += createSectionHTML(
          cat.name,
          catProducts.slice(0, isMobile ? 6 : 8),
          "CATEGORY",
          cat.name
        );
      }
    });
  } else if (currentView === "CATEGORY" && !isFiltering) {
    header.classList.remove("hidden");
    document.getElementById("active-title").innerText = activeCat;

    const catData = categories.find((c) => c.name === activeCat);

    catData?.subcategories.forEach((sub) => {
      const products = filtered.filter(
        (p) => p.subcategory && p.subcategory.trim().toLowerCase() === sub.trim().toLowerCase()
      );
      if (products.length > 0) {
        htmlOutput += createSectionHTML(
          `${sub}`,
          products.slice(0, isMobile ? 6 : 8),
          "SUBCATEGORY",
          activeCat,
          sub
        );
      }
    });
  } else {
    header.classList.remove("hidden");
    document.getElementById("active-title").innerText = activeSub
      ? `${activeCat} > ${activeSub}`
      : activeCat || "Busca";

    if (filtered.length === 0) {
      htmlOutput = `<div class="py-20 text-center w-full"><p class="text-gray-500 font-black uppercase text-xs">Sem resultados para esta unidade.</p></div>`;
    } else {
      const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
      clampPage(totalPages);
      const pageItems = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
      htmlOutput = `<div class="animate-in">${renderProductColumns(pageItems)}</div>`;
      renderPager(currentPage, totalPages, filtered.length, footer);
    }
  }

  container.innerHTML = htmlOutput;
  startFlashCountdown();
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

function renderDiscountTag(label, promoType, size = "md") {
  const isFlash = promoType === "flash";
  if (size === "lg") {
    const color = isFlash
      ? "bg-orange-600 text-white font-black text-sm md:text-base px-3 py-1.5 shadow-md border border-orange-400"
      : "bg-[rgb(3,7,204)] text-white font-black text-sm md:text-base px-3 py-1.5 shadow-md border border-blue-600";
    return `<span class="${color} rounded-lg leading-none whitespace-nowrap uppercase">${label}</span>`;
  } else {
    const sizeCls = size === "sm" ? "text-[9px] px-2 py-1" : "text-[10px] px-2 py-1";
    const color = isFlash
      ? "bg-orange-600 text-white font-black"
      : "bg-[rgb(3,7,204)] text-white font-black";
    return `<span class="${color} ${sizeCls} rounded-md leading-none whitespace-nowrap uppercase">${label}</span>`;
  }
}

function renderPromoChip(promoType) {
  return promoType === "flash"
    ? `<span class="text-[9px] font-black uppercase px-2 py-0.5 rounded text-orange-900 bg-orange-100 border border-orange-300">Relâmpago</span>`
    : `<span class="text-[9px] font-black uppercase px-2 py-0.5 rounded text-blue-900 bg-blue-50 border border-blue-200">Promoção</span>`;
}

function renderPromoPrice(info, size = "lg") {
  const isLg = size === "lg";
  const align = isLg ? "lg:items-end" : "items-end";
  const justify = isLg ? "lg:justify-end" : "justify-end";
  const textColor = info.promoType === "flash" ? "text-orange-600" : "text-blue-700";

  return `
    <div class="flex flex-col ${align}">
      <div class="flex items-center gap-2 flex-wrap ${justify}">
        ${renderDiscountTag(`${info.discountPct}% OFF`, info.promoType, isLg ? "lg" : "sm")}
        <span class="${isLg ? "text-xs" : "text-[10px]"} font-bold text-gray-500 line-through whitespace-nowrap">De: R$ ${formatBRL(info.originalPrice)}</span>
      </div>
      <p class="${isLg ? "text-2xl md:text-3xl" : "text-lg"} font-black ${textColor} font-mono tracking-tight leading-none mt-1.5">
        <span class="${isLg ? "text-xs md:text-sm" : "text-[10px]"} font-bold mr-0.5">R$</span>${formatBRL(info.promoPrice)}
      </p>
    </div>`;
}

function renderCard(p, targetPromo = null) {
  ensurePromoStyles();

  const hasVars = p.hasVariations && p.variations?.length > 0;
  const lojaAtual = activeStore || "Geral";
  const productId = p._id || p.id;
  const isFlashPromo = targetPromo?.type === "flash";
  const isStandardPromo = targetPromo && !isFlashPromo;

  // ── PRODUTO SIMPLES ──
  if (!hasVars) {
    const currentStock = getProductStock(p);
    const isOutOfStock = currentStock <= 0;
    const itemId = productId;
    const alreadyInCart = isInCart(itemId);

    const promoInfo = getPromotionalInfo(productId, null, p.price, targetPromo);
    const finalPrice = promoInfo ? promoInfo.promoPrice : p.price;
    const isFlashCardPromo = promoInfo?.promoType === "flash" || isFlashPromo;
    const isStandardCardPromo = (promoInfo && !isFlashCardPromo) || isStandardPromo;

    const borderCls = promoInfo && !isOutOfStock
      ? (isFlashCardPromo ? "border-orange-400/80" : "border-blue-500/50")
      : "border-gray-200";
    const hoverBorderCls = promoInfo && !isOutOfStock
      ? (isFlashCardPromo ? "hover:border-orange-500" : "hover:border-blue-600")
      : "hover:border-gray-300";

    let addBtn = "";
    if (isOutOfStock) {
      addBtn = `<button disabled class="bg-gray-100 text-gray-400 font-bold text-[10px] uppercase tracking-wider px-5 py-3 rounded-xl cursor-not-allowed border border-gray-200">ESGOTADO</button>`;
    } else if (alreadyInCart) {
      addBtn = `<button disabled class="bg-[#008b00] text-white border border-emerald-800/50 font-black text-[10px] uppercase tracking-wider px-5 py-3 rounded-xl flex items-center gap-1.5">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                        Adicionado
                      </button>`;
    } else {
      // Cor do botão conforme solicitação: Azul para Promoção, Laranja para Oferta Relâmpago, Amarelo para o restante
      let btnStyle = "bg-cor-amarelo hover:bg-yellow-600 text-[#0a0f1a] border border-gray-300";
      if (isFlashCardPromo) {
        btnStyle = "bg-orange-600 hover:bg-orange-700 text-white border-orange-500";
      } else if (isStandardCardPromo) {
        btnStyle = "bg-[rgb(3,7,204)] hover:bg-blue-800 text-white border-blue-600";
      }
      
      addBtn = `<button onclick="addToCart('${itemId}','${encodeURIComponent(p.name)}',${finalPrice},'${lojaAtual}', ${currentStock})"
                        class="${btnStyle} font-black text-[10px] md:text-xs uppercase tracking-wider px-5 py-3 rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-lg">
                        Adicionar
                      </button>`;
    }

    const priceBlock = promoInfo
      ? renderPromoPrice(promoInfo, "lg")
      : `
        <div class="flex flex-col lg:items-end">
            <span class="text-[9px] font-black text-gray-500 uppercase tracking-widest">Preço à vista</span>
            <p class="text-2xl md:text-3xl font-black ${isOutOfStock ? "text-gray-400" : "text-cor-verde font-mono"} tracking-tight leading-none mt-1">
                <span class="text-xs md:text-sm font-bold mr-0.5">R$</span>${formatBRL(p.price)}
            </p>
        </div>`;

    return `
            <div class="border ${borderCls} bg-white rounded-2xl shadow-sm hover:shadow-md ${hoverBorderCls} transition-all duration-300 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5 w-full relative ${isOutOfStock ? "opacity-50 grayscale-[30%] pointer-events-none" : ""}">
                ${isOutOfStock ? `<div class="absolute top-3 right-3 bg-[#D32F2F] text-white font-black uppercase text-[8px] tracking-widest px-2.5 py-1 rounded-lg">ESGOTADO</div>` : ""}
                <div class="flex-grow space-y-2.5 lg:max-w-[65%]">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-[9px] font-black text-cor-azul bg-cor-amarelo px-2 py-0.5 rounded-md uppercase tracking-wider">${p.category || "Peça"}</span>
                        ${p.subcategory ? `<span class="text-[9px] font-bold text-gray-500 uppercase tracking-wide">/ ${p.subcategory}</span>` : ""}
                        ${promoInfo ? renderPromoChip(promoInfo.promoType) : ""}
                    </div>
                    <h4 class="text-sm md:text-base font-extrabold text-[#0a0f1a] leading-snug tracking-tight">${p.name}</h4>
                    <div class="flex flex-wrap gap-1.5 pt-0.5">
                        ${
                          p.attributes
                              ? Object.entries(p.attributes)
                                  .map(([k, v]) => {
                                      if (!v) return "";
                                      const valName = (typeof v === 'object' && v !== null) ? (v.name || '') : v;
                                      const { className, style } = getTagProps(v);
                                      return `<span class="px-2 py-0.5 rounded-md text-[8px] md:text-[9px] font-bold uppercase tracking-wide ${className}" style="${style}">${valName}</span>`;
                                  })
                                  .join("")
                              : ""
                      }
                    </div>
                </div>
                <div class="flex flex-row items-center justify-between lg:flex-col lg:items-end lg:justify-center pt-4 lg:pt-0 border-t border-gray-100 lg:border-t-0 shrink-0 lg:pl-6 lg:min-w-[200px] gap-4">
                    ${priceBlock}
                    ${addBtn}
                </div>
            </div>`;
  }

  // ── PRODUTO COM VARIAÇÕES ──
  const totalStock = getTotalStock(p);
  const isParentOutOfStock = totalStock <= 0;

  const parentInfo = getProductParentPromoInfo(p, targetPromo);
  const parentHasPromo = !!parentInfo?.hasPromo;
  const isFlash = targetPromo?.type === "flash" || parentInfo?.promoType === "flash";
  const isStandard =
    (targetPromo && targetPromo.type !== "flash") ||
    (parentInfo?.hasPromo && parentInfo?.promoType !== "flash");
  const arrowClasses = isFlash
    ? "bg-orange-600 text-white border-orange-500 hover:bg-orange-700 hover:border-orange-600"
    : isStandard
      ? "bg-blue-600 text-white border-blue-700 hover:bg-blue-800 hover:border-blue-800"
      : "text-[#0a0f1a] bg-cor-amarelo border-amber-300 hover:bg-yellow-500 hover:border-yellow-500";

  const rows = p.variations.map((v) => {
    const basePrice = v.price || p.price;
    return {
      v,
      basePrice,
      stock: getVariationStock(v),
      promo: getPromotionalInfo(productId, v.blingId, basePrice, targetPromo),
    };
  });

  const inStockPromoRows = rows.filter((row) => row.stock > 0 && row.promo);
  const badgeDiscounts = inStockPromoRows.map((row) => row.promo.discountPct);
  const badgeDiscount = badgeDiscounts.length
    ? Math.max(...badgeDiscounts) === Math.min(...badgeDiscounts)
      ? `${badgeDiscounts[0]}% OFF`
      : `Até ${Math.max(...badgeDiscounts)}% OFF`
    : "";
  const badgePromoType = inStockPromoRows.some((row) => row.promo.promoType === "flash")
    ? "flash"
    : "standard";

  const sortedRows = [...rows].sort((a, b) => {
    if (a.stock > 0 !== b.stock > 0) return a.stock > 0 ? -1 : 1;
    return (b.promo ? 1 : 0) - (a.promo ? 1 : 0);
  });

  const variationsHTML = sortedRows
    .map(({ v, basePrice, stock: vStock, promo: vPromoInfo }) => {
      const isVOOS = vStock <= 0;
      const varId = `${productId}-${v.blingId}`;
      const alreadyInCart = isInCart(varId);
      const varFullName = `${p.name} (${v.type}: ${v.value})`;
      const vStyleClasses = isVOOS
        ? "opacity-40 grayscale-[40%] bg-gray-50 pointer-events-none"
        : "hover:bg-gray-50";

      const vFinalPrice = vPromoInfo ? vPromoInfo.promoPrice : basePrice;

      let varBtn = "";
      if (isVOOS) {
        varBtn = `<span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-2.5">ESGOTADO</span>`;
      } else if (alreadyInCart) {
        varBtn = `<button disabled class="bg-[#008b00] text-white border border-[#09af00] font-black text-[9px] uppercase tracking-wider px-4 py-2.5 rounded-lg flex items-center gap-1.5">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                        Adicionado
                      </button>`;
      } else {
        let btnVarStyle = "bg-cor-amarelo hover:bg-yellow-600 text-[#0a0f1a] border border-gray-300";
        if (isFlash) {
          btnVarStyle = "bg-orange-600 hover:bg-orange-700 text-white border-orange-500";
        } else if (isStandard) {
          btnVarStyle = "bg-[rgb(3,7,204)] hover:bg-blue-800 text-white border-blue-600";
        }

        varBtn = `<button onclick="addToCart('${varId}','${encodeURIComponent(varFullName)}',${vFinalPrice},'${lojaAtual}', ${vStock})"
                        class="${btnVarStyle} font-black text-[9px] uppercase tracking-wider px-4 py-2.5 rounded-lg transition-all active:scale-95 border">
                        Adicionar
                      </button>`;
      }

      const varPriceBlock = vPromoInfo
        ? renderPromoPrice(vPromoInfo, "sm")
        : `
          <p class="text-lg font-black ${isVOOS ? "text-gray-400" : "text-cor-verde font-mono"}">
              <span class="text-[10px] font-bold mr-0.5">R$</span>${formatBRL(basePrice)}
          </p>`;

      const borderVar = vPromoInfo && !isVOOS ? (isFlash ? "border-orange-300 bg-white" : "border-blue-300 bg-white") : "border-gray-200 bg-white";

      return `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border ${borderVar} transition-all ${vStyleClasses}">
                <div class="flex flex-wrap items-center gap-3">
                    <div class="bg-gray-900 text-[10px] font-black text-white px-2.5 py-1 rounded-md uppercase">
                        ${v.type}: <span class="text-orange-400">${v.value}</span>
                    </div>
                    ${isVOOS ? `<span class="text-[9px] font-extrabold uppercase text-white tracking-wider bg-red-600 px-2 py-0.5 rounded-md">ESGOTADO</span>` : ""}
                </div>
                <div class="flex items-center justify-between sm:justify-end gap-6 mt-3 sm:mt-0 pt-3 sm:pt-0 border-t border-gray-100 sm:border-t-0">
                    ${varPriceBlock}
                    ${varBtn}
                </div>
            </div>`;
    })
    .join("");

  const parentBorder = parentHasPromo && !isParentOutOfStock
    ? (isFlash ? "border-orange-400/80" : "border-blue-500/50")
    : "border-gray-200";
  const parentHoverBorder = parentHasPromo && !isParentOutOfStock
    ? (isFlash ? "hover:border-orange-500" : "hover:border-blue-600")
    : "hover:border-gray-300";

  return `
        <div class="self-start w-full border ${parentBorder} bg-white rounded-2xl shadow-sm hover:shadow-md ${parentHoverBorder} transition-all duration-300 overflow-hidden relative ${isParentOutOfStock ? "opacity-50" : ""}">
            ${badgeDiscount ? `<div class="variation-promo-badge absolute top-0 right-0 z-10 overflow-hidden rounded-tr-2xl variation-promo-badge--${badgePromoType}">${badgeDiscount}</div>` : ""}
            <div class="p-5 flex flex-col gap-4 w-full relative">
                ${isParentOutOfStock ? `<div class="absolute top-3 right-3 bg-red-600 text-white font-black uppercase text-[8px] tracking-widest px-2.5 py-1 rounded-lg">ESGOTADO</div>` : ""}
                <div class="w-full space-y-2.5">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-[9px] font-black text-cor-azul bg-cor-amarelo px-2 py-0.5 rounded-md uppercase tracking-wider">${p.category || "Peça"}</span>
                        <span class="text-[9px] font-black text-white bg-gray-900 px-2 py-0.5 rounded-md uppercase tracking-wider">Possui Variações</span>
                        ${parentHasPromo ? renderPromoChip(parentInfo.promoType) : ""}
                    </div>
                    <h4 class="text-sm md:text-base font-extrabold text-[#0a0f1a] leading-snug tracking-tight transition-colors">${p.name}</h4>
                    <div class="flex flex-wrap gap-1.5 pt-0.5">
                        ${
                          p.attributes
                              ? Object.entries(p.attributes)
                                  .map(([k, v]) => {
                                      if (!v) return "";
                                      const valName = (typeof v === 'object' && v !== null) ? (v.name || '') : v;
                                      const { className, style } = getTagProps(v);
                                      return `<span class="px-2 py-0.5 rounded-md text-[8px] md:text-[9px] font-bold uppercase tracking-wide ${className}" style="${style}">${valName}</span>`;
                                  })
                                  .join("")
                              : ""
                      }
                    </div>
                </div>
                <button type="button" aria-controls="dropdown-${productId}" onclick="toggleDropdown(this, '${productId}')"
                    class="mx-auto relative flex items-center justify-center px-8 sm:px-10 py-2.5 sm:py-3 rounded-xl border ${arrowClasses} font-black text-[10px] sm:text-xs uppercase tracking-wider text-center transition-all duration-200 hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">
                    <span class="leading-snug">SELECIONE A OPÇÃO DESEJADA</span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="absolute right-3.5 h-4 w-4 transform transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
            </div>
            <div id="dropdown-${productId}" class="hidden border-t border-gray-200 bg-gray-50 px-5 pb-5 pt-2">
                <div class="flex flex-col gap-2.5">${variationsHTML}</div>
            </div>
        </div>`;
}

function renderProductColumns(products, targetPromo = null) {
  const columns = [[], []];

  products.forEach((product, index) => {
    columns[index % 2].push(
      `<div class="catalog-product-item" style="--catalog-product-order:${index}">${renderCard(product, targetPromo)}</div>`
    );
  });

  return `
    <div class="catalog-product-columns">
      <div class="catalog-product-column">${columns[0].join("")}</div>
      <div class="catalog-product-column">${columns[1].join("")}</div>
    </div>`;
}

function toggleDropdown(headerEl, productId) {
  const cardWrapper = headerEl.closest(".self-start") || headerEl.parentElement;
  const panel = cardWrapper.querySelector('[id^="dropdown-"]') || headerEl.nextElementSibling;
  const arrowSvg = headerEl.querySelector("svg.transform");

  if (!panel) return;
  if (panel.classList.contains("hidden")) {
    panel.classList.remove("hidden");
    if (arrowSvg) arrowSvg.classList.add("rotate-180");
  } else {
    panel.classList.add("hidden");
    if (arrowSvg) arrowSvg.classList.remove("rotate-180");
  }
}

function createSectionHTML(title, products, targetView, cat, sub = null) {
  return `
        <div class="animate-in mb-10">
            <div class="flex items-center justify-between mb-4 px-1 gap-2">
                <h3 class="text-xs font-black uppercase tracking-[0.3em] text-gray-500">${title}</h3>
                <button onclick="changeView('${targetView}','${cat}','${sub || ""}')" class="text-[9px] bg-cor-azul-escuro hover:bg-[#FFC107] text-white hover:text-[#0a0f1a] font-black border border-accent/20 px-4 py-1.5 rounded-full uppercase transition-all whitespace-nowrap">Ver Tudo</button>
            </div>
            ${renderProductColumns(products)}
        </div>`;
}

function renderPager(current, total, totalItems, footer) {
  const safeTotal = Math.max(1, total);
  const startItem = totalItems === 0 ? 0 : (current - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(current * ITEMS_PER_PAGE, totalItems);

  footer.innerHTML = `
        <div class="flex flex-col items-center gap-4 w-full max-w-xs mx-auto py-4">
            <div class="text-center space-y-1">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                    Exibindo <span class="text-cor-verde">${startItem}-${endItem}</span> de <span class="text-cor-verde">${totalItems}</span> produtos
                </p>
                <div class="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div class="h-full bg-cor-amarelo transition-all duration-500" style="width:${(current / safeTotal) * 100}%"></div>
                </div>
            </div>
            <div class="flex items-center gap-2 bg-cor-amarelo border border-gray-800 p-1.5 rounded-2xl w-full justify-between shadow-lg">
                <button onclick="goToPage(${current - 1})" ${current === 1 ? "disabled" : ""} class="flex-1 flex items-center justify-center py-3 rounded-xl transition-all active:scale-95 disabled:opacity-20 disabled:grayscale">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-[#0a0f1a]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <div class="px-4 border-x border-gray-800">
                    <span class="text-xs font-black text-[#0a0f1a] font-mono">${String(current).padStart(2, "0")}</span>
                    <span class="text-[10px] font-bold text-gray-600 uppercase mx-1">/</span>
                    <span class="text-[10px] font-bold text-[#0a0f1a] uppercase">${String(safeTotal).padStart(2, "0")}</span>
                </div>
                <button onclick="goToPage(${current + 1})" ${current === safeTotal ? "disabled" : ""} class="flex-1 flex items-center justify-center py-3 rounded-xl transition-all active:scale-95 disabled:opacity-20 disabled:grayscale">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-[#0a0f1a]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"/></svg>
                </button>
            </div>
        </div>`;
}

function goToPage(p) {
  currentPage = p;
  render();
  window.scrollTo({ top: 400, behavior: "smooth" });
}

function getTagProps(value) {
    if (value && typeof value === 'object') {
        const c = value.color;
        if (c) {
            if (typeof c.bg === 'string' && c.bg.startsWith('bg-')) {
                return { className: `${c.bg} ${c.text || ''} ${c.border || ''} border`, style: '' };
            }
            return {
                className: 'border',
                style: `background-color: ${c.bg || '#0f172a'}; color: ${c.text || '#ffffff'}; border-color: ${c.border || '#38bdf8'};`
            };
        }
    }

    const valName = (value && typeof value === 'object') ? value.name : value;
    const color = attributeColorMap[valName];

    if (!color) {
        return { className: 'bg-gray-800 text-gray-200 border-gray-700 border', style: '' };
    }

    if (typeof color.bg === 'string' && color.bg.startsWith('bg-')) {
        return { className: `${color.bg} ${color.text || ''} ${color.border || ''} border`, style: '' };
    }

    return {
        className: 'border',
        style: `background-color: ${color.bg || '#0f172a'}; color: ${color.text || '#ffffff'}; border-color: ${color.border || '#38bdf8'};`
    };
}

/* ──────────────────────────────────────────
   CARRINHO
────────────────────────────────────────── */

function toggleCartPanel() {
  const panel = document.getElementById("cart-panel");
  const backdrop = document.getElementById("cart-backdrop");
  if (!panel) return;

  const isOpen = !panel.classList.contains("translate-x-full");

  if (isOpen) {
    panel.classList.add("translate-x-full");
    if (backdrop) {
      backdrop.classList.add("opacity-0");
      setTimeout(() => backdrop.classList.add("hidden"), 300);
    }
  } else {
    if (backdrop) {
      backdrop.classList.remove("hidden");
      setTimeout(() => backdrop.classList.remove("opacity-0"), 10);
    }
    panel.classList.remove("translate-x-full");
  }
}

function addToCart(id, name, price, store, maxStock) {
  const decodedName = decodeURIComponent(name);
  const identity = getCartItemIdentity(id);
  const catalogPrice = identity.variation
    ? Number(identity.variation.price || identity.product.price) || Number(price)
    : identity.variantBlingId
      ? Number(price)
      : Number(identity.product?.price) || Number(price);
  const promoInfo = getPromotionalInfo(
    identity.productId,
    identity.variantBlingId,
    catalogPrice
  );
  const finalPrice = promoInfo ? promoInfo.promoPrice : Number(price);
  const originalPrice = promoInfo ? promoInfo.originalPrice : catalogPrice;
  const existingItem = cart.find((item) => item.id === id && item.store === store);

  if (existingItem) {
    if (existingItem.quantity < maxStock) {
      existingItem.quantity += 1;
      existingItem.stockWarning = null;
      existingItem.price = finalPrice;
      existingItem.originalPrice = originalPrice;
    } else {
      existingItem.stockWarning = `Apenas ${maxStock} unidade(s) em estoque.`;
      const panel = document.getElementById("cart-panel");
      if (panel && panel.classList.contains("translate-x-full")) {
        toggleCartPanel();
      }
      setTimeout(() => {
        const currentItem = cart.find((i) => i.id === id && i.store === store);
        if (currentItem) {
          currentItem.stockWarning = null;
          updateCartUI();
        }
      }, 3000);
    }
  } else {
    if (maxStock > 0) {
      cart.push({
        id,
        name: decodedName,
        price: finalPrice,
        originalPrice,
        store,
        quantity: 1,
        maxStock,
      });
    }
  }

  updateCartUI();
  render();
}

function getCartItemIdentity(itemId) {
  const normalizedId = String(itemId);
  const product = allProducts
    .filter((candidate) => {
      const productId = String(candidate._id || candidate.id);
      return normalizedId === productId || normalizedId.startsWith(`${productId}-`);
    })
    .sort((a, b) => String(b._id || b.id).length - String(a._id || a.id).length)[0];

  if (product) {
    const productId = String(product._id || product.id);
    const variantBlingId = normalizedId === productId
      ? null
      : normalizedId.slice(productId.length + 1);
    const variation = variantBlingId
      ? product.variations?.find((candidate) => String(candidate.blingId) === variantBlingId)
      : null;
    return { productId, variantBlingId, product, variation };
  }

  const [productId, ...variantParts] = normalizedId.split("-");
  return {
    productId,
    variantBlingId: variantParts.length ? variantParts.join("-") : null,
    product: null,
    variation: null,
  };
}

function updateQuantity(id, store, change) {
  const idx = cart.findIndex((item) => item.id === id && item.store === store);
  if (idx === -1) return;

  const novaQuantidade = cart[idx].quantity + change;
  cart[idx].stockWarning = null;

  if (change > 0 && novaQuantidade > cart[idx].maxStock) {
    cart[idx].stockWarning = `Apenas ${cart[idx].maxStock} unidade(s) em estoque.`;
    updateCartUI();

    setTimeout(() => {
      const currentItem = cart.find((i) => i.id === id && i.store === store);
      if (currentItem) {
        currentItem.stockWarning = null;
        updateCartUI();
      }
    }, 3000);
    return;
  }

  cart[idx].quantity = novaQuantidade;
  if (cart[idx].quantity < 1) cart.splice(idx, 1);

  updateCartUI();
  render();
}

function clearCart() {
  cart = [];
  updateCartUI();
  render();
}

function removeFromCart(id, store) {
  cart = cart.filter((item) => !(item.id === id && item.store === store));
  updateCartUI();
  render();
}

function getCartItemPromoInfo(item) {
  const { productId, variantBlingId, product, variation } = getCartItemIdentity(item.id);
  const originalPrice = variation
    ? Number(variation.price || product.price) || Number(item.originalPrice) || item.price
    : variantBlingId
      ? Number(item.originalPrice) || item.price
      : Number(product?.price) || Number(item.originalPrice) || item.price;
  return getPromotionalInfo(productId, variantBlingId, originalPrice);
}

function updateCartUI() {
  const badge = document.getElementById("cart-badge");
  const listContainer = document.getElementById("cart-items-list");
  const totalQtyLabel = document.getElementById("cart-total-qty");
  const totalPriceLabel = document.getElementById("cart-total-price");
  const totalSavingsLabel = document.getElementById("cart-total-savings");

  let totalItems = 0;
  let totalPrice = 0;
  let totalSavings = 0;

  if (cart.length === 0) {
    if (badge) badge.classList.add("hidden");
    if (listContainer) {
      listContainer.innerHTML = `
                <div class="text-center py-16 text-gray-500 font-black uppercase text-xs tracking-wider">
                    Seu carrinho está vazio.
                </div>`;
    }
    if (totalQtyLabel) totalQtyLabel.innerText = "0";
    if (totalPriceLabel) totalPriceLabel.innerText = "R$ 0,00";
    if (totalSavingsLabel) {
      totalSavingsLabel.innerText = "R$ 0,00";
      totalSavingsLabel.parentElement?.classList.add("hidden");
    }
    return;
  }

  const cartItems = cart.map((item) => {
    const promoInfo = getCartItemPromoInfo(item);
    const unitPrice = promoInfo ? promoInfo.promoPrice : item.price;
    const itemSavings = promoInfo
      ? Math.max(0, promoInfo.originalPrice - unitPrice) * item.quantity
      : 0;
    return {
      item,
      promoInfo,
      unitPrice,
      itemSavings,
    };
  });

  cartItems.forEach(({ item, unitPrice, itemSavings }) => {
    totalItems += item.quantity;
    totalPrice += unitPrice * item.quantity;
    totalSavings += itemSavings;
  });

  if (badge) {
    badge.innerText = totalItems;
    badge.classList.remove("hidden");
    badge.classList.add("bump");
    setTimeout(() => badge.classList.remove("bump"), 200);
  }

  if (totalQtyLabel) totalQtyLabel.innerText = totalItems;
  if (totalPriceLabel)
    totalPriceLabel.innerText = totalPrice.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  if (totalSavingsLabel) {
    totalSavingsLabel.innerText = totalSavings.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    totalSavingsLabel.parentElement?.classList.toggle("hidden", totalSavings <= 0);
  }

  if (listContainer) {
    listContainer.innerHTML = cartItems
      .map(({ item, promoInfo, unitPrice, itemSavings }) => {
        const itemTotal = unitPrice * item.quantity;
        const unitPriceHTML = promoInfo
          ? `<div class="flex flex-col items-end gap-1">
                <div class="flex flex-wrap items-center justify-end gap-1.5">
                    <span class="text-[10px] text-gray-400 line-through">De: R$ ${formatBRL(promoInfo.originalPrice)}</span>
                    <span class="rounded-md ${promoInfo.promoType === "flash" ? "bg-orange-600" : "bg-[rgb(3,7,204)]"} px-1.5 py-0.5 text-[9px] font-black text-white">${promoInfo.discountPct}% OFF</span>
                </div>
                <span class="text-xs font-black ${promoInfo.promoType === "flash" ? "text-orange-600" : "text-blue-700"} font-mono">
                    R$ ${formatBRL(unitPrice)}
                </span>
                <span class="text-[10px] font-bold text-emerald-700">
                    Economizando ${itemSavings.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} neste item
                </span>
            </div>`
          : `<span class="text-xs font-black text-cor-azul font-mono shrink-0">
                    ${unitPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>`;
        return `
                <div class="p-4 bg-white border border-gray-800 rounded-xl flex flex-col gap-3">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex-grow">
                            <h5 class="text-xs font-extrabold text-[#0a0f1a] leading-snug">${item.name}</h5>
                            <span class="text-[9px] font-black text-cor-amarelo px-1.5 py-0.5 rounded uppercase mt-1 inline-block tracking-wide">
                                Filial: ${item.store}
                            </span>
                        </div>
                        ${unitPriceHTML}
                    </div>
                    
                    <div class="flex flex-col gap-1 pt-2 border-t border-gray-800/50">
                        <div class="flex items-center justify-between gap-3">
                            <div class="flex items-center gap-2">
                                <div class="flex items-center bg-cor-amarelo border border-gray-800 rounded-lg p-0.5">
                                    <button onclick="updateQuantity('${item.id}','${item.store}',-1)"
                                        class="w-7 h-7 flex items-center justify-center text-[#D32F2F] hover:text-[#B71C1C] rounded-md transition-colors active:scale-90 font-black text-sm">−</button>
                                    <span class="w-8 text-center text-xs font-black font-mono text-white">${item.quantity}</span>
                                    <button onclick="updateQuantity('${item.id}','${item.store}',1)"
                                        class="w-7 h-7 flex items-center justify-center text-[#008b00] hover:text-[#09af00] rounded-md transition-colors active:scale-90 font-black text-sm">+</button>
                                </div>
                                <button onclick="removeFromCart('${item.id}','${item.store}')"
                                    class="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white transition-all active:scale-95 shadow-sm"
                                    title="Remover item do carrinho" aria-label="Remover ${escapeHTML(item.name)} do carrinho">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                            <span class="text-lg font-black text-cor-verde font-mono">
                                ${itemTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                        </div>
                        ${item.stockWarning ? `<span class="text-[9px] font-bold text-rose-500 uppercase tracking-wider mt-1 animate-in">${item.stockWarning}</span>` : ""}
                    </div>
                </div>`;
      })
      .join("");
  }
}

function checkoutCart() {
  if (cart.length === 0) {
    alert("Seu carrinho está vazio!");
    return;
  }

  const phoneNumber = STORE_CONTACTS[activeStore] || STORE_CONTACTS["São Roque"];

  let totalGeral = 0;
  let totalSavings = 0;
  let message = `*NOVO PEDIDO - JACK PEÇAS*\n`;
  message += `*Unidade:* Loja ${activeStore}\n`;
  message += `───────────────────────────\n\n`;

  cart.forEach((item) => {
    const promoInfo = getCartItemPromoInfo(item);
    const unitPrice = promoInfo ? promoInfo.promoPrice : item.price;
    const subtotal = unitPrice * item.quantity;
    const itemSavings = promoInfo
      ? Math.max(0, promoInfo.originalPrice - unitPrice) * item.quantity
      : 0;
    if (promoInfo) totalSavings += itemSavings;
    totalGeral += subtotal;
    message += `*${item.quantity}x* ${item.name}\n`;
    if (promoInfo) {
      message += `De: ${promoInfo.originalPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} | Por: ${unitPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${promoInfo.discountPct}% OFF)\n`;
      message += `Economia neste item: ${itemSavings.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n`;
    } else {
      message += `Preço Unitário: ${unitPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n`;
    }
    message += `Subtotal: *${subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}*\n\n`;
  });

  message += `───────────────────────────\n`;
  if (totalSavings > 0) {
    message += `*DESCONTO TOTAL:* ${totalSavings.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n`;
  }
  message += `*TOTAL A PAGAR:* ${totalGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n\n`;
  message += `Gostaria de verificar disponibilidade e finalizar este pedido.`;

  window.open(
    `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`,
    "_blank",
  );

  cart = [];
  updateCartUI();
  render();
  toggleCartPanel();
}

function getTagStyle(text) {
  if (!text) return "bg-gray-500/10 text-gray-400 border-gray-500/20";
  let hash = 0;
  for (let i = 0; i < text.length; i++)
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  const style = TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
  return `${style.bg} ${style.text} ${style.border}`;
}

window.onload = init;