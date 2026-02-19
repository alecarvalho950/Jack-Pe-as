let allProducts = [];
let categories = [];
let searchTimer;
let currentView = "HOME";
let activeCat = null;
let activeSub = null;
let activeFilters = {};
let currentPage = 1;
const ITEMS_PER_PAGE = 20;

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

async function init() {
  const API_BASE_URL = "https://jack-pe-as-production.up.railway.app";
  try {
    // Listener de busca com debounce (Idêntico ao painel)
    const searchInput = document.getElementById("public-search");
    if (searchInput) {
      searchInput.addEventListener("input", handleSearch);
    }


    const [resCat, resProd] = await Promise.all([
      fetch(`${API_BASE_URL}/api/categories`),
      fetch(`${API_BASE_URL}/api/products?limit=9999`),
    ]);
    categories = await resCat.json();
    allProducts = (await resProd.json()).products || [];
    renderQuickNav();
    render();
  } catch (err) {
    console.error(err);
  }
}

function resetAll() {
  document.getElementById("public-search").value = "";
  activeFilters = {};
  changeView("HOME");
}

function renderQuickNav() {
  const nav = document.getElementById("quick-nav");
  nav.innerHTML =
    `<button onclick="changeView('HOME')" class="whitespace-nowrap px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${currentView === "HOME" ? "bg-accent text-black" : "text-gray-500 hover:text-white"}">Tudo</button>` +
    categories
      .map(
        (cat) =>
          `<button onclick="changeView('CATEGORY', '${cat.name}')" class="whitespace-nowrap px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${activeCat === cat.name && currentView !== "HOME" ? "bg-accent text-black" : "text-gray-500 hover:text-white"}">${cat.name}</button>`,
      )
      .join("");
}

function changeView(view, cat = null, sub = null) {
  currentView = view;
  activeCat = cat;
  activeSub = sub;
  if (view === "HOME") activeFilters = {};
  currentPage = 1;
  render();
  renderQuickNav();

  if (view !== "HOME") {
    // Reduzi para 320 para alinhar melhor com a barra fixa
    window.scrollTo({ top: 320, behavior: "smooth" });
  }
}

function handleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentPage = 1;
    render();
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

function render() {
  const container = document.getElementById("catalog-content");
  const header = document.getElementById("view-header");
  const footer = document.getElementById("catalog-footer");
  const attrBox = document.getElementById("attribute-filters");
  const brandBox = document.getElementById("brand-filter-container");
  const searchRaw = document
    .getElementById("public-search")
    .value.toLowerCase()
    .trim();

  container.innerHTML = "";
  footer.innerHTML = "";
  attrBox.innerHTML = "";

  const isMobile = window.innerWidth < 768;
  const homeLimit = isMobile ? 6 : 8;

  // 1. Filtragem Inicial
  let filtered = allProducts.filter((p) => {
    let matchesSearch = true;
    if (searchRaw) {
      const keywords = searchRaw.split(/\s+/);
      matchesSearch = keywords.every((word) => {
        const s = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regexPattern = new RegExp(
          `(^|\\s|[\\/\\-])(${s})($|\\s|[\\/\\-])`,
          "i",
        );
        return regexPattern.test(p.name);
      });
    }
    const matchesCat = activeCat ? p.category === activeCat : true;
    const matchesSub = activeSub ? p.subcategory === activeSub : true;
    return matchesSearch && matchesCat && matchesSub;
  });

  // 2. Filtros de Atributos
  Object.keys(activeFilters).forEach((key) => {
    filtered = filtered.filter(
      (p) => p.attributes && p.attributes[key] === activeFilters[key],
    );
  });

  renderAttributeSelectors(filtered, attrBox);

  if (activeCat) {
    brandBox.classList.remove("hidden");
    setupBrandSelect();
  } else {
    brandBox.classList.add("hidden");
  }

  const isFiltering =
    Object.keys(activeFilters).length > 0 || searchRaw.length > 0;

  // 3. Lógica de Exibição
  if (currentView === "HOME" && !isFiltering) {
    header.classList.add("hidden");
    categories.forEach((cat) => {
      const catProducts = filtered.filter((p) => p.category === cat.name);
      const diverseProducts = [];
      const usedSubs = new Set();

      // Pega um de cada subcategoria
      for (const p of catProducts) {
        if (!usedSubs.has(p.subcategory)) {
          diverseProducts.push(p);
          usedSubs.add(p.subcategory);
        }
        if (diverseProducts.length >= homeLimit) break;
      }

      // Completa se sobrar espaço
      if (diverseProducts.length < homeLimit) {
        const remaining = catProducts.filter(
          (p) => !diverseProducts.includes(p),
        );
        diverseProducts.push(
          ...remaining.slice(0, homeLimit - diverseProducts.length),
        );
      }

      if (diverseProducts.length > 0) {
        renderSection(
          cat.name,
          diverseProducts,
          container,
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
      const products = filtered.filter((p) => p.subcategory === sub);
      if (products.length > 0) {
        // Aqui mostramos a quantidade dinâmica (6 ou 8) por linha de subcategoria
        renderSection(
          `${activeCat} ${sub}`,
          products.slice(0, homeLimit),
          container,
          "SUBCATEGORY",
          activeCat,
          sub,
        );
      }
    });
  } else {
    // VISUALIZAÇÃO DE GRADE COM PAGINAÇÃO (Busca ou Subcategoria selecionada)
    header.classList.remove("hidden");
    document.getElementById("active-title").innerText = activeSub
      ? `${activeCat} ${activeSub}`
      : activeCat || "Busca";

    if (filtered.length === 0) {
      renderEmpty(container);
      return;
    }

    // CORREÇÃO AQUI: Definindo pageItems antes de usar
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const pageItems = filtered.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE,
    );

    renderGrid(pageItems, container);
    renderPager(currentPage, totalPages, filtered.length, footer);
  }
}

window.addEventListener("resize", () => {
  // Debounce simples para não travar a UI no resize
  clearTimeout(window.resizeTimer);
  window.resizeTimer = setTimeout(render, 250);
});

function toggleFilters() {
  const extra = document.getElementById("extra-filters");
  extra.classList.toggle("hidden");
  // Opcional: scroll suave se os filtros abrirem fora da tela
  if (!extra.classList.contains("hidden")) {
    extra.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function renderAttributeSelectors(products, container) {
  const attrOptions = {};
  products.forEach((p) => {
    if (p.attributes) {
      Object.entries(p.attributes).forEach(([k, v]) => {
        if (!attrOptions[k]) attrOptions[k] = new Set();
        attrOptions[k].add(v);
      });
    }
  });

  container.innerHTML = "";

  Object.entries(attrOptions).forEach(([key, values]) => {
    const select = document.createElement("select");
    // 'w-full sm:w-auto' faz com que no celular eles fiquem em lista ou pequenos
    select.className = `bg-card border border-gray-700 rounded-lg px-3 py-2 pr-8 text-[10px] font-black uppercase outline-none focus:border-accent transition-all ${activeFilters[key] ? "border-accent text-accent" : "text-gray-400"}`;

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
  const subs = [
    ...new Set(
      allProducts
        .filter((p) => p.category === activeCat)
        .map((p) => p.subcategory),
    ),
  ];
  subSelect.innerHTML =
    `<option value="">Subcategoria</option>` +
    subs
      .map(
        (s) =>
          `<option value="${s}" ${activeSub === s ? "selected" : ""}>${s}</option>`,
      )
      .join("");
}

function getTagStyle(text) {
    if (!text) return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    
    // Algoritmo simples de hash para converter texto em um índice da paleta
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const index = Math.abs(hash) % TAG_PALETTE.length;
    const style = TAG_PALETTE[index];
    
    return `${style.bg} ${style.text} ${style.border}`;
}

function renderCard(p) {
    const img = p.image ? p.image : null;
    const hasVars = p.hasVariations && p.variations?.length > 0;

    // Lógica para agrupar variações por tipo
    let variacoesAgrupadas = "";
    if (hasVars) {
        const grupos = {};
        p.variations.forEach(v => {
            if (v.type && v.value) {
                if (!grupos[v.type]) grupos[v.type] = [];
                // Evita duplicatas no agrupamento
                if (!grupos[v.type].includes(v.value)) {
                    grupos[v.type].push(v.value);
                }
            }
        });

        variacoesAgrupadas = Object.entries(grupos)
            .map(([type, values]) => `<span class="text-accent font-bold">${type}:</span> ${values.join(", ")}`)
            .join(" | ");
    }

    const displayPrice = hasVars
        ? Math.min(...p.variations.map((v) => v.price || p.price))
        : p.price;

    return `
        <div class="bg-card border border-gray-800 rounded-3xl overflow-hidden flex flex-col h-full hover:border-accent/40 transition-all duration-300 group shadow-lg">
            <div class="aspect-square bg-gray-900 overflow-hidden relative border-b border-gray-800/50">
                ${
                  img
                    ? `<img src="${img}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700">`
                    : `<div class="w-full h-full flex items-center justify-center text-[9px] font-black text-gray-700 uppercase italic">S/ Imagem</div>`
                }
            </div>

            <div class="p-4 md:p-5 flex flex-col flex-grow space-y-3 md:space-y-4">
                
                <h5 class="text-xs md:text-base font-bold text-white leading-tight group-hover:text-accent transition-colors duration-300 line-clamp-2 md:line-clamp-3">
                    ${p.name}
                </h5>

                <div class="flex flex-wrap gap-1.5 md:gap-2">
                    ${
                      p.attributes
                        ? Object.entries(p.attributes)
                            .map(([key, val]) => {
                              if (!val) return "";
                              // AQUI: Usando a função getTagStyle em vez do COLOR_MAP estático
                              const badgeStyle = getTagStyle(val); 
                              return `<span class="px-2 py-0.5 md:px-2.5 md:py-1 rounded-md md:rounded-lg text-[8px] md:text-[9px] font-bold border uppercase tracking-wide ${badgeStyle}">${val}</span>`;
                            })
                            .join("")
                        : ""
                    }
                </div>

                ${
                  variacoesAgrupadas
                    ? `
                <div class="pt-1">
                    <p class="text-[9px] md:text-[10px] text-gray-400 font-medium leading-relaxed italic">
                        ${variacoesAgrupadas}
                    </p>
                </div>`
                    : ""
                }

                <div class="mt-auto pt-3 md:pt-5 border-t border-gray-800/50">
                    <div class="flex flex-col">
                        <span class="text-[8px] md:text-[9px] font-black text-gray-500 uppercase tracking-tighter">
                            ${hasVars ? 'A partir de' : 'Preço:'}
                        </span>
                        <p class="text-xl md:text-2xl font-black text-accent font-mono leading-none mt-1">
                            <span class="text-[10px] md:text-xs mr-0.5">R$</span>${parseFloat(displayPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>
            </div>
        </div>`;
}

function renderSection(
  title,
  products,
  container,
  targetView,
  cat,
  sub = null,
) {
  const section = document.createElement("div");
  section.className = "animate-in";
  section.innerHTML = `
                <div class="flex items-center justify-between mb-6 px-1">
                    <h3 class="text-xs font-black uppercase tracking-[0.3em] text-gray-500">${title}</h3>
                    <button onclick="changeView('${targetView}', '${cat}', '${sub || ""}')" class="text-[9px] font-black text-accent border border-accent/20 px-4 py-1.5 rounded-full uppercase hover:bg-accent hover:text-black transition-all">Ver Tudo</button>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">${products.map((p) => renderCard(p)).join("")}</div>`;
  container.appendChild(section);
}

function renderGrid(products, container) {
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 animate-in";
  grid.innerHTML = products.map((p) => renderCard(p)).join("");
  container.appendChild(grid);
}

function renderEmpty(container) {
  container.innerHTML = `<div class="py-20 text-center"><p class="text-gray-500 font-black uppercase text-xs">Sem resultados para os filtros selecionados.</p></div>`;
}

function renderPager(current, total, totalItems, footer) {
  if (total <= 1) {
    footer.innerHTML = `<p class="text-[10px] font-black text-gray-600 uppercase tracking-widest">${totalItems} PRODUTOS ENCONTRADOS</p>`;
    return;
  }

  // Calcula o intervalo de itens sendo exibidos (ex: 1-20 de 100)
  const startItem = (current - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(current * ITEMS_PER_PAGE, totalItems);

  footer.innerHTML = `
        <div class="flex flex-col items-center gap-4 w-full max-w-xs mx-auto">
            <div class="text-center space-y-1">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                    Exibindo <span class="text-accent">${startItem}-${endItem}</span> de <span class="text-white">${totalItems}</span> produtos
                </p>
                <div class="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div class="h-full bg-accent transition-all duration-500" style="width: ${(current / total) * 100}%"></div>
                </div>
            </div>

            <div class="flex items-center gap-2 bg-card border border-gray-800 p-1.5 rounded-2xl w-full justify-between shadow-2xl">
                <button onclick="goToPage(${current - 1})" ${current === 1 ? "disabled" : ""} 
                    class="flex-1 flex items-center justify-center py-3 rounded-xl transition-all active:scale-95 disabled:opacity-20 disabled:grayscale group">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                <div class="px-4 border-x border-gray-800">
                    <span class="text-xs font-black text-white font-mono">${String(current).padStart(2, "0")}</span>
                    <span class="text-[10px] font-bold text-gray-600 uppercase mx-1">/</span>
                    <span class="text-[10px] font-bold text-gray-600 uppercase">${String(total).padStart(2, "0")}</span>
                </div>

                <button onclick="goToPage(${current + 1})" ${current === total ? "disabled" : ""} 
                    class="flex-1 flex items-center justify-center py-3 rounded-xl transition-all active:scale-95 disabled:opacity-20 disabled:grayscale group">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
        </div>
    `;
}

function goToPage(p) {
  currentPage = p;
  render();
  window.scrollTo({ top: 400, behavior: "smooth" });
}

init();
