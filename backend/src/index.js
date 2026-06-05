const express = require('express');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// RATE LIMITER + RETRY (substitui todos os setTimeout manuais)
// ============================================================

// Controla quantas requisições ao Bling estão em voo ao mesmo tempo
const MAX_CONCURRENT = 2;          // Bling suporta ~5 req/s; usamos 3 com segurança
const BASE_DELAY_MS  = 600;        // Delay mínimo entre requisições
const MAX_RETRIES    = 4;          // Tentativas antes de desistir
const RETRY_BASE_MS  = 1000;       // Backoff exponencial: 1s, 2s, 4s, 8s

let activeCalls = 0;
const queue = [];

/**
 * Enfileira e executa uma requisição respeitando MAX_CONCURRENT.
 * Em caso de erro 429 (rate limit) ou 5xx aplica backoff exponencial.
 */
async function blingRequest(config, retries = 0) {
    // Aguarda vaga na fila de concorrência
    while (activeCalls >= MAX_CONCURRENT) {
        await sleep(100);
    }

    activeCalls++;
    try {
        await sleep(BASE_DELAY_MS);
        const response = await axios(config);
        return response;
    } catch (err) {
        const status = err.response?.status;

        // Rate limit ou erro de servidor → retry com backoff exponencial
        if ((status === 429 || status >= 500) && retries < MAX_RETRIES) {
            const waitMs = RETRY_BASE_MS * Math.pow(2, retries);
            console.warn(`⚠️  Bling retornou ${status}. Aguardando ${waitMs}ms antes da tentativa ${retries + 2}/${MAX_RETRIES + 1}...`);
            await sleep(waitMs);
            activeCalls--;
            return blingRequest(config, retries + 1);
        }
        throw err;
    } finally {
        activeCalls--;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executa um array de funções async em lotes de tamanho `batchSize`,
 * aguardando cada lote terminar antes de iniciar o próximo.
 */
async function runInBatches(tasks, batchSize = MAX_CONCURRENT) {
    const results = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize).map(fn => fn());
        const batchResults = await Promise.allSettled(batch);
        results.push(...batchResults);
    }
    return results;
}

// ============================================================
// CONEXÃO COM BANCO DE DADOS
// ============================================================

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Conectado ao MongoDB Atlas para JACK PEÇAS!");
        syncProductsFromBling();
    })
    .catch((err) => console.error("❌ Erro ao conectar ao MongoDB:", err));

// ============================================================
// SCHEMAS E MODELOS
// ============================================================

const blingTokenSchema = new mongoose.Schema({
    access_token: String,
    refresh_token: String,
    expires_at: Date
});
const BlingToken = mongoose.model('BlingToken', blingTokenSchema);

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    subcategories: [String]
});
const Category = mongoose.model('Category', categorySchema);

const attributeSchema = new mongoose.Schema({
    category: String,
    name: String,
    type: String,
    options: [String]
});
const Attribute = mongoose.model('Attribute', attributeSchema);

const variationItemSchema = new mongoose.Schema({
    sku: { type: String },
    name: { type: String },
    price: { type: Number, default: 0 },
    stock_by_store: {
        SaoRoque: { type: Number, default: 0 },
        Cotia: { type: Number, default: 0 },
        Ibiuna: { type: Number, default: 0 }
    },
    type: { type: String },
    value: { type: String }
}, { _id: false });

const productSchema = new mongoose.Schema({
    blingId: { type: String, unique: true, sparse: true },
    sku: { type: String },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    stock_by_store: {
        SaoRoque: { type: Number, default: 0 },
        Cotia: { type: Number, default: 0 },
        Ibiuna: { type: Number, default: 0 }
    },
    category: { type: String },
    subcategory: { type: String },
    hasVariations: { type: Boolean, default: false },
    variations: [variationItemSchema],
    attributes: { type: Map, of: String, default: {} },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', productSchema);

const analyticsSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['pageview', 'click_whatsapp']
    },
    location: {
        type: String,
        required: true,
        enum: ['sao_roque', 'cotia', 'ibiuna', 'geral'],
        default: 'geral'
    },
    isNewUser: {
        type: Boolean,
        required: true,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});
analyticsSchema.index({ createdAt: 1 });
const Analytics = mongoose.model('Analytics', analyticsSchema);

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function mapStoreKey(depositName) {
    const name = String(depositName).toUpperCase();
    if (name.includes("SÃO ROQUE") || name.includes("SAO ROQUE")) return "SaoRoque";
    if (name.includes("COTIA")) return "Cotia";
    if (name.includes("IBIÚNA") || name.includes("IBIUNA")) return "Ibiuna";
    return null;
}

function mapCategory(productName) {
    const n = productName.toUpperCase();
    let cat = null, sub = null;

    if ((n.includes("TELA FRONTAL") || n.includes("FRONTAL")) && !n.includes("FLEX CÂMERA")) {
        cat = "Telas";
        if (n.includes("IPHONE"))                                         sub = "Telas Iphone";
        else if (n.includes("SAMSUNG"))                                   sub = "Telas Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))            sub = "Telas Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Telas Xiaomi";
        else if (n.includes("REALME"))                                    sub = "Telas Realme";
        else if (n.includes("INFINIX"))                                   sub = "Telas Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))             sub = "Telas Asus";
        else if (n.includes("LG"))                                        sub = "Telas LG";
        else if (n.includes("OPPO"))                                      sub = "Telas Oppo";
    } else if (n.includes("BATERIA")) {
        cat = "Baterias";
        if (n.includes("IPHONE"))                                         sub = "Baterias Iphone";
        else if (n.includes("SAMSUNG"))                                   sub = "Baterias Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))            sub = "Baterias Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Baterias Xiaomi";
        else if (n.includes("REALME"))                                    sub = "Baterias Realme";
        else if (n.includes("INFINIX"))                                   sub = "Baterias Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))             sub = "Baterias Asus";
        else if (n.includes("LG"))                                        sub = "Baterias LG";
    } else if (n.includes("PLACA DE CARGA")) {
        cat = "Placas de Carga";
        if (n.includes("SAMSUNG"))                                        sub = "Placa de Carga Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))            sub = "Placa de Carga Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Placa de Carga Xiaomi";
        else if (n.includes("REALME"))                                    sub = "Placa de Carga Realme";
        else if (n.includes("INFINIX"))                                   sub = "Placa de Carga Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))             sub = "Placa de Carga Asus";
        else if (n.includes("LG"))                                        sub = "Placa de Carga LG";
    } else if (n.includes("CONECTOR DE CARGA") || n.includes("FLEX DE CARGA")) {
        cat = "Conector de Carga";
        if (n.includes("SAMSUNG"))                                        sub = "Conector de Carga Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))            sub = "Conector de Carga Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Conector de Carga Xiaomi";
        else if (n.includes("REALME"))                                    sub = "Conector de Carga Realme";
        else if (n.includes("INFINIX"))                                   sub = "Conector de Carga Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))             sub = "Conector de Carga Asus";
        else if (n.includes("LG"))                                        sub = "Conector de Carga LG";
        else if (n.includes("IPHONE"))                                    sub = "Flex de Carga Iphone";
    } else if (n.includes("TAMPA")) {
        cat = "Tampas Traseiras";
        if (n.includes("SAMSUNG"))                                        sub = "Tampa Traseira Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))            sub = "Tampa Traseira Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Tampa Traseira Xiaomi";
        else if (n.includes("REALME"))                                    sub = "Tampa Traseira Realme";
        else if (n.includes("INFINIX"))                                   sub = "Tampa Traseira Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))             sub = "Tampa Traseira Asus";
        else if (n.includes("LG"))                                        sub = "Tampa Traseira LG";
        else if (n.includes("IPHONE"))                                    sub = "Tampa Traseira Iphone";
    } else if (n.includes("CABO") || n.includes("CARREGADOR") || n.includes("FONTE") || n.includes("FONE DE OUVIDO") || n.includes("CAIXA DE SOM")) {
        cat = "Acessórios";
        if (n.includes("FONTE CARREGADOR") || n.includes("FONTE"))        sub = "Fontes";
        else if (n.includes("CARREGADOR"))                                sub = "Carregadores";
        else if (n.includes("CABO"))                                      sub = "Cabos";
        else if (n.includes("FONE DE OUVIDO"))                            sub = "Fones de Ouvido";
        else if (n.includes("CAIXA DE SOM"))                              sub = "Caixa de som";
    }

    return { cat, sub };
}

// ============================================================
// RENOVAÇÃO DE TOKEN (isolada e reutilizável)
// ============================================================

async function refreshBlingToken(tokenData) {
    const credentials = Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64');
    const refreshResponse = await blingRequest({
        method: 'POST',
        url: 'https://api.bling.com.br/v3/oauth/token',
        data: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokenData.refresh_token }),
        headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const { access_token, refresh_token, expires_in } = refreshResponse.data;
    tokenData.access_token = access_token;
    tokenData.refresh_token = refresh_token;
    tokenData.expires_at = new Date(Date.now() + expires_in * 1000);
    await tokenData.save();
    console.log("✅ Token Bling renovado com sucesso!");
    return access_token;
}

// ============================================================
// BUSCA DE ESTOQUE POR DEPÓSITO (com rate limiter)
// ============================================================

/**
 * Busca o saldo de um chunk de produtos em TODOS os depósitos ativos
 * e retorna um mapa { prodId: { SaoRoque, Cotia, Ibiuna } }.
 *
 * Estratégia: para cada depósito disparamos UMA requisição com até 50 IDs,
 * porém limitadas por MAX_CONCURRENT graças ao blingRequest.
 */
async function fetchStockForChunk(productIds, depositosAtivos, accessToken) {
    const estoqueMap = {};

    const tasks = depositosAtivos
        .filter(dep => mapStoreKey(dep.descricao))
        .map(dep => async () => {
            const storeKey = mapStoreKey(dep.descricao);
            const query = productIds.map(id => `idsProdutos[]=${id}`).join('&');
            try {
                const res = await blingRequest({
                    method: 'GET',
                    url: `https://api.bling.com.br/v3/estoques/saldos/${dep.id}?${query}&filtroSaldoEstoque=1`,
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const saldos = res.data.data || [];
                saldos.forEach(item => {
                    if (!item.produto?.id) return;
                    const prodId = String(item.produto.id);
                    if (!estoqueMap[prodId]) estoqueMap[prodId] = { SaoRoque: 0, Cotia: 0, Ibiuna: 0 };
                    estoqueMap[prodId][storeKey] += Number(item.saldoFisicoTotal || 0);
                });
            } catch {
                // Silencia erros de depósitos vazios (comportamento original)
            }
        });

    await runInBatches(tasks, MAX_CONCURRENT);
    return estoqueMap;
}

// ============================================================
// SINCRONIZAÇÃO PRINCIPAL
// ============================================================

async function syncProductsFromBling() {
    console.log("🔄 Iniciando sincronização com Rate Limiter e Retry automático...");
    try {
        // --- TOKEN ---
        const tokenData = await BlingToken.findOne();
        if (!tokenData?.access_token) {
            return console.log("⚠️ Sincronização interrompida: Sem credenciais no banco.");
        }

        let accessToken = tokenData.access_token;
        if (!tokenData.expires_at || new Date(Date.now() + 60000) > tokenData.expires_at) {
            console.log("🔄 Token expirado. Renovando...");
            accessToken = await refreshBlingToken(tokenData);
        }

        // --- PAGINAÇÃO DE PRODUTOS ---
        let pagina = 1;
        let productsFromBling = [];

        console.log("📦 Buscando produtos no Bling (paginado)...");
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
            return console.log("ℹ️ Nenhum produto retornado pelo Bling.");
        }
        console.log(`✅ Total bruto: ${productsFromBling.length} itens`);

        // --- DEPÓSITOS ATIVOS ---
        const resDepositos = await blingRequest({
            method: 'GET',
            url: 'https://api.bling.com.br/v3/depositos?situacao=1&limite=100',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const depositosAtivos = resDepositos.data.data || [];

        // --- ESTOQUE DOS PRODUTOS SIMPLES (em lotes de 50) ---
        const produtosSimples = productsFromBling.filter(p => p.formato !== 'V');
        const estoqueMapSimples = {};
        const CHUNK_SIZE = 50;

        console.log(`📊 Buscando estoque de ${produtosSimples.length} produtos simples em chunks de ${CHUNK_SIZE}...`);

        for (let i = 0; i < produtosSimples.length; i += CHUNK_SIZE) {
            const chunk = produtosSimples.slice(i, i + CHUNK_SIZE);
            const ids = chunk.map(p => p.id);
            const chunkMap = await fetchStockForChunk(ids, depositosAtivos, accessToken);
            Object.assign(estoqueMapSimples, chunkMap);
            console.log(`  ↳ Chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(produtosSimples.length / CHUNK_SIZE)} processado`);
        }

        // --- MONTAGEM DAS OPERATIONS ---
        const operations = [];
        const ignoredProducts = [];
        const idsBlingProcessados = [];

        for (const p of productsFromBling) {
            // Ignora filhos de variação listados avulsos
            if (p.variacao?.produtoPai) continue;

            const currentBlingId = String(p.id);
            const { cat: finalCat, sub: finalSub } = mapCategory(p.nome);

            if (!finalCat || !finalSub) {
                ignoredProducts.push({ nome: p.nome, motivo: "Categoria não mapeada" });
                continue;
            }

            idsBlingProcessados.push(currentBlingId);
            const skuFinal = String(p.codigo || "").trim();

            // ── PRODUTO COM VARIAÇÕES ──────────────────────────────────────
            if (p.formato === 'V') {
                let variationsMapped = [];
                let totalStockByStorePai = { SaoRoque: 0, Cotia: 0, Ibiuna: 0 };
                let erroVariacao = false;

                try {
                    const resVar = await blingRequest({
                        method: 'GET',
                        url: `https://api.bling.com.br/v3/produtos/variacoes/${p.id}`,
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });

                    const filhos = resVar.data.data?.variacoes || [];

                    if (filhos.length > 0) {
                        const idsFilhos = filhos.map(f => f.id);
                        const estoqueFilhosMap = await fetchStockForChunk(idsFilhos, depositosAtivos, accessToken);

                        filhos.forEach(f => {
                            const fId = String(f.id);
                            const itemStocks = estoqueFilhosMap[fId] || { SaoRoque: 0, Cotia: 0, Ibiuna: 0 };

                            totalStockByStorePai.SaoRoque += itemStocks.SaoRoque;
                            totalStockByStorePai.Cotia    += itemStocks.Cotia;
                            totalStockByStorePai.Ibiuna   += itemStocks.Ibiuna;

                            let tipoVariacao = "Opção";
                            let valorVariacao = f.variacao?.nome || "Padrão";

                            if (f.variacao?.nome?.includes(":")) {
                                const [tRaw, vRaw] = f.variacao.nome.split(":");
                                tipoVariacao  = tRaw.trim().charAt(0).toUpperCase() + tRaw.trim().slice(1).toLowerCase();
                                valorVariacao = vRaw.trim().charAt(0).toUpperCase() + vRaw.trim().slice(1).toLowerCase();
                            }

                            variationsMapped.push({
                                sku: String(f.codigo || "").trim() || `FILHO-${f.id}`,
                                name: f.nome,
                                price: parseFloat(f.preco) || 0,
                                stock_by_store: itemStocks,
                                type: tipoVariacao,
                                value: valorVariacao
                            });
                        });
                    }
                } catch {
                    erroVariacao = true;
                    console.warn(`⚠️ Problema nas variações de "${p.nome}". Mantendo dados anteriores.`);
                }

                const updateFields = {
                    blingId: currentBlingId,
                    sku: skuFinal || `PAI-${currentBlingId}`,
                    price: parseFloat(p.preco) || 0,
                    category: finalCat,
                    subcategory: finalSub,
                    hasVariations: true,
                    updatedAt: new Date()
                };

                if (!erroVariacao) {
                    updateFields.variations     = variationsMapped;
                    updateFields.stock_by_store = totalStockByStorePai;
                }

                operations.push({
                    updateOne: {
                        filter: { blingId: currentBlingId },
                        update: {
                            $set: updateFields,
                            $unset: { image: "", stock: "" },
                            $setOnInsert: { name: p.nome, createdAt: new Date(), attributes: {} }
                        },
                        upsert: true
                    }
                });

            // ── PRODUTO SIMPLES ────────────────────────────────────────────
            } else {
                const itemStocks = estoqueMapSimples[currentBlingId] || { SaoRoque: 0, Cotia: 0, Ibiuna: 0 };

                operations.push({
                    updateOne: {
                        filter: { blingId: currentBlingId },
                        update: {
                            $set: {
                                blingId: currentBlingId,
                                sku: skuFinal || `SIMPLE-${currentBlingId}`,
                                price: parseFloat(p.preco) || 0,
                                stock_by_store: itemStocks,
                                category: finalCat,
                                subcategory: finalSub,
                                hasVariations: false,
                                variations: [],
                                updatedAt: new Date()
                            },
                            $unset: { image: "", stock: "" },
                            $setOnInsert: { name: p.nome, createdAt: new Date(), attributes: {} }
                        },
                        upsert: true
                    }
                });
            }
        }

        // --- BULK WRITE ---
        if (operations.length > 0) {
            const result = await Product.bulkWrite(operations);
            console.log(`\n--- RELATÓRIO JACK PEÇAS ---`);
            console.log(`📦 Operações:      ${operations.length}`);
            console.log(`✨ Inseridos:       ${result.upsertedCount}`);
            console.log(`🔄 Atualizados:     ${result.modifiedCount}`);
            console.log(`⚠️  Ignorados:       ${ignoredProducts.length}`);
            console.log(`----------------------------\n`);
        }

        // --- AUTO-DELETE ---
        if (idsBlingProcessados.length > 0) {
            const limpeza = await Product.deleteMany({
                blingId: { $not: { $in: idsBlingProcessados } }
            });
            if (limpeza.deletedCount > 0) {
                console.log(`♻️ Auto-Clean: ${limpeza.deletedCount} produtos removidos por não constarem no Bling.`);
            }
        }

    } catch (error) {
        console.error("❌ Erro na sincronização global:", error.response?.data || error.message);
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
        const cleanToken = token.split(' ')[1] || token;
        const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ message: "Sessão inválida." });
    }
};

// ============================================================
// ROTAS DE CRON E SINCRONIZAÇÃO
// ============================================================

let isSyncing = false;

app.get('/api/cron/sync', async (req, res) => {
    try {
        if (isSyncing) {
            console.log("⚠️ Sincronização ignorada: processo já ativo.");
            return res.status(200).json({ success: true, message: "Sincronização já em andamento." });
        }

        res.status(202).json({ success: true, message: "Sincronização iniciada em segundo plano." });

        (async () => {
            isSyncing = true;
            try {
                await syncProductsFromBling();
                console.log("✅ [Cron] Sincronização concluída!");
            } catch (e) {
                console.error("❌ [Cron] Erro:", e);
            } finally {
                isSyncing = false;
                console.log("🔓 [Cron] Trava liberada.");
            }
        })();

    } catch (error) {
        isSyncing = false;
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/trigger-sync', async (req, res) => {
    syncProductsFromBling()
        .then(() => console.log("✅ Sincronização de gatilho concluída."))
        .catch(err => console.error("❌ Erro:", err));
    res.json({ message: "Sincronização disparada!", timestamp: new Date() });
});

// ============================================================
// ROTAS DE AUTENTICAÇÃO BLING
// ============================================================

app.get('/auth/bling', (req, res) => {
    const clientId = process.env.BLING_CLIENT_ID;
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
        res.send("<h1>✅ Autorizado!</h1><p>JACK PEÇAS conectado ao Bling com Multi-Estoque.</p>");
        syncProductsFromBling();
    } catch (error) {
        res.status(500).json(error.response?.data || error.message);
    }
});

// ============================================================
// ROTAS DE PRODUTOS
// ============================================================

app.get('/api/products', async (req, res) => {
    try {
        const { page = 1, limit = 25, search, category, subcategory } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        let query = {};
        if (category)    query.category    = category;
        if (subcategory) query.subcategory = subcategory;
        if (search) {
            const term = search.trim();
            query.$or = [{ name: { $regex: term, $options: 'i' } }, { sku: term }];
        }
        const [products, total] = await Promise.all([
            Product.find(query).sort({ blingId: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Product.countDocuments(query)
        ]);
        res.json({ products, total, pages: Math.ceil(total / limit), currentPage: parseInt(page) });
    } catch {
        res.status(500).json({ message: "Erro ao carregar produtos" });
    }
});

app.post('/api/products', verifyToken, async (req, res) => {
    try {
        const data = { ...req.body };
        if (typeof data.variations === 'string') { try { data.variations = JSON.parse(data.variations); } catch { data.variations = []; } }
        if (typeof data.attributes === 'string') { try { data.attributes = JSON.parse(data.attributes); } catch { data.attributes = {}; } }
        else if (!data.attributes) data.attributes = {};
        const product = new Product(data);
        await product.save();
        res.status(201).json(product);
    } catch (err) { res.status(400).json({ error: err.message }); }
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
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.sendStatus(204);
    } catch { res.status(500).json({ message: "Erro ao excluir" }); }
});

app.post('/api/products/batch', verifyToken, async (req, res) => {
    try {
        const { products } = req.body;
        if (!Array.isArray(products)) return res.status(400).json({ error: "Corpo deve ser um array." });
        const ops = products.map(p => ({
            updateOne: {
                filter: p.blingId ? { blingId: String(p.blingId) } : { sku: p.sku },
                update: { $set: p },
                upsert: true
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

        // Proteção contra erro fatal caso o modelo Product não esteja importado no index.js
        const totalProductsCount = typeof Product !== 'undefined' ? Product.countDocuments({}) : Promise.resolve(0);

        // Busca assíncrona blindada contra valores nulos
        const [
            totalVisits, 
            uniqueUsers, 
            countSaoRoque, 
            countCotia, 
            countIbiuna, 
            totalVisitsCompare, 
            uniqueUsersCompare, 
            totalProducts
        ] = await Promise.all([
            Analytics.countDocuments({ type: 'pageview', createdAt: range }).catch(() => 0),
            Analytics.countDocuments({ type: 'pageview', isNewUser: true, createdAt: range }).catch(() => 0),
            Analytics.countDocuments({ type: 'select_store', location: 'sao_roque', createdAt: range }).catch(() => 0),
            Analytics.countDocuments({ type: 'select_store', location: 'cotia', createdAt: range }).catch(() => 0),
            Analytics.countDocuments({ type: 'select_store', location: 'ibiuna', createdAt: range }).catch(() => 0),
            startCompare ? Analytics.countDocuments({ type: 'pageview', createdAt: { $gte: startCompare, $lte: endCompare } }).catch(() => 0) : Promise.resolve(0),
            startCompare ? Analytics.countDocuments({ type: 'pageview', isNewUser: true, createdAt: { $gte: startCompare, $lte: endCompare } }).catch(() => 0) : Promise.resolve(0),
            totalProductsCount.catch(() => 0)
        ]);

        // Se suas categorias reais vierem de outro lugar, certifique-se de preenchê-las aqui
        const mockCategories = {
            "Motor": totalProducts > 0 ? Math.ceil(totalProducts * 0.3) : 0,
            "Suspensão": totalProducts > 0 ? Math.ceil(totalProducts * 0.4) : 0,
            "Freios": totalProducts > 0 ? Math.ceil(totalProducts * 0.3) : 0
        };

        res.status(200).json({
            total: totalProducts || 0,
            categories: mockCategories,
            analytics: {
                totalVisits: totalVisits || 0, 
                uniqueUsers: uniqueUsers || 0,
                stores: { 
                    sao_roque: countSaoRoque || 0, 
                    cotia: countCotia || 0, 
                    ibiuna: countIbiuna || 0 
                },
                compare: { 
                    hasCompare: !!startCompare, 
                    totalVisitsCompare: totalVisitsCompare || 0, 
                    uniqueUsersCompare: uniqueUsersCompare || 0 
                }
            }
        });
    } catch (error) {
        console.error("Erro interno detectado no dashboard:", error);
        res.status(500).json({ error: 'Erro interno no servidor', detalhes: error.message });
    }
});
// ============================================================
// ANALYTICS
// ============================================================

app.post('/api/analytics', async (req, res) => {
    try {
        const { type, location, isNewUser } = req.body;
        
        // Validação simples
        if (!type || !location) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }
        
        await new Analytics({ 
            type, 
            location, 
            isNewUser: !!isNewUser 
        }).save();

        res.status(201).json({ success: true });
    } catch (error) {
        console.error("Erro ao salvar analytics:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ============================================================
// ATRIBUTOS E CATEGORIAS
// ============================================================

app.get('/api/attributes', async (_, res) => res.json(await Attribute.find()));
app.post('/api/attributes', verifyToken, async (req, res) => { const a = new Attribute(req.body); await a.save(); res.status(201).json(a); });
app.put('/api/attributes/:id', verifyToken, async (req, res) => res.json(await Attribute.findByIdAndUpdate(req.params.id, req.body, { new: true })));
app.delete('/api/attributes/:id', verifyToken, async (req, res) => { await Attribute.findByIdAndDelete(req.params.id); res.sendStatus(204); });

app.get('/api/categories', async (_, res) => res.json(await Category.find()));
app.post('/api/categories', verifyToken, async (req, res) => { const c = new Category(req.body); await c.save(); res.status(201).json(c); });
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