const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
require('dotenv').config();
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');
const axios    = require('axios');

const app  = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// RATE LIMITER + RETRY
// ============================================================

const MAX_CONCURRENT = 2;
const BASE_DELAY_MS  = 600;
const MAX_RETRIES    = 4;
const RETRY_BASE_MS  = 1000;

let activeCalls = 0;

async function blingRequest(config, retries = 0) {
    while (activeCalls >= MAX_CONCURRENT) {
        await sleep(100);
    }
    activeCalls++;
    try {
        await sleep(BASE_DELAY_MS);
        return await axios(config);
    } catch (err) {
        const status = err.response?.status;
        if ((status === 429 || status >= 500) && retries < MAX_RETRIES) {
            const waitMs = RETRY_BASE_MS * Math.pow(2, retries);
            console.warn(`⚠️  Bling ${status}. Retry ${retries + 2}/${MAX_RETRIES + 1} em ${waitMs}ms...`);
            await sleep(waitMs);
            activeCalls--;
            return blingRequest(config, retries + 1);
        }
        throw err;
    } finally {
        activeCalls--;
    }
}

// O Bling exige que o retorno do webhook seja imediato
// Para eventos em lote da v3, criamos uma fila ou processamos em paralelo sem travar o response do Express
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runInBatches(tasks, batchSize = MAX_CONCURRENT) {
    const results = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize).map(fn => fn());
        results.push(...await Promise.allSettled(batch));
    }
    return results;
}

// ============================================================
// BANCO DE DADOS
// ============================================================

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Conectado ao MongoDB Atlas para JACK PEÇAS!");
    })
    .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

// ============================================================
// SCHEMAS E MODELOS
// ============================================================

const BlingToken = mongoose.model('BlingToken', new mongoose.Schema({
    access_token:  String,
    refresh_token: String,
    expires_at:    Date
}));

const Category = mongoose.model('Category', new mongoose.Schema({
    name:          { type: String, required: true },
    subcategories: [String]
}));

const Attribute = mongoose.model('Attribute', new mongoose.Schema({
    category: String,
    name:     String,
    type:     String,
    options:  [String]
}));

const variationItemSchema = new mongoose.Schema({
    sku:   { type: String },
    name:  { type: String },
    price: { type: Number, default: 0 },
    stock_by_store: {
        SaoRoque: { type: Number, default: 0 },
        Cotia:    { type: Number, default: 0 },
        Ibiuna:   { type: Number, default: 0 }
    },
    type:  { type: String },
    value: { type: String }
}, { _id: false });

const productSchema = new mongoose.Schema({
    blingId:  { type: String, unique: true, sparse: true },
    sku:      { type: String },
    name:     { type: String, required: true },
    price:    { type: Number, required: true },
    stock_by_store: {
        SaoRoque: { type: Number, default: 0 },
        Cotia:    { type: Number, default: 0 },
        Ibiuna:   { type: Number, default: 0 }
    },
    category:      { type: String },
    subcategory:   { type: String },
    hasVariations: { type: Boolean, default: false },
    variations:    [variationItemSchema],
    attributes:    { type: Map, of: String, default: {} },
    createdAt:     { type: Date, default: Date.now },
    updatedAt:     { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', productSchema);

const Analytics = mongoose.model('Analytics', (() => {
    const s = new mongoose.Schema({
        type:      { type: String, required: true, enum: ['pageview', 'click_whatsapp', 'select_store'] },
        location:  { type: String, required: true, enum: ['sao_roque', 'cotia', 'ibiuna', 'geral'], default: 'geral' },
        isNewUser: { type: Boolean, required: true, default: false },
        createdAt: { type: Date, default: Date.now }
    });
    s.index({ createdAt: 1 });
    return s;
})());

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function mapStoreKey(depositName) {
    const n = String(depositName).toUpperCase();
    if (n.includes("SÃO ROQUE") || n.includes("SAO ROQUE")) return "SaoRoque";
    if (n.includes("COTIA"))                                 return "Cotia";
    if (n.includes("IBIÚNA") || n.includes("IBIUNA"))       return "Ibiuna";
    return null;
}

function mapCategory(productName) {
    const n = productName.toUpperCase();
    let cat = null, sub = null;

    if ((n.includes("TELA FRONTAL") || n.includes("FRONTAL")) && !n.includes("FLEX CÂMERA")) {
        cat = "Telas";
        if      (n.includes("IPHONE"))                                          sub = "Telas Iphone";
        else if (n.includes("SAMSUNG"))                                         sub = "Telas Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))                  sub = "Telas Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Telas Xiaomi";
        else if (n.includes("REALME"))                                          sub = "Telas Realme";
        else if (n.includes("INFINIX"))                                         sub = "Telas Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))                   sub = "Telas Asus";
        else if (n.includes("LG"))                                              sub = "Telas LG";
        else if (n.includes("OPPO"))                                            sub = "Telas Oppo";
    } else if (n.includes("BATERIA")) {
        cat = "Baterias";
        if      (n.includes("IPHONE"))                                          sub = "Baterias Iphone";
        else if (n.includes("SAMSUNG"))                                         sub = "Baterias Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))                  sub = "Baterias Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Baterias Xiaomi";
        else if (n.includes("REALME"))                                          sub = "Baterias Realme";
        else if (n.includes("INFINIX"))                                         sub = "Baterias Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))                   sub = "Baterias Asus";
        else if (n.includes("LG"))                                              sub = "Baterias LG";
    } else if (n.includes("PLACA DE CARGA")) {
        cat = "Placas de Carga";
        if      (n.includes("SAMSUNG"))                                         sub = "Placa de Carga Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))                  sub = "Placa de Carga Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Placa de Carga Xiaomi";
        else if (n.includes("REALME"))                                          sub = "Placa de Carga Realme";
        else if (n.includes("INFINIX"))                                         sub = "Placa de Carga Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))                   sub = "Placa de Carga Asus";
        else if (n.includes("LG"))                                              sub = "Placa de Carga LG";
    } else if (n.includes("CONECTOR DE CARGA") || n.includes("FLEX DE CARGA")) {
        cat = "Conector de Carga";
        if      (n.includes("SAMSUNG"))                                         sub = "Conector de Carga Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))                  sub = "Conector de Carga Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Conector de Carga Xiaomi";
        else if (n.includes("REALME"))                                          sub = "Conector de Carga Realme";
        else if (n.includes("INFINIX"))                                         sub = "Conector de Carga Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))                   sub = "Conector de Carga Asus";
        else if (n.includes("LG"))                                              sub = "Conector de Carga LG";
        else if (n.includes("IPHONE"))                                          sub = "Flex de Carga Iphone";
    } else if (n.includes("TAMPA")) {
        cat = "Tampas Traseiras";
        if      (n.includes("SAMSUNG"))                                         sub = "Tampa Traseira Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))                  sub = "Tampa Traseira Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Tampa Traseira Xiaomi";
        else if (n.includes("REALME"))                                          sub = "Tampa Traseira Realme";
        else if (n.includes("INFINIX"))                                         sub = "Tampa Traseira Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))                   sub = "Tampa Traseira Asus";
        else if (n.includes("LG"))                                              sub = "Tampa Traseira LG";
        else if (n.includes("IPHONE"))                                          sub = "Tampa Traseira Iphone";
    } else if (n.includes("CABO") || n.includes("CARREGADOR") || n.includes("FONTE") || n.includes("FONE DE OUVIDO") || n.includes("CAIXA DE SOM")) {
        cat = "Acessórios";
        if      (n.includes("FONTE CARREGADOR") || n.includes("FONTE")) sub = "Fontes";
        else if (n.includes("CARREGADOR"))                              sub = "Carregadores";
        else if (n.includes("CABO"))                                    sub = "Cabos";
        else if (n.includes("FONE DE OUVIDO"))                          sub = "Fones de Ouvido";
        else if (n.includes("CAIXA DE SOM"))                            sub = "Caixa de som";
    }
    return { cat, sub };
}

// ============================================================
// TOKEN DO BLING
// ============================================================

async function getValidAccessToken() {
    const tokenData = await BlingToken.findOne();
    if (!tokenData?.access_token) throw new Error("Sem credenciais Bling no banco.");

    if (!tokenData.expires_at || new Date(Date.now() + 60000) > tokenData.expires_at) {
        console.log("🔄 Token Bling expirado. Renovando...");
        const credentials = Buffer.from(
            `${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`
        ).toString('base64');
        const res = await blingRequest({
            method: 'POST',
            url: 'https://api.bling.com.br/v3/oauth/token',
            data: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokenData.refresh_token }),
            headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const { access_token, refresh_token, expires_in } = res.data;
        tokenData.access_token  = access_token;
        tokenData.refresh_token = refresh_token;
        tokenData.expires_at    = new Date(Date.now() + expires_in * 1000);
        await tokenData.save();
        console.log("✅ Token Bling renovado!");
        return access_token;
    }
    return tokenData.access_token;
}

// ============================================================
// ESTOQUE POR DEPÓSITO
// ============================================================

async function fetchStockForChunk(productIds, depositosAtivos, accessToken) {
    const estoqueMap = {};
    const tasks = depositosAtivos
        .filter(dep => mapStoreKey(dep.descricao))
        .map(dep => async () => {
            const storeKey = mapStoreKey(dep.descricao);
            const query    = productIds.map(id => `idsProdutos[]=${id}`).join('&');
            try {
                const res = await blingRequest({
                    method: 'GET',
                    url: `https://api.bling.com.br/v3/estoques/saldos/${dep.id}?${query}&filtroSaldoEstoque=1`,
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                (res.data.data || []).forEach(item => {
                    if (!item.produto?.id) return;
                    const prodId = String(item.produto.id);
                    if (!estoqueMap[prodId]) estoqueMap[prodId] = { SaoRoque: 0, Cotia: 0, Ibiuna: 0 };
                    estoqueMap[prodId][storeKey] += Number(item.saldoFisicoTotal || 0);
                });
            } catch { /* depósito vazio — ignora */ }
        });
    await runInBatches(tasks, MAX_CONCURRENT);
    return estoqueMap;
}

// ============================================================
// SINCRONIZAÇÃO COMPLETA (backup diário + trigger manual)
// ============================================================

let isSyncing = false;

async function syncProductsFromBling() {
    if (isSyncing) {
        console.log("⚠️  Sync já em andamento. Ignorada.");
        return;
    }
    isSyncing = true;
    console.log("🔄 [SYNC COMPLETA] Iniciando...");

    try {
        const accessToken = await getValidAccessToken();

        let pagina = 1;
        let productsFromBling = [];
        while (true) {
            try {
                const res = await blingRequest({
                    method: 'GET',
                    url: `https://api.bling.com.br/v3/produtos?limite=100&pagina=${pagina}&criterio=1&tipo=P`,
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const page = res.data.data || [];
                if (page.length === 0) break;
                productsFromBling = productsFromBling.concat(page);
                console.log(`📑 Página ${pagina} → ${page.length} itens`);
                pagina++;
            } catch {
                console.error(`❌ Erro na página ${pagina}. Encerrando paginação.`);
                break;
            }
        }

        if (productsFromBling.length === 0) {
            console.log("ℹ️ Nenhum produto retornado pelo Bling.");
            return;
        }
        console.log(`✅ Total bruto: ${productsFromBling.length} itens`);

        const resDepositos = await blingRequest({
            method: 'GET',
            url: 'https://api.bling.com.br/v3/depositos?situacao=1&limite=100',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const depositosAtivos = resDepositos.data.data || [];

        const produtosSimples = productsFromBling.filter(p => p.formato !== 'V');
        const estoqueMapSimples = {};
        const CHUNK_SIZE = 50;
        for (let i = 0; i < produtosSimples.length; i += CHUNK_SIZE) {
            const chunk = produtosSimples.slice(i, i + CHUNK_SIZE);
            Object.assign(estoqueMapSimples, await fetchStockForChunk(chunk.map(p => p.id), depositosAtivos, accessToken));
            console.log(`  ↳ Chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(produtosSimples.length / CHUNK_SIZE)}`);
        }

        const operations       = [];
        const ignoredProducts  = [];
        const idsBlingProcessados = [];

        for (const p of productsFromBling) {
            if (p.variacao?.produtoPai) continue;

            const currentBlingId = String(p.id);
            const { cat: finalCat, sub: finalSub } = mapCategory(p.nome);
            if (!finalCat || !finalSub) {
                ignoredProducts.push({ nome: p.nome, motivo: "Categoria não mapeada" });
                continue;
            }

            idsBlingProcessados.push(currentBlingId);
            const skuFinal = String(p.codigo || "").trim();

            if (p.formato === 'V') {
                let variationsMapped    = [];
                let totalStockByStorePai = { SaoRoque: 0, Cotia: 0, Ibiuna: 0 };
                let erroVariacao        = false;

                try {
                    const resVar = await blingRequest({
                        method: 'GET',
                        url: `https://api.bling.com.br/v3/produtos/variacoes/${p.id}`,
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    const filhos = resVar.data.data?.variacoes || [];
                    if (filhos.length > 0) {
                        const estoqueFilhosMap = await fetchStockForChunk(filhos.map(f => f.id), depositosAtivos, accessToken);
                        filhos.forEach(f => {
                            const fId       = String(f.id);
                            const itemStocks = estoqueFilhosMap[fId] || { SaoRoque: 0, Cotia: 0, Ibiuna: 0 };
                            totalStockByStorePai.SaoRoque += itemStocks.SaoRoque;
                            totalStockByStorePai.Cotia    += itemStocks.Cotia;
                            totalStockByStorePai.Ibiuna   += itemStocks.Ibiuna;

                            let tipoVariacao = "Opção", valorVariacao = f.variacao?.nome || "Padrão";
                            if (f.variacao?.nome?.includes(":")) {
                                const [tRaw, vRaw] = f.variacao.nome.split(":");
                                tipoVariacao  = tRaw.trim().charAt(0).toUpperCase() + tRaw.trim().slice(1).toLowerCase();
                                valorVariacao = vRaw.trim().charAt(0).toUpperCase() + vRaw.trim().slice(1).toLowerCase();
                            }
                            variationsMapped.push({
                                sku: String(f.codigo || "").trim() || `FILHO-${f.id}`,
                                name: f.nome, price: parseFloat(f.preco) || 0,
                                stock_by_store: itemStocks, type: tipoVariacao, value: valorVariacao
                            });
                        });
                    }
                } catch {
                    erroVariacao = true;
                    console.warn(`⚠️ Erro nas variações de "${p.nome}". Mantendo dados anteriores.`);
                }

                const updateFields = {
                    blingId: currentBlingId, sku: skuFinal || `PAI-${currentBlingId}`,
                    price: parseFloat(p.preco) || 0, category: finalCat, subcategory: finalSub,
                    hasVariations: true, updatedAt: new Date()
                };
                if (!erroVariacao) {
                    updateFields.variations     = variationsMapped;
                    updateFields.stock_by_store = totalStockByStorePai;
                }
                operations.push({ updateOne: {
                    filter: { blingId: currentBlingId },
                    update: { $set: updateFields, $unset: { image: "", stock: "" }, $setOnInsert: { name: p.nome, createdAt: new Date(), attributes: {} } },
                    upsert: true
                }});

            } else {
                const itemStocks = estoqueMapSimples[currentBlingId] || { SaoRoque: 0, Cotia: 0, Ibiuna: 0 };
                operations.push({ updateOne: {
                    filter: { blingId: currentBlingId },
                    update: {
                        $set: {
                            blingId: currentBlingId, sku: skuFinal || `SIMPLE-${currentBlingId}`,
                            price: parseFloat(p.preco) || 0, stock_by_store: itemStocks,
                            category: finalCat, subcategory: finalSub,
                            hasVariations: false, variations: [], updatedAt: new Date()
                        },
                        $unset: { image: "", stock: "" },
                        $setOnInsert: { name: p.nome, createdAt: new Date(), attributes: {} }
                    },
                    upsert: true
                }});
            }
        }

        if (operations.length > 0) {
            const result = await Product.bulkWrite(operations);
            console.log(`\n--- RELATÓRIO SYNC COMPLETA ---`);
            console.log(`📦 Operações:  ${operations.length}`);
            console.log(`✨ Inseridos:  ${result.upsertedCount}`);
            console.log(`🔄 Atualizados:${result.modifiedCount}`);
            console.log(`⚠️  Ignorados:  ${ignoredProducts.length}`);
            console.log(`-------------------------------\n`);
        }

        if (idsBlingProcessados.length > 0) {
            const limpeza = await Product.deleteMany({ blingId: { $not: { $in: idsBlingProcessados } } });
            if (limpeza.deletedCount > 0)
                console.log(`♻️ Auto-Clean: ${limpeza.deletedCount} produtos removidos.`);
        }

    } catch (error) {
        console.error("❌ Erro na sync completa:", error.response?.data || error.message);
    } finally {
        isSyncing = false;
        console.log("🔓 Sync completa finalizada.");
    }
}

// ============================================================
// CRON DIÁRIO — 03:00 como backup de consistência
// ============================================================

cron.schedule('0 3 * * *', () => {
    console.log("⏰ [CRON 03:00] Iniciando sync completa de backup...");
    syncProductsFromBling();
}, { timezone: "America/Sao_Paulo" });

console.log("✅ Cron de backup diário agendado para as 03:00 (America/Sao_Paulo).");

// ============================================================
// WEBHOOKS — Processamento de Eventos Bling API v3
// ============================================================

async function processStockWebhook(data) {
    try {
        const blingId  = data?.produto?.id     ? String(data.produto.id) : null;
        const sku      = data?.produto?.codigo || null;
        const depName  = data?.deposito?.descricao || "";
        const saldo    = Number(data?.saldoFisicoTotal ?? 0);
        const storeKey = mapStoreKey(depName);

        if (!storeKey) {
            console.log(`[Webhook/Estoque] Depósito "${depName}" não mapeado. Ignorado.`);
            return;
        }

        const query = blingId ? { blingId } : (sku ? { sku } : null);
        if (!query) {
            console.warn("[Webhook/Estoque] Payload sem produto.id ou produto.codigo. Ignorado.");
            return;
        }

        const produto = await Product.findOne(query);
        if (!produto) {
            console.warn(`[Webhook/Estoque] Produto ${blingId || sku} não encontrado no MongoDB.`);
            return;
        }

        if (produto.hasVariations && produto.variations?.length > 0) {
            // Se for variação (filho), o bling envia o SKU específico ou id correspondente
            const varIdx = produto.variations.findIndex(v =>
                v.sku === sku || (blingId && v.sku === String(blingId))
            );

            if (varIdx !== -1) {
                produto.variations[varIdx].stock_by_store[storeKey] = saldo;
            }

            const totalSR = produto.variations.reduce((a, v) => a + (v.stock_by_store?.SaoRoque ?? 0), 0);
            const totalCO = produto.variations.reduce((a, v) => a + (v.stock_by_store?.Cotia    ?? 0), 0);
            const totalIB = produto.variations.reduce((a, v) => a + (v.stock_by_store?.Ibiuna   ?? 0), 0);

            produto.stock_by_store = { SaoRoque: totalSR, Cotia: totalCO, Ibiuna: totalIB };
            produto.markModified('variations');
        } else {
            produto.stock_by_store[storeKey] = saldo;
        }

        produto.updatedAt = new Date();
        await produto.save();
        console.log(`✅ [Webhook/Estoque] Produto ${produto.name} | ${storeKey}: ${saldo} un.`);
    } catch (err) {
        console.error("[Webhook/Estoque] Erro no processamento:", err.message);
    }
}

async function processProductWebhook(data) {
    try {
        const blingId = data?.id ? String(data.id) : null;
        if (!blingId) {
            console.warn("[Webhook/Produto] Payload sem id. Ignorado.");
            return;
        }

        const produto = await Product.findOne({ blingId });
        if (!produto) {
            console.warn(`[Webhook/Produto] blingId ${blingId} não encontrado no MongoDB.`);
            return;
        }

        let atualizado = false;

        if (data.nome && data.nome !== produto.name) {
            produto.name = data.nome;
            atualizado   = true;
        }

        const novoPreco = parseFloat(data.preco);
        if (!isNaN(novoPreco) && novoPreco !== produto.price) {
            produto.price = novoPreco;
            atualizado    = true;

            if (produto.hasVariations && produto.variations?.length > 0) {
                produto.variations = produto.variations.map(v => ({ ...v, price: novoPreco }));
                produto.markModified('variations');
            }
        }

        if (data.codigo && data.codigo !== produto.sku) {
            produto.sku = data.codigo;
            atualizado  = true;
        }

        if (atualizado) {
            produto.updatedAt = new Date();
            await produto.save();
            console.log(`✅ [Webhook/Produto] "${produto.name}" atualizado (preço: ${produto.price}).`);
        } else {
            console.log(`[Webhook/Produto] blingId ${blingId} — nenhuma alteração relevante.`);
        }
    } catch (err) {
        console.error("[Webhook/Produto] Erro no processamento:", err.message);
    }
}

// ============================================================
// MIDDLEWARES
// ============================================================

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: "Token não fornecido." });
    try {
        const decoded = jwt.verify(token.split(' ')[1] || token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ message: "Sessão inválida." });
    }
};

// ============================================================
// ROTAS DE CRON AND MANUAL TRIGGER
// ============================================================

app.get('/api/cron/sync', async (req, res) => {
    if (isSyncing) {
        return res.status(200).json({ success: true, message: "Sync já em andamento." });
    }
    res.status(202).json({ success: true, message: "Sync iniciada em segundo plano." });
    syncProductsFromBling();
});

app.post('/api/trigger-sync', async (req, res) => {
    res.json({ message: "Sincronização disparada!", timestamp: new Date() });
    syncProductsFromBling();
});

// ============================================================
// AUTENTICAÇÃO BLING (OAuth)
// ============================================================

app.get('/auth/bling', (req, res) => {
    const clientId    = process.env.BLING_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.BLING_REDIRECT_URI);
    res.redirect(`https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("Código não encontrado.");
    try {
        const credentials = Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64');
        const response = await axios.post('https://www.bling.com.br/Api/v3/oauth/token',
            new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: process.env.BLING_REDIRECT_URI }),
            { headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const { access_token, refresh_token, expires_in } = response.data;
        await BlingToken.findOneAndUpdate({}, { access_token, refresh_token, expires_at: new Date(Date.now() + expires_in * 1000) }, { upsert: true });
        res.send("<h1>✅ Autorizado!</h1><p>JACK PEÇAS conectado ao Bling.</p>");
        syncProductsFromBling();
    } catch (error) {
        res.status(500).json(error.response?.data || error.message);
    }
});

// ============================================================
// ENDPOINT DO WEBHOOK DO BLING (Tratamento limpo da API v3)
// ============================================================
app.post('/api/webhooks/bling', (req, res) => {
    try {
        const { token } = req.query;
        if (!token || token !== process.env.BLING_WEBHOOK_SECRET) {
            console.warn("⚠️ [Webhook/Bling] Tentativa de acesso com token inválido.");
            return res.status(401).send("Não autorizado");
        }

        const payload = req.body;
        const tipoEvento = payload?.event; 
        const dadosEvento = payload?.data;

        console.log(`📥 [Webhook/Bling v3] Evento recebido: ${tipoEvento}`);

        // Retorna status 200 rápido exigido pelo Bling
        res.status(200).send("OK");

        if (!dadosEvento) return;

        // Processamento Assíncrono (sem await no response principal)
        if (tipoEvento === 'stock.updated' || tipoEvento === 'stock.created') {
            // v3 simplificado envia id, codigo, saldo e deposito direto em data ou encapsula em product. Mapeamos de acordo com processStockWebhook:
            const dadosAdaptados = {
                produto: {
                    id: dadosEvento.product?.id || dadosEvento.id,
                    codigo: dadosEvento.product?.code || dadosEvento.codigo || dadosEvento.sku
                },
                deposito: {
                    descricao: dadosEvento.deposit?.description || dadosEvento.deposito?.descricao || dadosEvento.depositName || "Geral"
                },
                saldoFisicoTotal: dadosEvento.balance ?? dadosEvento.saldo ?? dadosEvento.saldoFisicoTotal ?? 0
            };

            processStockWebhook(dadosAdaptados);
        } 
        else if (tipoEvento === 'product.updated' || tipoEvento === 'product.created') {
            processProductWebhook(dadosEvento);
        }

    } catch (error) {
        console.error("❌ Erro crítico na interceptação do webhook:", error.message);
    }
});

// ============================================================
// ROTAS DE PRODUTOS
// ============================================================

app.get('/api/products', async (req, res) => {
    try {
        const { page = 1, limit = 25, search, category, subcategory } = req.query;
        const skip  = (parseInt(page) - 1) * parseInt(limit);
        const query = {};
        if (category)    query.category    = category;
        if (subcategory) query.subcategory = subcategory;
        if (search) {
            const term = search.trim();
            query.$or  = [{ name: { $regex: term, $options: 'i' } }, { sku: term }];
        }
        
        const [products, total] = await Promise.all([
            Product.find(query).sort({ blingId: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Product.countDocuments(query)
        ]);

        // 🔥 LOG DE DIAGNÓSTICO DO BACK-END (Render Terminal)
        console.log("==================================================");
        console.log("📢 REQUISIÇÃO DISPARADA - ANALISANDO RETORNO DO BANCO");
        console.log(`Total de produtos correspondentes no MongoDB: ${total}`);
        if (products.length > 0) {
            console.log("Amostra do primeiro produto do array retornado:");
            console.log(`   -> Nome: ${products[0].name}`);
            console.log(`   -> SKU: ${products[0].sku}`);
            console.log(`   -> stock_by_store:`, JSON.stringify(products[0].stock_by_store));
        } else {
            console.log("⚠️ Nenhum produto foi retornado do banco de dados.");
        }
        console.log("==================================================");

        res.json({ products, total, pages: Math.ceil(total / limit), currentPage: parseInt(page) });
    } catch (error) {
        // 🛠️ Tratamento de erro robusto para capturar falhas ocultas de conexão do Mongoose
        console.error("❌ ERRO CRÍTICO NA ROTA /api/products:", error);
        res.status(500).json({ 
            message: "Erro ao carregar produtos", 
            error: error.message 
        });
    }
});

app.put('/api/products/:id', verifyToken, async (req, res) => {
    try {
        const data = { ...req.body };
        if (typeof data.variations === 'string') { try { data.variations = JSON.parse(data.variations); } catch { data.variations = []; } }
        if (typeof data.attributes === 'string') { try { data.attributes = JSON.parse(data.attributes); } catch { data.attributes = {}; } }
        else if (!data.attributes) data.attributes = {};
        const updated = await Product.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        if (!updated) return res.status(404).json({ message: "Produto não encontrado." });
        res.json(updated);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/products/:id', verifyToken, async (req, res) => {
    try { await Product.findByIdAndDelete(req.params.id); res.sendStatus(204); }
    catch { res.status(500).json({ message: "Erro ao excluir" }); }
});

app.post('/api/products/batch', verifyToken, async (req, res) => {
    try {
        const { products } = req.body;
        if (!Array.isArray(products)) return res.status(400).json({ error: "Corpo deve ser um array." });
        const ops = products.map(p => ({
            updateOne: {
                filter: p.blingId ? { blingId: String(p.blingId) } : { sku: p.sku },
                update: { $set: p }, upsert: true
            }
        }));
        const result = await Product.bulkWrite(ops);
        res.status(200).json({ message: "Lote processado", detalhes: result });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// DASHBOARD
// ============================================================

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const { period, startDate, endDate } = req.query;
        const agora = new Date();
        let startActual, endActual, startCompare = null, endCompare = null;

        if (period === 'today') {
            startActual  = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);
            endActual    = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);
            startCompare = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1, 0, 0, 0);
            endCompare   = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1, 23, 59, 59);
        } else if (period === '15days') {
            startActual  = new Date(agora.getTime() - 15 * 864e5);
            endActual    = agora;
            startCompare = new Date(startActual.getTime() - 15 * 864e5);
            endCompare   = startActual;
        } else if (period === 'custom' && startDate && endDate) {
            const [sY, sM, sD] = startDate.split('-');
            const [eY, eM, eD] = endDate.split('-');
            startActual = new Date(sY, sM - 1, sD, 0, 0, 0);
            endActual   = new Date(eY, eM - 1, eD, 23, 59, 59);
        } else {
            startActual  = new Date(agora.getTime() - 30 * 864e5);
            endActual    = agora;
            startCompare = new Date(startActual.getTime() - 30 * 864e5);
            endCompare   = startActual;
        }

        const range = { $gte: startActual, $lte: endActual };

        const [
            totalVisits, uniqueUsers,
            clickSaoRoque, clickCotia, clickIbiuna,
            totalVisitsCompare, uniqueUsersCompare,
            allProductsList
        ] = await Promise.all([
            Analytics.countDocuments({ type: 'pageview', createdAt: range }),
            Analytics.countDocuments({ type: 'pageview', isNewUser: true, createdAt: range }),
            Analytics.countDocuments({ type: 'click_whatsapp', location: 'sao_roque', createdAt: range }),
            Analytics.countDocuments({ type: 'click_whatsapp', location: 'cotia',      createdAt: range }),
            Analytics.countDocuments({ type: 'click_whatsapp', location: 'ibiuna',     createdAt: range }),
            startCompare ? Analytics.countDocuments({ type: 'pageview', createdAt: { $gte: startCompare, $lte: endCompare } }) : Promise.resolve(0),
            startCompare ? Analytics.countDocuments({ type: 'pageview', isNewUser: true, createdAt: { $gte: startCompare, $lte: endCompare } }) : Promise.resolve(0),
            Product.find({}, { category: 1, subcategory: 1, hasVariations: 1, variations: 1, stock_by_store: 1 }).lean()
        ]);

        const totalProducts = allProductsList.length;
        const catMap = {};

        for (const p of allProductsList) {
            const cat = p.category || 'Sem Categoria';
            const sub = p.subcategory || 'Geral';
            if (!catMap[cat]) catMap[cat] = { products: 0, stock: { SaoRoque: 0, Cotia: 0, Ibiuna: 0 }, subs: {} };
            if (!catMap[cat].subs[sub]) catMap[cat].subs[sub] = { products: 0, stock: { SaoRoque: 0, Cotia: 0, Ibiuna: 0 } };

            let sr = 0, co = 0, ib = 0;
            if (p.hasVariations && p.variations?.length > 0) {
                for (const v of p.variations) { 
                    sr += v.stock_by_store?.SaoRoque ?? 0; 
                    co += v.stock_by_store?.Cotia ?? 0; 
                    ib += v.stock_by_store?.Ibiuna ?? 0; 
                }
            } else {
                sr = p.stock_by_store?.SaoRoque ?? 0; 
                co = p.stock_by_store?.Cotia ?? 0; 
                ib = p.stock_by_store?.Ibiuna ?? 0;
            }

            catMap[cat].products++; catMap[cat].stock.SaoRoque += sr; catMap[cat].stock.Cotia += co; catMap[cat].stock.Ibiuna += ib;
            catMap[cat].subs[sub].products++; catMap[cat].subs[sub].stock.SaoRoque += sr; catMap[cat].subs[sub].stock.Cotia += co; catMap[cat].subs[sub].stock.Ibiuna += ib;
        }

        const catalogStats = Object.entries(catMap).map(([name, data]) => ({
            name, totalProducts: data.products,
            stock: { SaoRoque: data.stock.SaoRoque, Cotia: data.stock.Cotia, Ibiuna: data.stock.Ibiuna, total: data.stock.SaoRoque + data.stock.Cotia + data.stock.Ibiuna },
            subcategories: Object.entries(data.subs).map(([subName, subData]) => ({
                name: subName, products: subData.products,
                stock: { SaoRoque: subData.stock.SaoRoque, Cotia: subData.stock.Cotia, Ibiuna: subData.stock.Ibiuna, total: subData.stock.SaoRoque + subData.stock.Cotia + subData.stock.Ibiuna }
            })).sort((a, b) => b.products - a.products)
        })).sort((a, b) => b.totalProducts - a.totalProducts);

        res.status(200).json({
            total: totalProducts, catalogStats,
            analytics: {
                totalVisits, uniqueUsers,
                stores: { sao_roque: clickSaoRoque, cotia: clickCotia, ibiuna: clickIbiuna },
                compare: { hasCompare: !!startCompare, totalVisitsCompare, uniqueUsersCompare }
            }
        });
    } catch (error) {
        console.error("Erro no dashboard:", error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

// ============================================================
// ANALYTICS
// ============================================================

app.post('/api/analytics', async (req, res) => {
    try {
        const { type, location, isNewUser } = req.body;
        if (!type || !location) return res.status(400).json({ error: 'Dados incompletos' });
        await new Analytics({ type, location, isNewUser: !!isNewUser }).save();
        res.status(201).json({ success: true });
    } catch { res.status(500).json({ error: 'Internal Server Error' }); }
});

// ============================================================
// CATEGORIAS E ATRIBUTOS
// ============================================================

app.get('/api/attributes', async (_, res) => res.json(await Attribute.find()));
app.post('/api/attributes',    verifyToken, async (req, res) => { const a = new Attribute(req.body); await a.save(); res.status(201).json(a); });
app.put('/api/attributes/:id', verifyToken, async (req, res) => res.json(await Attribute.findByIdAndUpdate(req.params.id, req.body, { new: true })));
app.delete('/api/attributes/:id', verifyToken, async (req, res) => { await Attribute.findByIdAndDelete(req.params.id); res.sendStatus(204); });

app.get('/api/categories', async (_, res) => res.json(await Category.find()));
app.post('/api/categories',    verifyToken, async (req, res) => { const c = new Category(req.body); await c.save(); res.status(201).json(c); });
app.put('/api/categories/:id', verifyToken, async (req, res) => res.json(await Category.findByIdAndUpdate(req.params.id, req.body, { new: true })));
app.delete('/api/categories/:id', verifyToken, async (req, res) => { await Category.findByIdAndDelete(req.params.id); res.sendStatus(204); });

// ============================================================
// LOGIN
// ============================================================

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
        return res.status(200).json({ message: "Sucesso!", token });
    }
    res.status(401).json({ message: "E-mail ou senha incorretos." });
});

// ============================================================
// START
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor JACK PEÇAS rodando na porta ${PORT}`);
});