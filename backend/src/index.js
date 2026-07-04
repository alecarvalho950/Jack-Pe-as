const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
require('dotenv').config();
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');
const axios    = require('axios');

const app  = express();
const PORT = process.env.PORT || 3000;

// Configuração do Servidor HTTP + Socket.io
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*", // Ajuste para a URL do seu front (Vercel) em produção se quiser mais segurança
        methods: ["GET", "POST"]
    }
});

// Canal global de conexões para monitoramento
io.on('connection', (socket) => {
    console.log(`🔌 [SOCKET] Novo cliente conectado: ${socket.id}`);
    
    socket.on('disconnect', () => {
        console.log(`❌ [SOCKET] Cliente desconectado: ${socket.id}`);
    });
});

// Compartilha o 'io' globalmente para ser usado dentro das funções de webhook se necessário
global.io = io;

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

// ── CORREÇÃO 1: campo blingId adicionado ao variationItemSchema ──────────────
const variationItemSchema = new mongoose.Schema({
    blingId: { type: String },          // ID único do filho no Bling (necessário para correlação de webhooks)
    sku:     { type: String },
    name:    { type: String },
    price:   { type: Number, default: 0 },
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

function mapStoreKey(depositNameOrId) {
    if (!depositNameOrId) return null;
    
    const input = String(depositNameOrId).toUpperCase().replace(/\s+/g, '');
    
    // 🛑 IGNORAR DEPOSITOS QUE NÃO SERÃO UTILIZADOS (Evita requisições inúteis e erro 429)
    if (input.includes("LOJINHAJACK")) {
        return null; 
    }
    
    // 📍 1. IBIÚNA
    if (input === "14887527822" || input.includes("IBIUNA") || input.includes("IBIÚNA")) {
        return "Ibiuna";
    }
    
    // 📍 2. COTIA
    if (input === "14887826948" || input.includes("COTIA")) {
        return "Cotia";
    }
    
    // 📍 3. SÃO ROQUE
    if (input === "8468004842" || input.includes("SAOROQUE") || input.includes("SÃOROQUE") || input.includes("GERAL")) {
        return "SaoRoque";
    }
    
    // Fallback de segurança: Caso o Bling crie um depósito novo no futuro
    console.warn(`⚠️ Depósito ID/Nome "${depositNameOrId}" não mapeado especificamente. Direcionando para SaoRoque por padrão.`);
    return "SaoRoque";
}

function mapCategory(productName) {
    const n = productName.toUpperCase();
    let cat = null, sub = null;

    if ((n.includes("TELA FRONTAL") || n.includes("FRONTAL")) && !n.includes("FLEX CÂMERA")) {
        cat = "Telas";
        if      (n.includes("IPHONE"))                                              sub = "Telas Iphone";
        else if (n.includes("SAMSUNG"))                                             sub = "Telas Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))                      sub = "Telas Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Telas Xiaomi";
        else if (n.includes("REALME"))                                              sub = "Telas Realme";
        else if (n.includes("INFINIX"))                                             sub = "Telas Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))                       sub = "Telas Asus";
        else if (n.includes("LG"))                                                  sub = "Telas LG";
        else if (n.includes("OPPO"))                                                sub = "Telas Oppo";
    } else if (n.includes("BATERIA")) {
        cat = "Baterias";
        if      (n.includes("IPHONE"))                                              sub = "Baterias Iphone";
        else if (n.includes("SAMSUNG"))                                             sub = "Baterias Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))                      sub = "Baterias Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Baterias Xiaomi";
        else if (n.includes("REALME"))                                              sub = "Baterias Realme";
        else if (n.includes("INFINIX"))                                             sub = "Baterias Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))                       sub = "Baterias Asus";
        else if (n.includes("LG"))                                                  sub = "Baterias LG";
    } else if (n.includes("PLACA DE CARGA")) {
        cat = "Placas de Carga";
        if      (n.includes("SAMSUNG"))                                             sub = "Placa de Carga Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))                      sub = "Placa de Carga Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Placa de Carga Xiaomi";
        else if (n.includes("REALME"))                                              sub = "Placa de Carga Realme";
        else if (n.includes("INFINIX"))                                             sub = "Placa de Carga Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))                       sub = "Placa de Carga Asus";
        else if (n.includes("LG"))                                                  sub = "Placa de Carga LG";
    } else if (n.includes("CONECTOR DE CARGA") || n.includes("FLEX DE CARGA")) {
        cat = "Conector de Carga";
        if      (n.includes("SAMSUNG"))                                             sub = "Conector de Carga Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))                      sub = "Conector de Carga Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Conector de Carga Xiaomi";
        else if (n.includes("REALME"))                                              sub = "Conector de Carga Realme";
        else if (n.includes("INFINIX"))                                             sub = "Conector de Carga Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))                       sub = "Conector de Carga Asus";
        else if (n.includes("LG"))                                                  sub = "Conector de Carga LG";
        else if (n.includes("IPHONE"))                                              sub = "Flex de Carga Iphone";
    } else if (n.includes("TAMPA")) {
        cat = "Tampas Traseiras";
        if      (n.includes("SAMSUNG"))                                             sub = "Tampa Traseira Samsung";
        else if (n.includes("MOTO") || n.includes("MOTOROLA"))                      sub = "Tampa Traseira Motorola";
        else if (n.includes("XIAOMI") || n.includes("POCO") || n.includes("REDMI")) sub = "Tampa Traseira Xiaomi";
        else if (n.includes("REALME"))                                              sub = "Tampa Traseira Realme";
        else if (n.includes("INFINIX"))                                             sub = "Tampa Traseira Infinix";
        else if (n.includes("ASUS") || n.includes("ZENFONE"))                       sub = "Tampa Traseira Asus";
        else if (n.includes("LG"))                                                  sub = "Tampa Traseira LG";
        else if (n.includes("IPHONE"))                                              sub = "Tampa Traseira Iphone";
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
// SINCRONIZAÇÃO COMPLETA
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

        const operations          = [];
        const ignoredProducts     = [];
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
                let variationsMapped     = [];
                let totalStockByStorePai = { SaoRoque: 0, Cotia: 0, Ibiuna: 0 };
                let erroVariacao         = false;

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
                            const fId        = String(f.id);
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

                            // ── CORREÇÃO 2: blingId do filho salvo no array de variações ──
                            variationsMapped.push({
                                blingId: fId,                                               // ← NOVO
                                sku:     String(f.codigo || "").trim() || `FILHO-${fId}`,
                                name:    f.nome,
                                price:   parseFloat(f.preco) || 0,
                                stock_by_store: itemStocks,
                                type:    tipoVariacao,
                                value:   valorVariacao
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
                    update: {
                        $set: updateFields,
                        $unset: { image: "", stock: "" },
                        $setOnInsert: { name: p.nome, createdAt: new Date(), attributes: {} }
                    },
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
            console.log(`📦 Operações:   ${operations.length}`);
            console.log(`✨ Inseridos:   ${result.upsertedCount}`);
            console.log(`🔄 Atualizados: ${result.modifiedCount}`);
            console.log(`⚠️  Ignorados:   ${ignoredProducts.length}`);
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
// CRON DIÁRIO — 03:00 backup de consistência
// ============================================================

cron.schedule('0 3 * * *', () => {
    console.log("⏰ [CRON 03:00] Iniciando sync completa de backup...");
    syncProductsFromBling();
}, { timezone: "America/Sao_Paulo" });

console.log("✅ Cron de backup diário agendado para as 03:00 (America/Sao_Paulo).");

// ============================================================
// WEBHOOKS — CORREÇÃO 3 & 4: busca em duas etapas (Pai → Filho)
// ============================================================

/**
 * Busca inteligente de produto:
 *   1ª tentativa — nível pai (blingId ou sku no documento raiz)
 *   2ª tentativa — nível filho (blingId ou sku dentro do array variations)
 *
 * Retorna { produto, isVariation, varIdx }
 *   isVariation = true  → o match foi em uma variação
 *   varIdx              → índice da variação no array (quando isVariation)
 */
async function findProductByIdOrSku(blingId, sku) {
    // ── Tentativa 1: produto pai ──────────────────────────────
    if (blingId) {
        const p = await Product.findOne({ blingId });
        if (p) return { produto: p, isVariation: false, varIdx: -1 };
    }
    if (sku) {
        const p = await Product.findOne({ sku });
        if (p) return { produto: p, isVariation: false, varIdx: -1 };
    }

    // ── Tentativa 2: variação filha ───────────────────────────
    if (blingId) {
        const p = await Product.findOne({ 'variations.blingId': blingId });
        if (p) {
            const varIdx = p.variations.findIndex(v => v.blingId === blingId);
            return { produto: p, isVariation: true, varIdx };
        }
    }
    if (sku) {
        const p = await Product.findOne({ 'variations.sku': sku });
        if (p) {
            const varIdx = p.variations.findIndex(v => v.sku === sku);
            return { produto: p, isVariation: true, varIdx };
        }
    }

    return { produto: null, isVariation: false, varIdx: -1 };
}

// ============================================================
// WEBHOOKS — Processamento com Sistema de Auditoria de Erros
// ============================================================

async function processStockWebhook(data) {
    try {
        console.log("🔍 [AUDITORIA ESTOQUE] Iniciando processamento do Payload...");
        console.log("📦 Dados brutos estruturados para o banco:", JSON.stringify(data, null, 2));

        const blingId  = data?.produto?.id     ? String(data.produto.id) : null;
        const sku      = data?.produto?.codigo || null;
        const depName  = data?.deposito?.descricao || "";
        const saldo    = Number(data?.saldoFisicoTotal ?? 0);
        
        // Mapeia usando a nova função com IDs definidos
        const storeKey = mapStoreKey(depName);

        console.log(`📊 Identificadores extraídos -> blingId: ${blingId} | SKU: ${sku} | Depósito Bling: "${depName}" -> Mapeado como: "${storeKey}" | Saldo: ${saldo}`);

        if (!storeKey) {
            console.warn(`⚠️  [Webhook/Estoque] Depósito "${depName}" NÃO foi mapeado para nenhuma loja. Abortando atualização.`);
            return;
        }

        if (!blingId && !sku) {
            console.error("❌ [Webhook/Estoque] O Payload não contém identificadores válidos. Abortando.");
            return;
        }

        // 🎯 NOVA QUERY INTELIGENTE: Busca na raiz ou dentro da array de variações
        let query = {};
        if (blingId) {
            query = {
                $or: [
                    { blingId: blingId },
                    { "variations.blingId": blingId }
                ]
            };
        } else if (sku) {
            query = {
                $or: [
                    { sku: sku },
                    { "variations.sku": sku }
                ]
            };
        }

        console.log("🗄️  Buscando produto no MongoDB com a query adaptada:", JSON.stringify(query));
        const produto = await Product.findOne(query);
        
        if (!produto) {
            console.error(`❌ [Webhook/Estoque] Produto/Variação com Identificador ${blingId || sku} NÃO foi encontrado no MongoDB!`);
            return;
        }

        console.log(`✅ Produto localizado no banco: "${produto.name}" (Possui Variações: ${produto.hasVariations})`);

        let isVariation = false;
        let variantId = null;
        let updatedStockByStore = null;

        // Se o produto localizado trabalha com variações
        if (produto.hasVariations && produto.variations?.length > 0) {
            console.log(`🧬 Procurando variação com ID correspondente a: "${blingId}"`);
            
            // Procura o índice correto da variação filha que disparou o evento
            const varIdx = produto.variations.findIndex(v =>
                String(v.blingId) === blingId || (sku && v.sku === sku)
            );

            if (varIdx !== -1) {
                console.log(`📌 Variação "${produto.variations[varIdx].name}" encontrada no índice [${varIdx}].`);
                
                // Inicializa o objeto de estoque da variação caso não exista por segurança
                if (!produto.variations[varIdx].stock_by_store) {
                    produto.variations[varIdx].stock_by_store = { SaoRoque: 0, Cotia: 0, Ibiuna: 0 };
                }
                
                // Atualiza o estoque isolado da variação na loja correspondente
                produto.variations[varIdx].stock_by_store[storeKey] = saldo;
                
                // Guarda os dados para enviar no socket depois do .save()
                isVariation = true;
                variantId = produto.variations[varIdx]._id ? produto.variations[varIdx]._id.toString() : null;
                updatedStockByStore = produto.variations[varIdx].stock_by_store;

                console.log(`✅ Estoque da variação atualizado em ${storeKey} para: ${saldo}`);
            } else {
                console.warn(`⚠️  [Webhook/Estoque] Variação com o ID/SKU informado não bate com nenhuma cadastrada.`);
            }

            // Recalcula o estoque total do produto Pai somando as suas variações filhas
            const totalSR = produto.variations.reduce((a, v) => a + (v.stock_by_store?.SaoRoque ?? 0), 0);
            const totalCO = produto.variations.reduce((a, v) => a + (v.stock_by_store?.Cotia    ?? 0), 0);
            const totalIB = produto.variations.reduce((a, v) => a + (v.stock_by_store?.Ibiuna   ?? 0), 0);

            produto.stock_by_store = { SaoRoque: totalSR, Cotia: totalCO, Ibiuna: totalIB };
            produto.markModified('variations');
        } else {
            // Caso seja um produto simples (sem variações)
            console.log(`📦 Produto Simples. Atualizando estoque da loja ${storeKey} para: ${saldo}`);
            produto.stock_by_store[storeKey] = saldo;
            
            // Guarda os dados para enviar no socket depois do .save()
            isVariation = false;
            updatedStockByStore = produto.stock_by_store;
        }

        produto.updatedAt = new Date();
        await produto.save();
        console.log(`🎉 [SUCESSO ESTOQUE] Banco updated com sucesso para o produto: "${produto.name}"!\n`);
        
        // 🔥 EMISSÃO DO SOCKET CORRIGIDA: Usa a variável certa para cada tipo de produto
        const ioInstance = typeof io !== 'undefined' ? io : (typeof global.io !== 'undefined' ? global.io : null);
        if (ioInstance && updatedStockByStore) {
            ioInstance.emit("product_stock_updated", {
                productId: produto._id.toString(),
                isVariation: isVariation,
                variantId: variantId,
                variantBlingId: blingId ? blingId.toString() : null,
                stock_by_store: updatedStockByStore
            });
            console.log(`⚡ [SOCKET] Evento de real-time enviado! (Variação: ${isVariation})`);
        }

    } catch (err) {
        console.error("🚨 [ERRO CRÍTICO ESTOQUE] Falha ao processar ou salvar no MongoDB:", err.stack);
    }
}

async function processProductWebhook(data) {
    try {
        console.log("🔍 [AUDITORIA PRODUTO] Iniciando processamento do Payload de cadastro/alteração...");
        const blingId = data?.id ? String(data.id) : null;
        
        if (!blingId) {
            console.error("❌ [Webhook/Produto] Payload não contém o campo 'id'. Abortando.");
            return;
        }

        const nomeProduto = data.nome || "";
        const idPaiBling = data.idProdutoPai ? String(data.idProdutoPai) : "0";
        const situacao = data.situacao || "A"; // 'A' = Ativo, 'E' = Excluído, 'I' = Inativo

        // ============================================================
        // 🎯 GATILHO DE EXCLUSÃO/INATIVAÇÃO VIA SITUAÇÃO ("E" ou "I")
        // ============================================================
        if (situacao === "E" || situacao === "I") {
            console.log(`⚠️  [SITUAÇÃO DE EXCLUSÃO DETECTADA] Produto ID ${blingId} está com situação "${situacao}".`);
            
            if (idPaiBling !== "0" && idPaiBling !== "null" && idPaiBling !== undefined) {
                // Se o inativado for um filho, remove ele da array do Pai
                console.log(`🧬 Removendo variação filha ID ${blingId} do produto Pai ID ${idPaiBling}...`);
                await Product.updateOne(
                    { blingId: idPaiBling },
                    { $pull: { variations: { blingId: blingId } }, $set: { updatedAt: new Date() } }
                );
                await Product.findOneAndDelete({ blingId: blingId });
                console.log(`🗑️ [SUCESSO] Variação filha limpa do catálogo.`);
                
                if (typeof io !== 'undefined') {
                    const paiCompleto = await Product.findOne({ blingId: idPaiBling });
                    if (paiCompleto) {
                        io.emit('product_updated', { product: paiCompleto });
                    }
                }
            } else {
                // Se for o produto principal/simples, deleta o documento inteiro
                const deletado = await Product.findOneAndDelete({ blingId: blingId });
                if (deletado) {
                    console.log(`🗑️ [SUCESSO] Produto principal/simples "${deletado.name}" removido do MongoDB.`);
                    if (typeof io !== 'undefined') {
                        io.emit('product_deleted', { blingId: blingId });
                        console.log(`⚡ [SOCKET] Evento product_deleted enviado para o Bling ID: ${blingId}`);
                    }
                }
            }
            return; 
        }

        // ============================================================
        // 🧬 CENÁRIO A: O PRODUTO RECEBIDO É UMA VARIAÇÃO ATIVA (FILHO)
        // ============================================================
        if (idPaiBling !== "0" && idPaiBling !== "null" && idPaiBling !== undefined) {
            console.log(`🧬 [FILHO DETECTADO] ID ${blingId} ("${nomeProduto}") é filho do Pai Bling ID: ${idPaiBling}`);

            let tipoVariacao = "Cor";
            let valorVariacao = "Padrão";
            if (nomeProduto.toUpperCase().includes("COR:")) {
                const partes = nomeProduto.split(/cor:/i);
                if (partes[1]) valorVariacao = partes[1].trim();
            }

            const objetoVariacao = {
                blingId: blingId,
                sku: data.codigo ? String(data.codigo).trim() : "",
                name: nomeProduto,
                price: !isNaN(parseFloat(data.preco)) ? parseFloat(data.preco) : 0,
                stock_by_store: { SaoRoque: 0, Cotia: 0, Ibiuna: 0 },
                type: tipoVariacao,
                value: valorVariacao
            };

            const paiAtualizado = await Product.findOneAndUpdate(
                { blingId: idPaiBling },
                { $set: { hasVariations: true, updatedAt: new Date() } },
                { new: true }
            );

            if (!paiAtualizado) {
                console.warn(`⚠️  [Webhook/Produto] O produto Pai ID ${idPaiBling} ainda não existe no banco.`);
                return;
            }

            if (objetoVariacao.price === 0) objetoVariacao.price = paiAtualizado.price;

            let variationsArray = paiAtualizado.variations || [];
            const idxFilho = variationsArray.findIndex(v => v.blingId === blingId);

            if (idxFilho !== -1) {
                objetoVariacao.stock_by_store = variationsArray[idxFilho].stock_by_store || objetoVariacao.stock_by_store;
                variationsArray[idxFilho] = objetoVariacao;
            } else {
                variationsArray.push(objetoVariacao);
            }

            await Product.updateOne({ blingId: idPaiBling }, { $set: { variations: variationsArray } });
            console.log(`🎉 [SUCESSO VARIAÇÃO] Filho "${nomeProduto}" sincronizado com segurança dentro do Pai!\n`);
            await Product.findOneAndDelete({ blingId: blingId, hasVariations: false });

            if (typeof io !== 'undefined') {
                const paiCompleto = await Product.findOne({ blingId: idPaiBling });
                if (paiCompleto) {
                    io.emit('product_updated', { product: paiCompleto });
                    console.log("⚡ [SOCKET] Evento product_updated (variação) enviado com o objeto completo!");
                }
            }
            return;
        }

        // ============================================================
        // 📦 CENÁRIO B: PRODUTO SIMPLES OU PRODUTO PAI ATIVO (RAIZ)
        // ============================================================
        const categoriaMapeada = mapCategory(nomeProduto); 

        if (!categoriaMapeada || !categoriaMapeada.cat) {
            console.warn(`🚫 [PRODUTO IGNORADO] "${nomeProduto}" não corresponde a nenhuma categoria válida.`);
            await Product.findOneAndDelete({ blingId });
            return;
        }

        let produto = await Product.findOne({ blingId });
        let ehNovoProduto = false;

        if (!produto) {
            console.log(`✨ [NOVO PRODUTO VÁLIDO DETECTADO] "${nomeProduto}". Criando registro...`);
            ehNovoProduto = true;
            
            produto = new Product({
                blingId: blingId,
                stock_by_store: { SaoRoque: 0, Cotia: 0, Ibiuna: 0 },
                variations: [],
                hasVariations: data.formato === "V"
            });
        }

        produto.name = nomeProduto;
        produto.category = categoriaMapeada.cat;
        produto.subcategory = categoriaMapeada.sub || "";
        produto.sku = data.codigo ? String(data.codigo).trim() : (produto.sku || "");
        produto.price = !isNaN(parseFloat(data.preco)) ? parseFloat(data.preco) : (produto.price || 0);
        
        if (data.formato === "V") produto.hasVariations = true;

        if (!ehNovoProduto && produto.hasVariations && produto.variations?.length > 0) {
            produto.variations = produto.variations.map(v => ({ ...v, price: produto.price }));
            produto.markModified('variations');
        }

        produto.updatedAt = new Date();
        await produto.save();
        
        console.log(`🎉 [SUCESSO] Produto principal "${produto.name}" sincronizado com sucesso!\n`);
        
        if (typeof io !== 'undefined') {
            const produtoCompleto = await Product.findById(produto._id || produto.id).lean();

            if (produtoCompleto) {
                // 🔥 CORREÇÃO DA CONDIÇÃO: Se ele está marcado com variação, avisa como estruturado estruturado independente da array estar preenchendo via delay
                if (produtoCompleto.hasVariations) {
                    console.log(`🧬 Enviando estrutura de variações ativa para o catálogo: "${produtoCompleto.name}"`);
                } else {
                    console.log(`📦 Enviando produto simples com estoque consolidado: "${produtoCompleto.name}"`);
                }
                io.emit('product_updated', { product: produtoCompleto });
                console.log("⚡ [SOCKET] Evento product_updated enviado com dados consolidados e protegidos!");
            }
        }

    } catch (err) {
        console.error("🚨 [ERRO CRÍTICO PRODUTO] Falha ao cadastrar/atualizar produto:", err.stack);
    }
}

async function processProductDeleteWebhook(blingId) {
    try {
        if (!blingId) return;
        const idString = String(blingId);

        console.log(`🔍 [AUDITORIA EXCLUSÃO] Tentando remover identificador do Bling: ${idString}`);

        const produtoPaiDeletado = await Product.findOneAndDelete({ blingId: idString });

        if (produtoPaiDeletado) {
            console.log(`🗑️ [SUCESSO EXCLUSÃO] O produto principal "${produtoPaiDeletado.name}" foi removido do MongoDB.`);
            // 🔥 CORREÇÃO: Emite a deleção física para o front-end limpar o catálogo imediatamente
            if (typeof io !== 'undefined') {
                io.emit('product_deleted', { blingId: idString });
            }
            return;
        }

        const paiDaVariacao = await Product.findOne({ "variations.blingId": idString });

        if (paiDaVariacao) {
            console.log(`🧬 Variação encontrada dentro do produto pai: "${paiDaVariacao.name}". Removendo variação...`);
            
            paiDaVariacao.variations = paiDaVariacao.variations.filter(v => String(v.blingId) !== idString);
            paiDaVariacao.markModified('variations');
            paiDaVariacao.updatedAt = new Date();
            
            await paiDaVariacao.save();
            console.log(`🗑️ [SUCESSO EXCLUSÃO] Variação filha removida com sucesso.`);
            
            if (typeof io !== 'undefined') {
                // Notifica que uma variação sumiu atualizando o card mestre pai
                io.emit('product_updated', { product: paiDaVariacao });
            }
            return;
        }

        console.log(`⚠️  [Webhook/Exclusão] O ID ${idString} não existia no banco de dados (já estava limpo).`);

    } catch (err) {
        console.error("🚨 [ERRO CRÍTICO EXCLUSÃO] Falha ao deletar produto do banco:", err.stack);
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
// ROTAS DE CRON E TRIGGER MANUAL
// ============================================================

app.get('/api/cron/sync', async (req, res) => {
    if (isSyncing) return res.status(200).json({ success: true, message: "Sync já em andamento." });
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
// ENDPOINT DO WEBHOOK DO BLING (HÍBRIDO: SUPORTA API V2 E V3)
// ============================================================
app.post('/api/webhooks/bling', (req, res) => {
    try {
        const { token } = req.query;
        console.log(`\n📥 [WEBHOOK INCOMING] Chamada recebida.`);

        if (!token || token !== process.env.BLING_WEBHOOK_SECRET) {
            console.warn(`⚠️  [Webhook/Bling] Token inválido ou ausente.`);
            return res.status(401).send("Não autorizado");
        }

        // Resposta rápida para o Bling não dar timeout
        res.status(200).send("OK");

        const bodyCompleto = req.body;
        
        // LOG TOTAL: Vamos printar o BODY INTEIRO para caçar os IDs escondidos
        console.log("📦 [DEBUG COMPLETO] Body recebido do Bling:", JSON.stringify(bodyCompleto, null, 2));

        // Detecta o tipo de evento (Pode vir em payload.event na V3 ou em outras chaves na V2)
        const tipoEvento = bodyCompleto?.event || bodyCompleto?.tipo || "stock.updated";
        
        // Se os dados vierem encapsulados em "data" (V3), usamos. Se não, usamos a raiz do body (V2)
        const dados = bodyCompleto?.data || bodyCompleto;

        // 1. PROCESSAMENTO DE ESTOQUE
        if (tipoEvento.includes('stock') || bodyCompleto?.quantidade !== undefined || dados?.saldoFisicoTotal !== undefined) {
            console.log("⚡ Encaminhando para processamento de ESTOQUE...");

            let idBlingProduto = dados?.produto?.id || 
                                 dados?.idProduto || 
                                 dados?.id_produto ||
                                 bodyCompleto?.idProduto ||
                                 bodyCompleto?.produto?.id ||
                                 dados?.id;

            let skuExtraido = dados?.produto?.codigo || 
                              dados?.codigo || 
                              dados?.sku || 
                              bodyCompleto?.codigo;

            let depDescricao = dados?.deposito?.id || 
                               dados?.deposito?.descricao || 
                               dados?.deposito || 
                               "Geral";

            // 🎯 CORREÇÃO CRUCIAL: Pega o saldo ISOLADO do depósito alterado. Se não existir, usa o total.
            let saldoIsoladoDaLoja = dados?.deposito?.saldoFisico ?? 
                                     dados?.saldoFisico ?? 
                                     dados?.saldoFisicoTotal ?? 
                                     dados?.balance ?? 
                                     0;

            // Fallback para API V2 clássica caso necessário
            if (!idBlingProduto && bodyCompleto?.retorno?.estoques) {
                const itemEstoque = bodyCompleto.retorno.estoques[0]?.estoque;
                if (itemEstoque) {
                    idBlingProduto = itemEstoque.id;
                    skuExtraido = itemEstoque.codigo;
                    depDescricao = itemEstoque.deposito?.nome || "Geral";
                    saldoIsoladoDaLoja = itemEstoque.estoqueAtual;
                }
            }

            const dadosAdaptados = {
                produto: {
                    id: idBlingProduto ? String(idBlingProduto) : null,
                    codigo: skuExtraido ? String(skuExtraido).trim() : null
                },
                deposito: {
                    descricao: String(depDescricao)
                },
                saldoFisicoTotal: Number(saldoIsoladoDaLoja) // Enviamos o valor isolado da filial para processamento
            };

            processStockWebhook(dadosAdaptados);
        }
        
        // 2. PROCESSAMENTO DE PRODUTO (CADASTRO / ALTERAÇÃO / EXCLUSÃO) - 🛠️ CORRIGIDO AQUI
        else if (tipoEvento.includes('product')) {
            const dadosProdutoAdaptados = {
                id: dados.id || dados.idProduto,
                nome: dados.nome,
                preco: dados.preco,
                codigo: dados.codigo || dados.sku,
                idProdutoPai: dados.idProdutoPai,
                situacao: dados.situacao, // 🔥 ADICIONE ESSA LINHA PARA CAPTURAR A EXCLUSÃO
                formato: dados.formato,
                variacoes: dados.variacoes
            };

            // Se o evento disparado for especificamente de exclusão
            if (tipoEvento === 'product.deleted') {
                console.log("🗑️ Encaminhando para EXCLUSÃO de produto...");
                processProductDeleteWebhook(dadosProdutoAdaptados.id);
            } else {
                console.log("⚡ Encaminhando para processamento de PRODUTO (Cadastro/Preço)...");
                processProductWebhook(dadosProdutoAdaptados);
            }
        }

    } catch (error) {
        console.error("❌ Erro crítico no ponto de entrada do webhook:", error.message);
    }
});

// ============================================================
// ROTA ADMINISTRATIVA: SINCRONIZAÇÃO EM MASSA (RETROATIVA)
// ============================================================
app.get('/api/admin/sincronizar-bling', async (req, res) => {
    try {
        console.log("🚀 [CARGA INICIAL] Iniciando busca de produtos antigos no Bling...");
        
        // Configuração oficial para a API v3 do Bling
        const configBling = {
            method: 'get',
            url: 'https://www.bling.com.br/Api/v3/produtos?pagina=1&limite=100',
            headers: { 
                // Certifique-se de que a variável BLING_ACCESS_TOKEN está no seu arquivo .env
                'Authorization': `Bearer ${process.env.BLING_ACCESS_TOKEN}` 
            }
        };

        const response = await blingRequest(configBling);
        const produtosBling = response.data?.data || [];

        console.log(`📦 Encontrados ${produtosBling.length} produtos na primeira página do Bling.`);

        let criados = 0;
        let atualizados = 0;

        for (const prod of produtosBling) {
            const blingId = String(prod.id);
            
            // Procura se o produto já existe no banco
            let existente = await Product.findOne({ blingId });

            if (!existente) {
                // Criação do novo produto baseado nas especificações da API v3 do Bling
                const novo = new Product({
                    blingId: blingId,
                    name: prod.nome,
                    sku: prod.codigo ? String(prod.codigo).trim() : "",
                    price: parseFloat(prod.preco) || 0,
                    // Na API v3, formato 'V' indica produto com variações
                    hasVariations: prod.formato === "V", 
                    stock_by_store: { SaoRoque: 0, Cotia: 0, Ibiuna: 0 },
                    variations: []
                });
                await novo.save();
                criados++;
            } else {
                // Se já existe, mantém atualizado o nome e preço
                existente.name = prod.nome;
                existente.price = parseFloat(prod.preco) || existente.price;
                await existente.save();
                atualizados++;
            }
        }

        // 🎯 RETORNO CORRIGIDO (Sem o espaço na chave)
        return res.status(200).json({
            status: "Sucesso",
            mensagem: "Sincronização concluída com os dados da página 1.",
            produtosProcessados: produtosBling.length,
            novosCriadosNoBanco: criados,
            atualizadosNoBanco: atualizados
        });

    } catch (error) {
        console.error("❌ Erro na sincronização em massa:", error.message);
        return res.status(500).json({ erro: error.message });
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
        res.json({ products, total, pages: Math.ceil(total / limit), currentPage: parseInt(page) });
    } catch (error) {
        console.error("❌ ERRO CRÍTICO NA ROTA /api/products:", error);
        res.status(500).json({ message: "Erro ao carregar produtos", error: error.message });
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
            Analytics.countDocuments({ type: 'click_whatsapp', location: 'cotia',     createdAt: range }),
            Analytics.countDocuments({ type: 'click_whatsapp', location: 'ibiuna',    createdAt: range }),
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
                for (const v of p.variations) { sr += v.stock_by_store?.SaoRoque ?? 0; co += v.stock_by_store?.Cotia ?? 0; ib += v.stock_by_store?.Ibiuna ?? 0; }
            } else {
                sr = p.stock_by_store?.SaoRoque ?? 0; co = p.stock_by_store?.Cotia ?? 0; ib = p.stock_by_store?.Ibiuna ?? 0;
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

http.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor JACK PEÇAS rodando com Socket.io na porta ${PORT}`);
});