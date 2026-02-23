let currentOptions = [];
let deleteId = null;
let editingId = null; 
const API_BASE_URL = "https://jack-pe-as-production.up.railway.app";

// --- AO CARREGAR A PÁGINA ---
document.addEventListener('DOMContentLoaded', () => {
    loadTargetCategories();
    loadAttributesList();

    // Vinculação segura do botão de confirmação
    const confirmBtn = document.getElementById('confirm-yes');
    if (confirmBtn) {
        confirmBtn.onclick = () => closeConfirm(true);
    }
});

// --- CONTROLE DE INTERFACE (ABRIR/FECHAR) ---

function openAttrForm() {
    document.getElementById('attr-form-container').classList.remove('hidden');
    document.getElementById('btn-open-attr-form').classList.add('hidden');
    if (!editingId) {
        document.getElementById('form-title').innerText = "Novo Atributo";
    }
}

function closeAttrForm() {
    document.getElementById('attr-form-container').classList.add('hidden');
    document.getElementById('btn-open-attr-form').classList.remove('hidden');
    
    // Reset de estado e campos
    editingId = null;
    currentOptions = [];
    document.getElementById('attr-name').value = '';
    document.getElementById('attr-target-cat').value = '';
    document.getElementById('attr-type').value = 'select';
    document.getElementById('new-option-input').value = '';
    
    // Reset visual do botão
    const saveBtn = document.getElementById('save-btn');
    saveBtn.innerText = "Salvar Atributo";
    saveBtn.classList.remove('bg-blue-600', 'text-white');
    saveBtn.classList.add('bg-accent', 'text-black');
    
    toggleOptionInput();
    renderOptions();
}

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
        const res = await fetch(`${API_BASE_URL}/api/categories`);
        const cats = await res.json();
        const select = document.getElementById('attr-target-cat');
        if (!select) return;
        
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
        <span class="bg-accent/20 text-accent border border-accent/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 font-bold">
            ${opt}
            <button onclick="removeOption('${opt}')" class="text-white hover:text-red-500 transition">×</button>
        </span>
    `).join('');
}

// --- LÓGICA DE EDIÇÃO ---

function editAttribute(attrJson) {
    const attr = JSON.parse(decodeURIComponent(attrJson));
    editingId = attr._id; 

    openAttrForm(); // Abre o container primeiro

    document.getElementById('form-title').innerText = "Editar Atributo";
    const saveBtn = document.getElementById('save-btn');
    saveBtn.innerText = "Atualizar Atributo";
    saveBtn.classList.remove('bg-accent', 'text-black');
    saveBtn.classList.add('bg-blue-600', 'text-white');

    document.getElementById('attr-target-cat').value = attr.category;
    document.getElementById('attr-name').value = attr.name;
    document.getElementById('attr-type').value = attr.type;
    currentOptions = [...(attr.options || [])];

    toggleOptionInput();
    renderOptions();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- SALVAR / LISTAR / EXCLUIR ---

async function saveFullAttribute() {
    const category = document.getElementById('attr-target-cat').value;
    const name = document.getElementById('attr-name').value;
    const type = document.getElementById('attr-type').value;
    const saveBtn = document.getElementById('save-btn');
    const originalBtnText = saveBtn.innerHTML;

    if (!category || !name) return alert("Preencha os campos obrigatórios.");
    if (type === 'select' && currentOptions.length === 0) return alert("Adicione opções para a lista de seleção.");

    try {
        // 2. Bloqueio e Carregamento no Botão
        saveBtn.disabled = true;
        saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
        saveBtn.innerHTML = `
            <svg class="animate-spin h-4 w-4 mr-2 border-t-2 border-white rounded-full inline-block" viewBox="0 0 24 24"></svg>
            SALVANDO...
        `;

        const payload = { category, name, type, options: type === 'text' ? [] : currentOptions };
        const url = editingId ? `${API_BASE_URL}/api/attributes/${editingId}` : `${API_BASE_URL}/api/attributes`;
        const method = editingId ? 'PUT' : 'POST';
        const token = localStorage.getItem('admin_token');

        const res = await fetch(url, {
            method: method,
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeAttrForm(); 
            loadAttributesList();
        } else if (res.status === 401 || res.status === 403) {
            alert("Sua sessão expirou. Por favor, faça login novamente.");
            window.location.href = 'login.html';
        } else {
            const errorData = await res.json();
            alert("Erro ao salvar: " + (errorData.message || "Erro interno"));
        }
    } catch (err) {
        console.error("Erro ao salvar atributo:", err);
        alert("Erro de conexão com o servidor.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        saveBtn.innerHTML = originalBtnText;
    }
}

async function loadAttributesList() {
    const container = document.getElementById('attributes-list-display');
    if (container) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center p-12 gap-4">
                <span class="loader"></span>
                <p class="text-gray-400 animate-pulse font-bold">Buscando atributos no servidor...</p>
            </div>
        `;
    }

    try {
        const [resAttr, resCats] = await Promise.all([
            fetch(`${API_BASE_URL}/api/attributes`),
            fetch(`${API_BASE_URL}/api/categories`)
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
                    <div class="bg-[#111827] p-5 rounded-xl border border-gray-800 flex justify-between items-start group hover:border-accent/50 transition shadow-lg">
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
                        <div class="flex gap-2">
                            <button onclick="editAttribute('${data}')" 
                                class="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl hover:bg-blue-500 hover:text-white transition-all duration-300">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>

                            <button onclick="askDelete('${attr._id}', '${attr.name}')" 
                                class="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all duration-300">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            });

            sectionHtml += `</div></div>`;
            container.innerHTML += sectionHtml;
        });
    } catch (err) {
        console.error("Erro ao carregar lista agrupada:", err);
        if(container) container.innerHTML = '<p class="text-center text-red-500 p-8">Erro ao conectar com o servidor.</p>';
    }
}

function askDelete(id, name) {
    deleteId = id; 
    document.getElementById('confirm-msg').innerHTML = `Excluir o atributo <strong>${name}</strong>?`;
    const modal = document.getElementById('custom-confirm');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

async function closeConfirm(confirmado) {
    if (confirmado && deleteId) {

        const token = localStorage.getItem('admin_token');

        try {
            const res = await fetch(`${API_BASE_URL}/api/attributes/${deleteId}`, { 
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                loadAttributesList();
            } else if (res.status === 401 || res.status === 403) {
                alert("Sessão expirada. Faça login novamente.");
                window.location.href = 'login.html';
            }
        } catch (err) {
            console.error("Erro ao deletar:", err);
        }
    }
    const modal = document.getElementById('custom-confirm');
    modal.classList.remove('flex');
    modal.classList.add('hidden');
    deleteId = null;
}

// Escuta a tecla Enter no input de opções
document.getElementById('new-option-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { 
        e.preventDefault(); 
        addOptionToList(); 
    }
});