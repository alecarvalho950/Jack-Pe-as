let currentOptions = [];
let deleteId = null;
let editingId = null; // Agora armazenará a String do _id do MongoDB

// --- AO CARREGAR A PÁGINA ---
document.addEventListener('DOMContentLoaded', () => {
    loadTargetCategories();
    loadAttributesList();
});

// 1. Alterna a exibição das opções baseado no tipo
function toggleOptionInput() {
    const type = document.getElementById('attr-type').value;
    const group = document.getElementById('options-group-container');
    
    if (type === 'text') {
        group.classList.add('hidden');
        currentOptions = [];
        renderOptions();
    } else {
        group.classList.remove('hidden');
    }
}

// 2. Carrega as categorias no <select>
async function loadTargetCategories() {
    try {
        const res = await fetch('http://localhost:3000/api/categories');
        const cats = await res.json();
        const select = document.getElementById('attr-target-cat');
        
        select.innerHTML = '<option value="">Selecione a Categoria</option>';
        cats.forEach(c => {
            select.innerHTML += `<option value="${c.name}">${c.name}</option>`;
        });
    } catch (err) {
        console.error("Erro ao carregar categorias:", err);
    }
}

// 3. Gestão de Tags de Opções
function addOptionToList() {
    const input = document.getElementById('new-option-input');
    const val = input.value.trim();
    
    if (val && !currentOptions.includes(val)) {
        currentOptions.push(val);
        renderOptions();
        input.value = '';
        input.focus();
    }
}

function removeOption(option) {
    currentOptions = currentOptions.filter(o => o !== option);
    renderOptions();
}

function renderOptions() {
    const container = document.getElementById('options-tags');
    container.innerHTML = currentOptions.map(opt => `
        <span class="bg-accent/20 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 font-bold animate-in fade-in duration-300">
            ${opt}
            <button onclick="removeOption('${opt}')" class="text-white hover:text-red-500 transition">×</button>
        </span>
    `).join('');
}

// --- LÓGICA DE EDIÇÃO ---

function editAttribute(attrJson) {
    const attr = JSON.parse(decodeURIComponent(attrJson));
    editingId = attr._id; // AJUSTE: Usando _id do MongoDB

    document.getElementById('form-title').innerText = "Editar Atributo";
    const saveBtn = document.getElementById('save-btn');
    saveBtn.innerText = "Atualizar Atributo";
    saveBtn.classList.replace('bg-accent', 'bg-blue-600');
    saveBtn.classList.replace('text-black', 'text-white');
    document.getElementById('cancel-btn').classList.remove('hidden');

    document.getElementById('attr-target-cat').value = attr.category;
    document.getElementById('attr-name').value = attr.name;
    document.getElementById('attr-type').value = attr.type;
    currentOptions = [...(attr.options || [])];

    toggleOptionInput();
    renderOptions();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
    editingId = null;
    currentOptions = [];
    
    document.getElementById('form-title').innerText = "Novo Atributo";
    const saveBtn = document.getElementById('save-btn');
    saveBtn.innerText = "Gravar Atributo no Sistema";
    saveBtn.classList.replace('bg-blue-600', 'bg-accent');
    saveBtn.classList.replace('text-white', 'text-black');
    document.getElementById('cancel-btn').classList.add('hidden');
    
    document.getElementById('attr-name').value = '';
    document.getElementById('attr-target-cat').value = '';
    document.getElementById('attr-type').value = 'select';
    
    toggleOptionInput();
    renderOptions();
}

// --- SALVAR / LISTAR / EXCLUIR ---

async function saveFullAttribute() {
    const category = document.getElementById('attr-target-cat').value;
    const name = document.getElementById('attr-name').value;
    const type = document.getElementById('attr-type').value;

    if (!category || !name) return alert("Preencha os campos obrigatórios.");
    if (type === 'select' && currentOptions.length === 0) return alert("Adicione opções para a lista de seleção.");

    const payload = { category, name, type, options: type === 'text' ? [] : currentOptions };
    
    // AJUSTE: A URL agora usa o _id para o PUT
    const url = editingId ? `http://localhost:3000/api/attributes/${editingId}` : 'http://localhost:3000/api/attributes';
    const method = editingId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            cancelEdit();
            loadAttributesList();
        }
    } catch (err) {
        console.error("Erro ao salvar atributo:", err);
    }
}

async function loadAttributesList() {
    try {
        const [resAttr, resCats] = await Promise.all([
            fetch('http://localhost:3000/api/attributes'),
            fetch('http://localhost:3000/api/categories')
        ]);
        
        const attrs = await resAttr.json();
        const cats = await resCats.json();
        const container = document.getElementById('attributes-list-display');
        container.innerHTML = '';

        cats.forEach(cat => {
            const catAttrs = attrs.filter(a => a.category === cat.name);
            if (catAttrs.length === 0) return;

            let sectionHtml = `
                <div class="mb-10 animate-in slide-in-from-bottom-2 duration-500">
                    <h3 class="text-accent font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-3">
                        <span class="w-10 h-[1px] bg-accent/30"></span> ${cat.name}
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            `;

            catAttrs.forEach(attr => {
                const data = encodeURIComponent(JSON.stringify(attr));
                
                sectionHtml += `
                    <div class="bg-[#111827] p-5 rounded-xl border border-gray-800 flex justify-between items-start group hover:border-accent/50 transition">
                        <div>
                            <div class="flex items-center gap-2">
                                <h4 class="text-lg font-bold text-white">${attr.name}</h4>
                                <span class="text-[9px] px-2 py-0.5 rounded bg-gray-800 text-gray-400 font-bold border border-gray-700 uppercase">
                                    ${attr.type === 'text' ? '⌨️ Manual' : '🖱️ Seleção'}
                                </span>
                            </div>
                            <div class="flex flex-wrap gap-1.5 mt-3">
                                ${attr.type === 'text' 
                                    ? '<span class="text-xs italic text-gray-600">Campo de digitação livre</span>'
                                    : (attr.options || []).map(opt => `<span class="text-[10px] bg-gray-800/50 text-gray-400 px-2 py-1 rounded border border-gray-700/50">${opt}</span>`).join('')
                                }
                            </div>
                        </div>
                        <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <button onclick="editAttribute('${data}')" class="p-2 hover:bg-blue-500/10 rounded-lg text-gray-500 hover:text-blue-400 transition">✏️</button>
                            <button onclick="askDelete('${attr._id}', '${attr.name}')" class="p-2 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-500 transition">🗑️</button>
                        </div>
                    </div>
                `;
            });

            sectionHtml += `</div></div>`;
            container.innerHTML += sectionHtml;
        });
    } catch (err) {
        console.error("Erro ao carregar lista agrupada:", err);
    }
}

// Modal Customizado
function askDelete(id, name) {
    deleteId = id; // Agora é uma string
    document.getElementById('confirm-msg').innerHTML = `Excluir o atributo <strong>${name}</strong>?`;
    document.getElementById('custom-confirm').classList.replace('hidden', 'flex');
}

async function closeConfirm(confirmado) {
    if (confirmado && deleteId) {
        try {
            const res = await fetch(`http://localhost:3000/api/attributes/${deleteId}`, { method: 'DELETE' });
            if (res.ok) loadAttributesList();
        } catch (err) {
            console.error("Erro ao deletar:", err);
        }
    }
    document.getElementById('custom-confirm').classList.replace('flex', 'hidden');
    deleteId = null;
}

// Vincula o evento ao botão de confirmação do seu HTML
document.getElementById('confirm-yes').onclick = () => closeConfirm(true);

document.getElementById('new-option-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addOptionToList(); }
});