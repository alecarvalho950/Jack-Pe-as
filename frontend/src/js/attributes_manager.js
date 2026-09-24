let currentOptions = []; // Cada item pode ser: "Texto", { name: "...", color: { bg, text, border } }
let deleteId = null;
let editingId = null; 
let editingOptionIndex = null;
const API_BASE_URL = "https://api.jackpecas.com.br";

// --- AO CARREGAR A PÁGINA ---
document.addEventListener('DOMContentLoaded', () => {
    loadTargetCategories();
    loadAttributesList();
    updatePreviewTag();

    const confirmBtn = document.getElementById('confirm-yes');
    if (confirmBtn) {
        confirmBtn.onclick = () => closeConfirm(true);
    }
});

// --- HELPER DE COMPATIBILIDADE PARA RENDERIZAÇÃO DE CORES ---
function getOptionStyleAndClass(opt) {
    if (!opt) return { className: 'bg-gray-800 text-gray-200 border-gray-700 border', style: '' };
    if (typeof opt === 'string') return { className: 'bg-gray-800 text-gray-200 border-gray-700 border', style: '' };

    const c = opt.color;
    if (!c) return { className: 'bg-gray-800 text-gray-200 border-gray-700 border', style: '' };

    if (typeof c.bg === 'string' && c.bg.startsWith('bg-')) {
        return { className: `${c.bg} ${c.text || ''} ${c.border || ''} border`, style: '' };
    }

    return {
        className: 'border',
        style: `background-color: ${c.bg}; color: ${c.text}; border-color: ${c.border};`
    };
}

function editOption(idx) {
    const opt = currentOptions[idx];
    if (!opt) return;

    const name = typeof opt === 'string' ? opt : (opt.name || '');
    const color = (typeof opt === 'object' && opt.color) ? opt.color : { text: '#ffffff', bg: '#000000', border: '#ffffff' };

    document.getElementById('new-option-input').value = name;
    document.getElementById('opt-text-color').value = color.text || '#ffffff';
    document.getElementById('opt-bg-color').value = color.bg || '#000000';
    document.getElementById('opt-border-color').value = color.border || '#ffffff';

    updatePreviewTag();
    editingOptionIndex = idx;
}

function updatePreviewTag() {
    const textColor = document.getElementById('opt-text-color')?.value || '#38bdf8';
    const bgColor = document.getElementById('opt-bg-color')?.value || '#0f172a';
    const borderColor = document.getElementById('opt-border-color')?.value || '#38bdf8';
    
    const preview = document.getElementById('preview-tag');
    if (preview) {
        preview.style.backgroundColor = bgColor;
        preview.style.color = textColor;
        preview.style.borderColor = borderColor;
    }
}

// --- CONTROLE DE INTERFACE ---
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
    editingOptionIndex = null;
    
    editingId = null;
    currentOptions = [];
    document.getElementById('attr-name').value = '';
    document.getElementById('attr-target-cat').value = '';
    document.getElementById('attr-type').value = 'select';
    document.getElementById('new-option-input').value = '';
    
    const saveBtn = document.getElementById('save-btn');
    saveBtn.innerText = "Salvar Atributo";
    saveBtn.classList.remove('bg-blue-600', 'text-white');
    saveBtn.classList.add('bg-accent', 'text-black');
    
    toggleOptionInput();
    renderOptions();
}

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

// --- GESTÃO DAS OPÇÕES ---
function addOptionToList() {
    const input = document.getElementById('new-option-input');
    const val = input.value.trim();
    
    if (!val) return;

    const textColor = document.getElementById('opt-text-color')?.value || '#ffffff';
    const bgColor = document.getElementById('opt-bg-color')?.value || '#000000';
    const borderColor = document.getElementById('opt-border-color')?.value || '#ffffff';

    if (editingOptionIndex !== null) {
        // Atualiza a opção existente
        currentOptions[editingOptionIndex] = {
            name: val,
            color: { text: textColor, bg: bgColor, border: borderColor }
        };
        editingOptionIndex = null;
    } else {
        // Previne duplicatas ao adicionar
        const exists = currentOptions.some(o => {
            const oName = typeof o === 'string' ? o : (o ? o.name : '');
            return oName.toLowerCase() === val.toLowerCase();
        });

        if (exists) {
            alert("Esta opção já existe!");
            return;
        }

        currentOptions.push({
            name: val,
            color: { text: textColor, bg: bgColor, border: borderColor }
        });
    }

    renderOptions();
    input.value = '';
    input.focus();
}

function removeOption(idx) {
    currentOptions.splice(idx, 1);
    
    // Reseta o form caso estivesse editando a opção excluída
    if (editingOptionIndex === idx) {
        editingOptionIndex = null;
        document.getElementById('new-option-input').value = '';
    } else if (editingOptionIndex !== null && editingOptionIndex > idx) {
        editingOptionIndex--;
    }
    
    renderOptions();
}

function renderOptions() {
    const container = document.getElementById('options-tags');
    if (!container) return;

    container.innerHTML = currentOptions.map((opt, idx) => {
        if (!opt) return ''; // Proteção contra nulos
        const name = typeof opt === 'string' ? opt : (opt.name || 'Sem Nome');
        const visual = getOptionStyleAndClass(opt);

        // Adicionado o onclick para editar, cursor-pointer e event.stopPropagation no botão de excluir
        return `
            <span class="${visual.className} px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 font-bold cursor-pointer hover:opacity-80 transition group title="Clique para editar"" style="${visual.style}" onclick="editOption(${idx})">
                ${name}
                <button type="button" onclick="event.stopPropagation(); removeOption(${idx})" class="hover:text-red-500 transition ml-1 opacity-50 group-hover:opacity-100 font-black">×</button>
            </span>
        `;
    }).join('');
}

// --- EDIÇÃO DE ATRIBUTO EXISTENTE ---
function editAttribute(attrJson) {
    const attr = JSON.parse(decodeURIComponent(attrJson));
    editingId = attr._id; 

    openAttrForm();

    document.getElementById('form-title').innerText = "Editar Atributo";
    const saveBtn = document.getElementById('save-btn');
    saveBtn.innerText = "Atualizar Atributo";
    saveBtn.classList.remove('bg-accent', 'text-black');
    saveBtn.classList.add('bg-blue-600', 'text-white');

    document.getElementById('attr-target-cat').value = attr.category;
    document.getElementById('attr-name').value = attr.name;
    document.getElementById('attr-type').value = attr.type;
    
    // Preserva o array de opções existendo formato novo ou antigo
    currentOptions = attr.options || [];

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
                
                let optionsHtml = '';
                if (attr.type === 'text') {
                    optionsHtml = '<span class="text-xs italic text-gray-600">Campo de digitação livre</span>';
                } else {
                    optionsHtml = (attr.options || []).map(opt => {
                        if (!opt) return ''; 
                        const optName = typeof opt === 'string' ? opt : (opt.name || 'Indefinido');
                        const visual = getOptionStyleAndClass(opt);
                        return `<span class="text-[10px] ${visual.className} px-2 py-1 rounded font-bold" style="${visual.style}">${optName}</span>`;
                    }).join('');
                    
                    if (!optionsHtml) optionsHtml = '<span class="text-[10px] text-gray-500 italic">Nenhuma opção configurada</span>';
                }

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
                                ${optionsHtml}
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
    const modal = document.getElementById('custom-confirm');
    const btnConfirm = document.getElementById('confirm-yes');

    if (confirmado && deleteId) {
        const token = localStorage.getItem('admin_token');

        try {
            if (btnConfirm) {
                btnConfirm.disabled = true;
                btnConfirm.innerHTML = `EXCLUINDO...`;
            }

            const res = await fetch(`${API_BASE_URL}/api/attributes/${deleteId}`, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                modal.classList.replace('flex', 'hidden');
                loadAttributesList();
            } else {
                alert("Erro ao excluir atributo.");
            }
        } catch (err) {
            console.error("Erro ao deletar:", err);
        } finally {
            if (btnConfirm) {
                btnConfirm.disabled = false;
                btnConfirm.innerText = "Sim, excluir";
            }
            deleteId = null;
        }
    } else {
        modal.classList.replace('flex', 'hidden');
        deleteId = null;
    }
}

document.getElementById('new-option-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { 
        e.preventDefault(); 
        addOptionToList(); 
    }
});