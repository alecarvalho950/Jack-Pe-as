let allProducts = [];
        let categories = [];
        let currentView = 'HOME'; 
        let activeCat = null;
        let activeSub = null;
        let activeFilters = {}; 
        let currentPage = 1;
        const ITEMS_PER_PAGE = 20;

        const COLOR_MAP = {
            // --- MODELO (Aro) ---
    "Sem Aro": "bg-sky-500/10 text-sky-400 border-sky-500/20",
    "Com Aro": "bg-orange-500/10 text-orange-400 border-orange-500/20",

    // --- QUALIDADE (Níveis de peça) ---
    "China": "bg-gray-500/10 text-gray-400 border-gray-500/20",
    "Nacional Jack": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    "Premium": "bg-amber-500/10 text-amber-400 border-amber-500/20",
    "Jack Premium": "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    "Incell Premium": "bg-purple-500/10 text-purple-400 border-purple-500/20",

    // --- TIPO DE TELA (Tecnologia) ---
    "Lcd": "bg-blue-500/10 text-blue-400 border-blue-500/20",
    "Lcd Full HD": "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    "Full HD": "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    "Oled": "bg-pink-500/10 text-pink-400 border-pink-500/20",
    "Amoled": "bg-rose-500/10 text-rose-400 border-rose-500/20",
    
    // Fallback para tecnologias antigas ou importações
    "Incell": "bg-purple-500/10 text-purple-400 border-purple-500/20",
    "Original": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        };

        async function init() {
            try {
                const [resCat, resProd] = await Promise.all([
                    fetch('http://localhost:3000/api/categories'),
                    fetch('http://localhost:3000/api/products?limit=9999')
                ]);
                categories = await resCat.json();
                allProducts = (await resProd.json()).products || [];
                renderQuickNav();
                render();
            } catch (err) { console.error(err); }
        }

        function resetAll() {
            document.getElementById('public-search').value = '';
            activeFilters = {};
            changeView('HOME');
        }

        function renderQuickNav() {
            const nav = document.getElementById('quick-nav');
            nav.innerHTML = `<button onclick="changeView('HOME')" class="whitespace-nowrap px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${currentView === 'HOME' ? 'bg-accent text-black' : 'text-gray-500 hover:text-white'}">Tudo</button>` + 
                categories.map(cat => `<button onclick="changeView('CATEGORY', '${cat.name}')" class="whitespace-nowrap px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${activeCat === cat.name && currentView !== 'HOME' ? 'bg-accent text-black' : 'text-gray-500 hover:text-white'}">${cat.name}</button>`).join('');
        }

        function changeView(view, cat = null, sub = null) {
            currentView = view; activeCat = cat; activeSub = sub; 
            if (view === 'HOME') activeFilters = {}; 
            currentPage = 1;
            render(); renderQuickNav();
            if(view !== 'HOME') window.scrollTo({ top: 400, behavior: 'smooth' });
        }

        function handleSearch() { currentPage = 1; render(); }

        function handleSubFilter(sub) {
            if (sub === "") changeView('CATEGORY', activeCat);
            else changeView('SUBCATEGORY', activeCat, sub);
        }

        function setAttrFilter(key, val) {
            if (val === "") delete activeFilters[key];
            else activeFilters[key] = val;
            currentPage = 1;
            render();
        }

        function render() {
            const container = document.getElementById('catalog-content');
            const header = document.getElementById('view-header');
            const footer = document.getElementById('catalog-footer');
            const attrBox = document.getElementById('attribute-filters');
            const brandBox = document.getElementById('brand-filter-container');
            const search = document.getElementById('public-search').value.toLowerCase();
            
            container.innerHTML = ''; footer.innerHTML = ''; attrBox.innerHTML = '';

            let filtered = allProducts.filter(p => {
                const matchesSearch = p.name.toLowerCase().includes(search) || (p.sku && p.sku.toLowerCase().includes(search));
                const matchesCat = activeCat ? p.category === activeCat : true;
                const matchesSub = activeSub ? p.subcategory === activeSub : true;
                return matchesSearch && matchesCat && matchesSub;
            });

            Object.keys(activeFilters).forEach(key => {
                filtered = filtered.filter(p => p.attributes && p.attributes[key] === activeFilters[key]);
            });

            renderAttributeSelectors(filtered, attrBox);

            if (activeCat) { brandBox.classList.remove('hidden'); setupBrandSelect(); } 
            else { brandBox.classList.add('hidden'); }

            const isFiltering = Object.keys(activeFilters).length > 0 || search.length > 0;

            if (currentView === 'HOME' && !isFiltering) {
                header.classList.add('hidden');
                categories.forEach(cat => {
                    const products = filtered.filter(p => p.category === cat.name);
                    if (products.length > 0) renderSection(cat.name, products.slice(0, 4), container, 'CATEGORY', cat.name);
                });
            } else if (currentView === 'CATEGORY' && !isFiltering) {
                header.classList.remove('hidden');
                document.getElementById('active-title').innerText = activeCat;
                const catData = categories.find(c => c.name === activeCat);
                catData?.subcategories.forEach(sub => {
                    const products = filtered.filter(p => p.subcategory === sub);
                    if (products.length > 0) renderSection(`${activeCat} ${sub}`, products.slice(0, 4), container, 'SUBCATEGORY', activeCat, sub);
                });
            } else {
                header.classList.remove('hidden');
                document.getElementById('active-title').innerText = activeSub ? `${activeCat} ${activeSub}` : (activeCat || "Busca");
                
                if (filtered.length === 0) { renderEmpty(container); return; }

                const pageItems = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
                renderGrid(pageItems, container);
                renderPager(currentPage, Math.ceil(filtered.length / ITEMS_PER_PAGE), footer);
            }
        }

        function renderAttributeSelectors(products, container) {
            const attrOptions = {};
            products.forEach(p => { if (p.attributes) Object.entries(p.attributes).forEach(([k, v]) => { if (!attrOptions[k]) attrOptions[k] = new Set(); attrOptions[k].add(v); }); });
            Object.entries(attrOptions).forEach(([key, values]) => {
                const select = document.createElement('select');
                select.className = `bg-card border border-gray-700 rounded-xl px-3 py-2 pr-8 text-[9px] font-black uppercase outline-none focus:border-accent ${activeFilters[key] ? 'border-accent text-accent' : 'text-gray-400'}`;
                select.onchange = (e) => setAttrFilter(key, e.target.value);
                select.innerHTML = `<option value="">${key}</option>` + Array.from(values).sort().map(v => `<option value="${v}" ${activeFilters[key] === v ? 'selected' : ''}>${v}</option>`).join('');
                container.appendChild(select);
            });
        }

        function setupBrandSelect() {
            const subSelect = document.getElementById('sub-filter');
            const subs = [...new Set(allProducts.filter(p => p.category === activeCat).map(p => p.subcategory))];
            subSelect.innerHTML = `<option value="">Marca</option>` + subs.map(s => `<option value="${s}" ${activeSub === s ? 'selected' : ''}>${s}</option>`).join('');
        }

        function renderCard(p) {
    const img = p.image ? `http://localhost:3000${p.image}` : null;
    const hasVars = p.hasVariations && p.variations?.length > 0;
    
    // Pega todas as variações e formata como "Tipo: Valor" (Ex: "Versão: M15")
    // Filtramos apenas as que possuem valor para não gerar badges vazios
    const listaVariacoes = hasVars 
        ? p.variations.filter(v => v.value).map(v => ({
            label: `${v.type}: ${v.value}`,
            price: v.price
        }))
        : [];

    const displayPrice = hasVars 
        ? Math.min(...p.variations.map(v => v.price || p.price))
        : p.price;

    return `
        <div class="bg-card border border-gray-800 rounded-3xl overflow-hidden flex flex-col h-full hover:border-accent/40 transition-all duration-300 group shadow-lg">
            <div class="aspect-square bg-gray-900 overflow-hidden relative border-b border-gray-800/50">
                ${img ? `<img src="${img}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700">` : 
                `<div class="w-full h-full flex items-center justify-center text-[10px] font-black text-gray-700 uppercase italic">S/ Imagem</div>`}
            </div>

            <div class="p-5 flex flex-col flex-grow space-y-4">
                
                <h4 class="text-base md:text-lg font-bold text-white leading-tight group-hover:text-accent transition-colors duration-300 line-clamp-3">
                    ${p.name}
                </h4>

                <div class="flex flex-wrap gap-2">
                    ${p.attributes ? Object.entries(p.attributes).map(([key, val]) => {
                        if (!val) return '';
                        const badgeStyle = COLOR_MAP[val] || 'bg-gray-800/50 text-gray-400 border-gray-700';
                        return `<span class="px-2.5 py-1 rounded-lg text-[9px] font-bold border uppercase tracking-wider ${badgeStyle}">${val}</span>`;
                    }).join('') : ''}
                </div>

                ${listaVariacoes.length > 0 ? `
                <div class="pt-2">
                    <p class="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-2 italic">Opções Disponíveis:</p>
                    <div class="flex flex-wrap gap-1.5">
                        ${listaVariacoes.map(v => `
                            <span class="text-[9px] bg-accent/5 border border-accent/20 text-accent px-2 py-1 rounded-md font-bold uppercase">
                                ${v.label}
                            </span>
                        `).join('')}
                    </div>
                </div>` : ''}

                <div class="mt-auto pt-5 border-t border-gray-800/50 flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <span class="text-[9px] font-black text-gray-500 uppercase tracking-tighter">
                                ${hasVars ? 'Preço' : 'Preço'}
                            </span>
                            <p class="text-2xl font-black text-accent font-mono">
                                <span class="text-xs mr-0.5">R$</span>${parseFloat(displayPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
}


        function renderSection(title, products, container, targetView, cat, sub = null) {
            const section = document.createElement('div');
            section.className = "animate-in";
            section.innerHTML = `
                <div class="flex items-center justify-between mb-6 px-1">
                    <h3 class="text-xs font-black uppercase tracking-[0.3em] text-gray-500">${title}</h3>
                    <button onclick="changeView('${targetView}', '${cat}', '${sub || ''}')" class="text-[9px] font-black text-accent border border-accent/20 px-4 py-1.5 rounded-full uppercase hover:bg-accent hover:text-black transition-all">Ver Tudo</button>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">${products.map(p => renderCard(p)).join('')}</div>`;
            container.appendChild(section);
        }

        function renderGrid(products, container) {
            const grid = document.createElement('div');
            grid.className = "grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 animate-in";
            grid.innerHTML = products.map(p => renderCard(p)).join('');
            container.appendChild(grid);
        }

        function renderEmpty(container) {
            container.innerHTML = `<div class="py-20 text-center"><p class="text-gray-500 font-black uppercase text-xs">Sem resultados para os filtros selecionados.</p></div>`;
        }

        function renderPager(current, total, footer) {
            footer.innerHTML = `<div class="flex items-center gap-4 bg-card border border-gray-800 p-2 rounded-2xl"><button onclick="goToPage(${current - 1})" ${current === 1 ? 'disabled' : ''} class="px-4 py-2 disabled:opacity-20 text-accent font-black">◀</button><span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">${current} de ${total}</span><button onclick="goToPage(${current + 1})" ${current === total ? 'disabled' : ''} class="px-4 py-2 disabled:opacity-20 text-accent font-black">▶</button></div>`;
        }

        function goToPage(p) { currentPage = p; render(); window.scrollTo({ top: 400, behavior: 'smooth' }); }
        

        init();