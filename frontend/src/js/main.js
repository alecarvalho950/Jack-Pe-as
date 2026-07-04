let allProducts = [];
let categories = [];
let searchTimer;
let currentView = "HOME";
let activeCat = null;
let activeSub = null;
let activeFilters = {};
let currentPage = 1;
const ITEMS_PER_PAGE = 20;
let socket;

// Estado Global do Carrinho e Loja Ativa
let cart = [];
let activeStore = null;

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
  {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/20",
  },
  { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
  {
    bg: "bg-indigo-500/10",
    text: "text-indigo-400",
    border: "border-indigo-500/20",
  },
  {
    bg: "bg-orange-500/10",
    text: "text-[#f97800]",
    border: "border-[#f97800]",
  },
  {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    border: "border-purple-500/20",
  },
  { bg: "bg-cyan-500/10", text: "text-[#0094fd]", border: "border-[#0094fd]" },
  { bg: "bg-lime-500/10", text: "text-[#09af00]", border: "border-[#09af00]" },
  {
    bg: "bg-fuchsia-500/10",
    text: "text-fuchsia-400",
    border: "border-fuchsia-500/20",
  },
  { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/20" },
  {
    bg: "bg-violet-500/10",
    text: "text-violet-400",
    border: "border-violet-500/20",
  },
  { bg: "bg-teal-500/10", text: "text-teal-400", border: "border-teal-500/20" },
  { bg: "bg-red-500/10", text: "text-[#D32F2F]", border: "border-[#D32F2F]" },
  { bg: "bg-blue-600/10", text: "text-blue-400", border: "border-blue-600/20" },
  {
    bg: "bg-yellow-500/10",
    text: "text-yellow-300",
    border: "border-yellow-500/20",
  },
  {
    bg: "bg-slate-400/10",
    text: "text-slate-300",
    border: "border-slate-400/20",
  },
  { bg: "bg-green-600/10", text: "text-[#008b00]", border: "border-[#008b00]" },
  { bg: "bg-zinc-400/10", text: "text-zinc-300", border: "border-zinc-400/20" },
  { bg: "bg-[#002cf1]/10", text: "text-[#002cf1]", border: "border-[#002cf1]" },
];

/* ──────────────────────────────────────────
   HELPERS DE ESTOQUE
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

/* ──────────────────────────────────────────
   HELPER: verifica se um produto/variação
   já está no carrinho (para o botão "Adicionado")
────────────────────────────────────────── */
function isInCart(id) {
  return cart.some((item) => item.id === id);
}

/* ──────────────────────────────────────────
   INIT
────────────────────────────────────────── */

async function init() {
  const API_BASE_URL = "https://jack-pecas-backend.onrender.com";
  const overlay = document.getElementById("loading-overlay");

  showLocalLoading();

  try {
    const searchInput = document.getElementById("public-search");
    if (searchInput) searchInput.addEventListener("input", handleSearch);

    const fetchOptions = {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    };

    // 1. Busca inicial dos dados
    const [resCat, resProd] = await Promise.all([
      fetch(`${API_BASE_URL}/api/categories`, fetchOptions),
      fetch(`${API_BASE_URL}/api/products?limit=9999`, fetchOptions),
    ]);

    if (!resCat.ok || !resProd.ok)
      throw new Error("Erro na resposta do servidor");

    categories = await resCat.json();
    const prodData = await resProd.json();
    allProducts = prodData.products || [];

    // 2. CONEXÃO COM O SOCKET.IO
    if (typeof io !== 'undefined') {
      socket = io(API_BASE_URL);

      // Ouvir atualizações de estoque
      socket.on("product_stock_updated", (data) => {
        console.log("⚡ Estoque atualizado via Socket:", data);
        handleSocketStockUpdate(data);
      });

      // Ouvir atualizações ou novos cadastros de produtos (Preço, Nome, Categoria...)
      socket.on("product_updated", (data) => {
  console.log("⚡ Notificação de cadastro/atualização via Socket:", data);
  handleSocketProductUpdate(data.product); // <--- Passando o product direto aqui
});

      // Ouvir exclusões de produtos
      socket.on("product_deleted", (data) => {
        console.log("⚡ Produto excluído via Socket:", data);
        handleSocketProductDelete(data.blingId);
      });

    } else {
      console.warn("⚠️ Socket.io não encontrado. Verifique a importação no HTML.");
    }

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
      overlay.classList.add("opacity-0");
      setTimeout(() => overlay.remove(), 500);
    }
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
    const container = document.getElementById("catalog-content");
    if (container)
      container.innerHTML = `<p class="text-red-500 text-center py-10 uppercase font-black text-xs">Erro ao conectar com o servidor.</p>`;
    if (overlay) overlay.remove();
  }
}

/* ──────────────────────────────────────────
   FUNÇÃO AUXILIAR PARA REAL-TIME
────────────────────────────────────────── */

// Processa a atualização vinda do servidor e atualiza a UI de forma cirúrgica
function handleSocketProductUpdate(data) {
  // Captura o objeto interno 'product' enviado pelo backend
  const updatedProduct = data?.product;
  if (!updatedProduct) return;

  const productId = updatedProduct._id || updatedProduct.id;
  console.log(`📥 [FRONT-SOCKET] Atualização de produto recebida para: "${updatedProduct.name}"`);

  // Verifica se a situação indica inatividade ou exclusão
  const status = updatedProduct.situacao || updatedProduct.status || "";
  const isInactive = String(status).toLowerCase().startsWith("i") || String(status).toLowerCase().startsWith("e") || updatedProduct.action === "delete";

  if (isInactive) {
    console.log(`🗑️ [FRONT-SOCKET] O produto "${updatedProduct.name}" está INATIVO/EXCLUÍDO. Removendo do catálogo.`);
    
    // 🔥 CORREÇÃO CRÍTICA: Alterado de '===' para '!==' para manter os outros produtos na tela
    if (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) {
      allProducts = allProducts.filter(p => String(p._id || p.id) !== String(productId));
    }
    
    // Remove do carrinho se ele estiver lá
    if (typeof cart !== 'undefined' && Array.isArray(cart)) {
      cart = cart.filter(item => !String(item.id).startsWith(productId));
      if (typeof updateCartUI === 'function') updateCartUI();
    }
    
    render();
    return; 
  }

  // ── SE O PRODUTO ESTIVER ATIVO, SEGUE O FLUXO NORMAL DE ATUALIZAÇÃO/RECUPERAÇÃO ──
  const idx = allProducts.findIndex(p => String(p._id || p.id) === String(productId));

  if (idx !== -1) {
    console.log(`📝 Atualizando dados cadastrais/estruturais de "${updatedProduct.name}" na tela.`);
    allProducts[idx] = updatedProduct;
  } else {
    // Se o produto foi recuperado ou criado, inserimos no início da listagem ativa
    console.log(`✨ Inserindo/Recuperando produto ativo "${updatedProduct.name}" no catálogo.`);
    allProducts.unshift(updatedProduct);
  }

  // Atualiza as informações do item caso ele esteja dentro do carrinho do cliente
  atualizarDadosCarrinhoRealTime(productId, updatedProduct);

  // Redesenha a tela instantaneamente
  console.log("🎨 [FRONT-SOCKET] Redesenhando catálogo para aplicar novos dados cadastrais...");
  render();
}

function handleSocketProductUpdate(updatedProduct) {
  if (!updatedProduct) return;

  const productId = updatedProduct._id || updatedProduct.id;
  console.log(`📥 [FRONT-SOCKET] Atualização de produto recebida para: "${updatedProduct.name}"`);

  // 🔥 SACADA DO BLING: Se o produto foi inativado/excluído no Bling, removemos ele da tela na hora!
  // (Verifique se o seu backend salva como 'Inativo', 'inativo', 'I' ou se a propriedade 'situacao' existe)
  const status = updatedProduct.situacao || updatedProduct.status || "";
  const isInactive = String(status).toLowerCase().startsWith("i") || updatedProduct.action === "delete";

  if (isInactive) {
    console.log(`🗑️ [FRONT-SOCKET] O produto "${updatedProduct.name}" está INATIVO no Bling. Removendo do catálogo.`);
    
    // Remove do array mestre para sumir da tela imediatamente
    if (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) {
      allProducts = allProducts.filter(p => String(p._id || p.id) === String(productId));
    }
    
    // Se ele estava no carrinho, remove por segurança
    if (typeof cart !== 'undefined' && Array.isArray(cart)) {
      cart = cart.filter(item => !String(item.id).startsWith(productId));
      if (typeof updateCartUI === 'function') updateCartUI();
    }
    
    // Força o redesenho imediato do catálogo limpo
    render();
    return; // Encerra o fluxo aqui
  }

  // ── SE O PRODUTO ESTIVER ATIVO, SEGUE O FLUXO NORMAL DE ATUALIZAÇÃO ──
  const idx = allProducts.findIndex(p => String(p._id || p.id) === String(productId));

  if (idx !== -1) {
    console.log(`📝 Atualizando dados de precificação/nome de "${updatedProduct.name}" na tela.`);
    allProducts[idx] = updatedProduct;
  } else {
    // Se o produto acabou de ser criado no Bling e está ativo, injeta no início!
    console.log(`✨ Inserindo novo produto criado "${updatedProduct.name}" no início do catálogo.`);
    allProducts.unshift(updatedProduct);
  }

  // Atualiza as informações do item caso ele esteja dentro do carrinho do cliente
  atualizarDadosCarrinhoRealTime(productId, updatedProduct);

  // Força a tela a redesenhar os cards
  console.log("🎨 [FRONT-SOCKET] Redesenhando catálogo para aplicar novos dados cadastrais...");
  render();
}

// Remove o produto da tela imediatamente se ele for excluído no Bling
function handleSocketProductDelete(blingId) {
  if (!blingId) return;
  console.log(`🗑️ [FRONT-SOCKET] Removendo produto Bling ID ${blingId} da lista ativa.`);
  
  // Filtra o array mestre removendo o produto deletado
  if (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) {
    allProducts = allProducts.filter(p => {
      // Se for o produto principal deletado
      if (String(p.blingId) === String(blingId)) return false;
      
      // Se for uma variação deletada isoladamente
      if (p.variations) {
        p.variations = p.variations.filter(v => String(v.blingId) !== String(blingId));
        if (p.variations.length === 0 && p.hasVariations) return false; 
      }
      return true;
    });
  }

  // Remove do carrinho se o cliente tinha adicionado ele antes de ser deletado
  if (typeof cart !== 'undefined' && Array.isArray(cart)) {
    cart = cart.filter(item => !String(item.id).startsWith(blingId));
    if (typeof updateCartUI === 'function') updateCartUI();
  }

  // Redesenha a tela imediatamente sem o produto
  console.log("🎨 [FRONT-SOCKET] Redesenhando catálogo limpo...");
  render();
}

function atualizarDadosCarrinhoRealTime(productId, updatedProduct) {
  if (!cart || !Array.isArray(cart)) return;

  cart.forEach(item => {
    if (String(item.id).startsWith(String(productId))) {
      // Se o produto atualizado trabalha com variações, varre para achar o índice correto mapeado no carrinho
      if (updatedProduct.hasVariations && updatedProduct.variations) {
        const parts = String(item.id).split('-');
        const vIdx = parts[1] ? parseInt(parts[1]) : -1;
        
        if (vIdx !== -1 && updatedProduct.variations[vIdx]) {
          item.name = updatedProduct.variations[vIdx].name;
          item.price = updatedProduct.variations[vIdx].price;
        }
      } else {
        // Produto simples
        item.name = updatedProduct.name;
        item.price = updatedProduct.price;
      }
    }
  });
  updateCartUI();
}

// Verifica se a nova quantidade derruba ou limita o que o usuário já tem no carrinho
function verificarLimitesCarrinhoRealTime(itemId, newStock, itemName) {
  // Encontra o item exato no carrinho (seja variação ou simples)
  const cartItem = cart.find(item => String(item.id) === String(itemId));
  if (!cartItem) return;

  cartItem.maxStock = newStock;

  if (newStock <= 0) {
    mostrarAvisoCarrinho(`O produto "${itemName}" esgotou na unidade ativa e foi removido do seu carrinho.`);
    cart = cart.filter(item => String(item.id) !== String(itemId));
  } else if (cartItem.quantity > newStock) {
    mostrarAvisoCarrinho(`A quantidade de "${itemName}" no seu carrinho foi ajustada para ${newStock} devido à disponibilidade do estoque.`);
    cartItem.quantity = newStock;
  }

  updateCartUI();
}

/* ──────────────────────────────────────────
   MODAL DE AVISO CUSTOMIZADO (SUBSTITUTO DO ALERT)
────────────────────────────────────────── */
function mostrarAvisoCarrinho(mensagem) {
  // Evita duplicar modais se estourarem vários eventos juntos
  const antigoModal = document.getElementById("socket-alert-modal");
  if (antigoModal) antigoModal.remove();

  const modalHtml = `
    <div id="socket-alert-modal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity duration-300">
      <div class="bg-card border border-amber-500/30 rounded-xl p-6 max-w-sm w-full shadow-2xl transform scale-95 opacity-0 transition-all duration-300 id="socket-modal-content"">
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

  // Animação de entrada
  setTimeout(() => {
    contentElement.classList.remove("scale-95", "opacity-0");
    contentElement.classList.add("scale-100", "opacity-100");
  }, 10);

  // Evento de fechar no botão OK
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
  // Atualiza o botão no topo da página
  const el = document.getElementById("top-store-name");
  if (el) el.innerText = storeName;

  // Atualiza o label dentro do carrinho
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

// Função para enviar os dados de escolha de loja para o Backend
async function sendAnalyticsEvent(type, location) {
  try {
    const API_BASE_URL = "https://jack-pecas-backend.onrender.com";
    await fetch(`${API_BASE_URL}/api/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: type,
        location: location,
        isNewUser: false, // Opcional, dependendo da sua regra de novos usuários
      }),
    });
  } catch (err) {
    console.error("Erro ao registrar analytics:", err);
  }
}

function selectStore(storeName) {
  // Se mudar de loja com itens no carrinho, confirma limpeza
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
  renderQuickNav();
  render();
  updateCartUI();

  // ── DISPARO DO ANALYTICS ADAPTADO PARA O SEU FORMATO ──
  // Mapeia o nome bonito da tela para o formato do banco de dados (minúsculo e com underline)
  let locationKey = "sao_roque";
  if (storeName === "Cotia") locationKey = "cotia";
  if (storeName === "Ibiúna") locationKey = "ibiuna";

  // Envia o evento para o servidor computar no Dashboard
  sendAnalyticsEvent("select_store", locationKey);
}

function updateStoreBadgesUI() {
  // Busca todos os spans que possuem o atributo data-store
  const badges = document.querySelectorAll(".store-badge");

  badges.forEach((badge) => {
    const storeName = badge.getAttribute("data-store");

    if (activeStore === storeName) {
      // Estilo quando estiver SELECIONADO: Cor amarela vibrante e texto destacado
      badge.textContent = "Selecionado";
      badge.className =
        "store-badge text-[9px] bg-[#FFC107] text-[#0a0f1a] font-black px-2 py-1 rounded-md transition-colors border border-[#FFC107]";
    } else {
      // Estilo Padrão para os botões não ativos: Fundo branco comum
      badge.textContent = "Selecionar";
      badge.className =
        "store-badge text-[9px] bg-white text-[#0a0f1a] group-hover:bg-[#FFC107] group-hover:text-[#0a0f1a] font-black px-2 py-1 rounded-md transition-colors border border-white";
    }
  });
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

  const isHomeActive = currentView === "HOME" || !activeCat;
  const styleInactive =
    "botao-filtro hover:bg-[#0a0f1a] hover:border-accent/30 hover:text-[#fefefe] transition-all";
  const styleActive =
    "bg-cor-azul-escuro border border-white text-white font-black shadow-lg shadow-accent/20";

  let html = `<button onclick="resetAll()" class="whitespace-nowrap px-4 py-2 rounded-xl text-[10px] uppercase font-bold transition-all active:scale-95 ${isHomeActive ? styleActive : styleInactive}">Tudo</button>`;

  (Array.isArray(categories) ? categories : []).forEach((cat) => {
    const name =
      typeof cat === "object" ? cat.name || cat.categoria || "" : cat;
    if (!name) return;

    const hasProducts = allProducts.some((p) => {
      if (
        !p.category ||
        p.category.trim().toLowerCase() !== name.trim().toLowerCase()
      )
        return false;
      if (p.hasVariations && p.variations)
        return p.variations.some((v) => getVariationStock(v) > 0);
      return getProductStock(p) > 0;
    });
    if (!hasProducts) return;

    const isActive =
      !isHomeActive &&
      activeCat &&
      activeCat.trim().toLowerCase() === name.trim().toLowerCase();
    html += `<button onclick="changeView('CATEGORY','${name}')" class="whitespace-nowrap px-4 py-2 rounded-xl text-[10px] uppercase font-bold transition-all active:scale-95 ${isActive ? styleActive : styleInactive}">${name}</button>`;
  });

  nav.innerHTML = html;
}

function changeView(view, cat = null, sub = null) {
  showLocalLoading();
  setTimeout(() => {
    currentView = view;
    activeCat = cat;
    activeSub = sub;
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
    setTimeout(() => {
      currentPage = 1;
      render();
    }, 100);
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
  if (!extra.classList.contains("hidden"))
    extra.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  const container = document.getElementById("catalog-content");
  const header = document.getElementById("view-header");
  const footer = document.getElementById("catalog-footer");
  const attrBox = document.getElementById("attribute-filters");
  const brandBox = document.getElementById("brand-filter-container");
  const searchInput = document.getElementById("public-search");

  if (!container || !activeStore) return;

  const isMobile = window.innerWidth < 768;
  const searchRaw = searchInput ? searchInput.value.toLowerCase().trim() : "";

  let htmlOutput = "";
  footer.innerHTML = "";
  attrBox.innerHTML = "";

  let filtered = allProducts.filter((p) => {
    let matchesSearch = true;
    if (searchRaw) {
      const keywords = searchRaw.split(/\s+/);
      matchesSearch = keywords.every((word) => {
        const s = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|\\s|[\\/\\-])(${s})($|\\s|[\\/\\-])`, "i").test(
          p.name,
        );
      });
    }
    const matchesCat = activeCat ? p.category === activeCat : true;
    const matchesSub = activeSub ? p.subcategory === activeSub : true;
    return matchesSearch && matchesCat && matchesSub;
  });

  Object.keys(activeFilters).forEach((key) => {
    filtered = filtered.filter(
      (p) => p.attributes && p.attributes[key] === activeFilters[key],
    );
  });

  filtered.sort((a, b) => {
    const stockA =
      a.hasVariations && a.variations
        ? a.variations.reduce((acc, v) => acc + getVariationStock(v), 0)
        : getProductStock(a);
    const stockB =
      b.hasVariations && b.variations
        ? b.variations.reduce((acc, v) => acc + getVariationStock(v), 0)
        : getProductStock(b);
    if (stockA > 0 && stockB <= 0) return -1;
    if (stockA <= 0 && stockB > 0) return 1;
    return 0;
  });

  if (activeCat && currentView !== "HOME")
    renderAttributeSelectors(filtered, attrBox);
  else attrBox.innerHTML = "";

  if (activeCat) {
    brandBox.classList.remove("hidden");
    setupBrandSelect();
  } else brandBox.classList.add("hidden");

  const isFiltering =
    Object.keys(activeFilters).length > 0 || searchRaw.length > 0;

  if (currentView === "HOME" && !isFiltering) {
    header.classList.add("hidden");
    categories.forEach((cat) => {
      const catProducts = filtered.filter((p) => p.category === cat.name);
      if (catProducts.length > 0) {
        htmlOutput += createSectionHTML(
          cat.name,
          catProducts.slice(0, isMobile ? 6 : 8),
          "CATEGORY",
          cat.name,
        );
      }
    });
  } else if (currentView === "CATEGORY" && !isFiltering) {
    header.classList.remove("hidden");
    document.getElementById("active-title").innerText = activeCat;
    const catData = categories.find((c) => c.name === activeCat);
    catData?.subcategories.forEach((sub) => {
      const products = filtered.filter(
        (p) =>
          p.subcategory &&
          p.subcategory.trim().toLowerCase() === sub.trim().toLowerCase(),
      );
      if (products.length > 0) {
        htmlOutput += createSectionHTML(
          `${sub}`,
          products.slice(0, isMobile ? 6 : 8),
          "SUBCATEGORY",
          activeCat,
          sub,
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
      const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
      const pageItems = filtered.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
      );
      htmlOutput = `<div class="flex flex-col gap-3 animate-in">${pageItems.map((p) => renderCard(p)).join("")}</div>`;
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
  const hasVars = p.hasVariations && p.variations?.length > 0;
  const lojaAtual = activeStore || "Geral";

  // ── PRODUTO SIMPLES ──
  if (!hasVars) {
    const currentStock = getProductStock(p);
    const isOutOfStock = currentStock <= 0;
    const itemId = p._id || p.id;
    const alreadyInCart = isInCart(itemId);

    const stockCardClasses = isOutOfStock
      ? "opacity-50 grayscale-[30%] border-gray-900/50 bg-white pointer-events-none"
      : "hover:border-accent/30 hover:bg-gray-800/20 shadow-xl hover:shadow-accent/5";

    // Botão dinâmico: "Adicionado" ou "Adicionar"
    let addBtn = "";
    if (isOutOfStock) {
      addBtn = `<button disabled class="bg-gray-900 text-gray-600 font-bold text-[10px] uppercase tracking-wider px-5 py-3 rounded-xl cursor-not-allowed border border-gray-800/40">Indisponível</button>`;
    } else if (alreadyInCart) {
      addBtn = `<button disabled class="bg-[#008b00] text-white border border-emerald-800/50 font-black text-[10px] uppercase tracking-wider px-5 py-3 rounded-xl flex items-center gap-1.5">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                        Adicionado
                      </button>`;
    } else {
      addBtn = `<button onclick="addToCart('${itemId}','${encodeURIComponent(p.name)}',${p.price},'${lojaAtual}', ${currentStock})"
                        class="bg-cor-amarelo hover:bg-cor-azul-escuro text-[#0a0f1a] hover:text-white border border-gray-800 hover:border-white font-black text-[10px] md:text-xs uppercase tracking-wider px-5 py-3 rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-lg hover:shadow-accent/20">
                        Adicionar
                      </button>`;
    }

    return `
            <div class="gpu-card bg-white border border-gray-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 w-full relative transition-all duration-300 ${stockCardClasses}">
                ${isOutOfStock ? `<div class="absolute top-3 right-3 bg-[#D32F2F] border border-[#B71C1C] text-white font-black uppercase text-[8px] tracking-widest px-2.5 py-1 rounded-lg">Esgotado na Loja</div>` : ""}
                <div class="flex-grow space-y-2.5 md:max-w-[65%]">
                    <div class="flex items-center gap-2">
                        <span class="text-[9px] font-black text-cor-azul bg-cor-amarelo px-2 py-0.5 rounded-md uppercase tracking-wider">${p.category || "Peça"}</span>
                        ${p.subcategory ? `<span class="text-[9px] font-bold text-gray-500 uppercase tracking-wide">/ ${p.subcategory}</span>` : ""}
                    </div>
                    <h4 class="text-sm md:text-base font-extrabold text-[#0a0f1a] leading-snug tracking-tight">${p.name}</h4>
                    <div class="flex flex-wrap gap-1.5 pt-0.5">
                        ${
                          p.attributes
                            ? Object.entries(p.attributes)
                                .map(([k, v]) =>
                                  v
                                    ? `<span class="px-2 py-0.5 rounded-md text-[8px] md:text-[9px] font-bold border uppercase tracking-wide ${getTagStyle(v)}">${v}</span>`
                                    : "",
                                )
                                .join("")
                            : ""
                        }
                    </div>
                </div>
                <div class="flex flex-row items-center justify-between md:flex-col md:items-end md:justify-center pt-4 md:pt-0 border-t border-gray-800/80 md:border-t-0 shrink-0 md:pl-6 md:min-w-[200px] gap-4">
                    <div class="flex flex-col md:items-end">
                        <span class="text-[9px] font-black text-gray-500 uppercase tracking-widest">Preço à vista</span>
                        <p class="text-2xl md:text-3xl font-black ${isOutOfStock ? "text-gray-600" : "text-cor-verde font-mono"} tracking-tight leading-none mt-1">
                            <span class="text-xs md:text-sm font-bold mr-0.5">R$</span>${parseFloat(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    ${addBtn}
                </div>
            </div>`;
  }

  // ── PRODUTO COM VARIAÇÕES ──
  const totalStock = p.variations.reduce(
    (acc, v) => acc + getVariationStock(v),
    0,
  );
  const isParentOutOfStock = totalStock <= 0;
  const minPrice = Math.min(...p.variations.map((v) => v.price || p.price));
  const productId = p._id || p.id;

  const sortedVariations = [...p.variations].sort((a, b) => {
    const sA = getVariationStock(a),
      sB = getVariationStock(b);
    if (sA > 0 && sB <= 0) return -1;
    if (sA <= 0 && sB > 0) return 1;
    return 0;
  });

  const variationsHTML = sortedVariations
    .map((v, index) => {
      const vStock = getVariationStock(v);
      const isVOOS = vStock <= 0;
      const varId = `${productId}-${index}`;
      const alreadyInCart = isInCart(varId);
      const varFullName = `${p.name} (${v.type}: ${v.value})`;
      const vStyleClasses = isVOOS
        ? "opacity-40 grayscale-[40%] bg-gray-950/20 pointer-events-none"
        : "hover:bg-gray-800/40";

      let varBtn = "";
      if (isVOOS) {
        varBtn = `<span class="text-[10px] font-bold text-gray-600 uppercase tracking-wider px-4 py-2.5">Indisponível</span>`;
      } else if (alreadyInCart) {
        varBtn = `<button disabled class="bg-[#008b00] text-white border border-[#09af00] font-black text-[9px] uppercase tracking-wider px-4 py-2.5 rounded-lg flex items-center gap-1.5">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                        Adicionado
                      </button>`;
      } else {
        varBtn = `<button onclick="addToCart('${varId}','${encodeURIComponent(varFullName)}',${v.price || p.price},'${lojaAtual}', ${vStock})"
                        class="bg-cor-amarelo hover:bg-cor-azul-escuro text-[#0a0f1a] hover:text-white font-black text-[9px] uppercase tracking-wider px-4 py-2.5 rounded-lg transition-all active:scale-95 border border-gray-800 hover:border-white">
                        Adicionar
                      </button>`;
      }

      return `
            <div class="flex flex-col bg-white sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-gray-800/40 transition-all ${vStyleClasses}">
                <div class="flex items-center gap-3">
                    <div class="bg-cor-azul-escuro text-[10px] font-black text-cor-amarelo px-2.5 py-1 rounded-md border border-gray-800 uppercase">
                        ${v.type}: <span class="text-white">${v.value}</span>
                    </div>
                    ${isVOOS ? `<span class="text-[9px] font-extrabold uppercase text-white tracking-wider bg-[#D32F2F] px-2 py-0.5 rounded-md border border-[#B71C1C]">Sem estoque</span>` : ""}
                </div>
                <div class="flex items-center justify-between sm:justify-end gap-6 mt-3 sm:mt-0 pt-3 sm:pt-0 border-t border-gray-800/40 sm:border-t-0">
                    <p class="text-lg font-black ${isVOOS ? "text-gray-600" : "text-cor-verde font-mono"}">
                        <span class="text-[10px] font-bold mr-0.5">R$</span>${parseFloat(v.price || p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                    ${varBtn}
                </div>
            </div>`;
    })
    .join("");

  return `
        <div class="w-full bg-white border border-gray-800 rounded-2xl overflow-hidden transition-all duration-300 ${isParentOutOfStock ? "opacity-50" : ""}">
            <div onclick="toggleDropdown('${productId}')" class="p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 w-full relative cursor-pointer hover:bg-gray-800/10 group select-none">
                ${isParentOutOfStock ? `<div class="absolute top-3 right-3 bg-[#D32F2F] border border-[#B71C1C] text-white font-black uppercase text-[8px] tracking-widest px-2.5 py-1 rounded-lg">Esgotado</div>` : ""}
                <div class="flex-grow space-y-2.5 md:max-w-[65%]">
                    <div class="flex items-center gap-2">
                        <span class="text-[9px] font-black text-cor-azul bg-cor-amarelo px-2 py-0.5 rounded-md uppercase tracking-wider">${p.category || "Peça"}</span>
                        <span class="text-[9px] font-black text-white bg-cor-azul-escuro border border-[#0a0f1a] px-2 py-0.5 rounded-md uppercase tracking-wider">Possui Variações</span>
                    </div>
                    <h4 class="text-sm md:text-base font-extrabold text-[#0a0f1a] leading-snug tracking-tight transition-colors">${p.name}</h4>
                    <div class="flex flex-wrap gap-1.5 pt-0.5">
                        ${
                          p.attributes
                            ? Object.entries(p.attributes)
                                .map(([k, v]) =>
                                  v
                                    ? `<span class="px-2 py-0.5 rounded-md text-[8px] md:text-[9px] font-bold border uppercase tracking-wide ${getTagStyle(v)}">${v}</span>`
                                    : "",
                                )
                                .join("")
                            : ""
                        }
                    </div>
                </div>
                <div class="flex flex-row items-center justify-between md:flex-col md:items-end md:justify-center pt-4 md:pt-0 border-t border-gray-800/80 md:border-t-0 shrink-0 md:pl-6 md:min-w-[200px] gap-4">
                    <div class="flex flex-col md:items-end">
                        <span class="text-[9px] font-black text-gray-500 uppercase tracking-widest">A partir de</span>
                        <p class="text-2xl md:text-3xl font-black text-cor-verde font-mono tracking-tight leading-none mt-1">
                            <span class="text-xs md:text-sm font-bold mr-0.5">R$</span>${parseFloat(minPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div id="arrow-${productId}" class="text-[#0a0f1a] bg-cor-amarelo p-2.5 rounded-xl border border-gray-800 group-hover:bg-cor-azul-escuro group-hover:text-white transition-all duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 transform transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </div>
                </div>
            </div>
            <div id="dropdown-${productId}" class="hidden border-t border-gray-800 bg-[#e1f5fe]/50 px-5 pb-5 pt-2">
                <p class="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-3">Selecione a opção desejada:</p>
                <div class="flex flex-col gap-2.5">${variationsHTML}</div>
            </div>
        </div>`;
}

function toggleDropdown(productId) {
  const panel = document.getElementById(`dropdown-${productId}`);
  const arrow = document
    .getElementById(`arrow-${productId}`)
    ?.querySelector("svg");
  if (!panel) return;
  if (panel.classList.contains("hidden")) {
    panel.classList.remove("hidden");
    if (arrow) arrow.classList.add("rotate-180");
  } else {
    panel.classList.add("hidden");
    if (arrow) arrow.classList.remove("rotate-180");
  }
}

function createSectionHTML(title, products, targetView, cat, sub = null) {
  return `
        <div class="animate-in mb-10">
            <div class="flex items-center justify-between mb-4 px-1">
                <h3 class="text-xs font-black uppercase tracking-[0.3em] text-gray-500">${title}</h3>
                <button onclick="changeView('${targetView}','${cat}','${sub || ""}')" class="text-[9px] bg-cor-azul-escuro hover:bg-[#FFC107] text-white hover:text-[#0a0f1a] font-black border border-accent/20 px-4 py-1.5 rounded-full uppercase transition-all">Ver Tudo</button>
            </div>
            <div class="flex flex-col gap-3">${products.map((p) => renderCard(p)).join("")}</div>
        </div>`;
}

function renderAttributeSelectors(products, container) {
  if (!container) return;
  const attrOptions = {};
  products.forEach((p) => {
    if (p.attributes)
      Object.entries(p.attributes).forEach(([k, v]) => {
        if (!attrOptions[k]) attrOptions[k] = new Set();
        attrOptions[k].add(v);
      });
  });
  container.innerHTML = "";
  Object.entries(attrOptions).forEach(([key, values]) => {
    const select = document.createElement("select");
    select.className = `botao-filtro hover:bg-[#0a0f1a] hover:text-white rounded-lg px-3 py-2 pr-8 text-[10px] font-black uppercase outline-none focus:border-accent transition-all ${activeFilters[key] ? "bg-[#0a0f1a] border-white text-white hover:border-[#0a0f1a]" : "text-[#0a0f1a]"}`;
    select.onchange = (e) => setAttrFilter(key, e.target.value);
    select.innerHTML =
      `<option value="">${key}</option>` +
      Array.from(values)
        .sort()
        .map(
          (v) =>
            `<option value="${v}" ${activeFilters[key] === v ? "selected" : ""}>${v}</option>`,
        )
        .join("");
    container.appendChild(select);
  });
}

function setupBrandSelect() {
  const subSelect = document.getElementById("sub-filter");
  if (!subSelect) return;

  const subs = [
    ...new Set(
      allProducts
        .filter(
          (p) =>
            p.category &&
            p.category.trim().toLowerCase() ===
              activeCat.trim().toLowerCase() &&
            p.subcategory,
        )
        .map((p) => p.subcategory),
    ),
  ];

  subSelect.innerHTML =
    `<option value="">Subcategoria</option>` +
    subs
      .sort()
      .map(
        (s) =>
          `<option value="${s}" ${activeSub === s ? "selected" : ""}>${s}</option>`,
      )
      .join("");

  if (activeSub && activeSub !== "") {
    subSelect.className =
      "bg-cor-azul-escuro border border-white hover:text-gray-500 rounded-lg px-3 py-2 text-[10px] font-black uppercase outline-none text-white min-w-[100px]";
  } else {
    subSelect.className =
      "botao-filtro border-gray-700 hover:bg-[#0a0f1a] hover:text-white rounded-lg px-3 py-2 text-[10px] font-black uppercase outline-none focus:border-accent min-w-[100px]";
  }
}

function renderPager(current, total, totalItems, footer) {
  if (total <= 1) {
    footer.innerHTML = `<p class="text-[10px] font-black text-gray-600 uppercase tracking-widest">${totalItems} PRODUTOS ENCONTRADOS</p>`;
    return;
  }
  const startItem = (current - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(current * ITEMS_PER_PAGE, totalItems);
  footer.innerHTML = `
        <div class="flex flex-col items-center gap-4 w-full max-w-xs mx-auto">
            <div class="text-center space-y-1">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                    Exibindo <span class="text-cor-verde">${startItem}-${endItem}</span> de <span class="text-cor-verde">${totalItems}</span> produtos
                </p>
                <div class="w-full h-1 bg-cor-azul-escuro rounded-full overflow-hidden">
                    <div class="h-full bg-cor-amarelo transition-all duration-500" style="width:${(current / total) * 100}%"></div>
                </div>
            </div>
            <div class="flex items-center gap-2 bg-cor-amarelo border border-gray-800 p-1.5 rounded-2xl w-full justify-between shadow-2xl">
                <button onclick="goToPage(${current - 1})" ${current === 1 ? "disabled" : ""} class="flex-1 flex items-center justify-center py-3 rounded-xl transition-all active:scale-95 disabled:opacity-20 disabled:grayscale">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-[#0a0f1a]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <div class="px-4 border-x border-gray-800">
                    <span class="text-xs font-black text-[#0a0f1a] font-mono">${String(current).padStart(2, "0")}</span>
                    <span class="text-[10px] font-bold text-gray-600 uppercase mx-1">/</span>
                    <span class="text-[10px] font-bold text-[#0a0f1a] uppercase">${String(total).padStart(2, "0")}</span>
                </div>
                <button onclick="goToPage(${current + 1})" ${current === total ? "disabled" : ""} class="flex-1 flex items-center justify-center py-3 rounded-xl transition-all active:scale-95 disabled:opacity-20 disabled:grayscale">
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

/* ──────────────────────────────────────────
   CARRINHO
────────────────────────────────────────── */

// AJUSTE 2: toggleCartPanel abre/fecha o drawer — NÃO é chamado pelo addToCart
function toggleCartPanel() {
  const panel = document.getElementById("cart-panel");
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

// AJUSTE: addToCart recebe maxStock e salva no objeto do carrinho
function addToCart(id, name, price, store, maxStock) {
  const decodedName = decodeURIComponent(name);
  const existingItem = cart.find(
    (item) => item.id === id && item.store === store,
  );

  if (existingItem) {
    if (existingItem.quantity < maxStock) {
      existingItem.quantity += 1;
      existingItem.stockWarning = null; // Limpa aviso se houver
    } else {
      // Mostra o erro inline e abre o carrinho se estiver fechado
      existingItem.stockWarning = `Apenas ${maxStock} unidade(s) em estoque.`;

      const panel = document.getElementById("cart-panel");
      if (panel && panel.classList.contains("translate-x-full")) {
        toggleCartPanel(); // Abre o painel lateral
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
        price: Number(price),
        store,
        quantity: 1,
        maxStock,
      });
    }
  }

  updateCartUI();
  render();
}

// AJUSTE: updateQuantity respeita o maxStock salvo no item[cite: 11]
function updateQuantity(id, store, change) {
  const idx = cart.findIndex((item) => item.id === id && item.store === store);
  if (idx === -1) return;

  const novaQuantidade = cart[idx].quantity + change;

  // Limpa qualquer aviso anterior para não encavalar
  cart[idx].stockWarning = null;

  // Se tentar passar do limite
  if (change > 0 && novaQuantidade > cart[idx].maxStock) {
    cart[idx].stockWarning =
      `Apenas ${cart[idx].maxStock} unidade(s) em estoque.`;
    updateCartUI(); // Atualiza a interface imediatamente para mostrar o erro

    // Esconde a mensagem após 3 segundos
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

function updateCartUI() {
  const badge = document.getElementById("cart-badge");
  const listContainer = document.getElementById("cart-items-list");
  const totalQtyLabel = document.getElementById("cart-total-qty");
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
    if (totalQtyLabel) totalQtyLabel.innerText = "0";
    if (totalPriceLabel) totalPriceLabel.innerText = "R$ 0,00";
    return;
  }

  cart.forEach((item) => {
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

  if (totalQtyLabel) totalQtyLabel.innerText = totalItems;
  if (totalPriceLabel)
    totalPriceLabel.innerText = totalPrice.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  if (listContainer) {
    listContainer.innerHTML = cart
      .map((item) => {
        const itemTotal = item.price * item.quantity;
        return `
                <div class="p-4 bg-white border border-gray-800 rounded-xl flex flex-col gap-3">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex-grow">
                            <h5 class="text-xs font-extrabold text-[#0a0f1a] leading-snug">${item.name}</h5>
                            <span class="text-[9px] font-black text-cor-amarelo px-1.5 py-0.5 rounded uppercase mt-1 inline-block tracking-wide">
                                Filial: ${item.store}
                            </span>
                        </div>
                        <span class="text-xs font-black text-cor-azul font-mono shrink-0">
                            ${item.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                    </div>
                    
                    <div class="flex flex-col gap-1 pt-2 border-t border-gray-800/50">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center bg-cor-amarelo border border-gray-800 rounded-lg p-0.5">
                                <button onclick="updateQuantity('${item.id}','${item.store}',-1)"
                                    class="w-7 h-7 flex items-center justify-center text-[#D32F2F] hover:text-[#B71C1C] rounded-md transition-colors active:scale-90 font-black text-sm">−</button>
                                <span class="w-8 text-center text-xs font-black font-mono text-white">${item.quantity}</span>
                                <button onclick="updateQuantity('${item.id}','${item.store}',1)"
                                    class="w-7 h-7 flex items-center justify-center text-[#008b00] hover:text-[#09af00] rounded-md transition-colors active:scale-90 font-black text-sm">+</button>
                            </div>
                            <span class="text-lg font-black text-cor-verde font-mono">
                                ${itemTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                        </div>
                        <!-- Renderiza a mensagem de erro temporária se existir -->
                        ${item.stockWarning ? `<span class="text-[9px] font-bold text-rose-500 uppercase tracking-wider mt-1 animate-in">${item.stockWarning}</span>` : ""}
                    </div>
                </div>`;
      })
      .join("");
  }
}

// AJUSTE 4: checkoutCart limpa o carrinho após enviar a mensagem
function checkoutCart() {
  if (cart.length === 0) {
    alert("Seu carrinho está vazio!");
    return;
  }

  const phoneNumber =
    STORE_CONTACTS[activeStore] || STORE_CONTACTS["São Roque"];

  let totalGeral = 0;
  let message = `*NOVO PEDIDO - JACK PEÇAS*\n`;
  message += `*Unidade:* Loja ${activeStore}\n`;
  message += `───────────────────────────\n\n`;

  cart.forEach((item, index) => {
    const subtotal = item.price * item.quantity;
    totalGeral += subtotal;
    message += `*${item.quantity}x* ${item.name}\n`;
    message += `Preço Unitário: ${item.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n`;
    message += `Subtotal: *${subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}*\n\n`;
  });

  message += `───────────────────────────\n`;
  message += `*TOTAL: ${totalGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}*\n\n`;
  message += `Gostaria de verificar disponibilidade e finalizar este pedido.`;

  window.open(
    `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`,
    "_blank",
  );

  // AJUSTE 4: limpa o carrinho e fecha o drawer após envio
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
