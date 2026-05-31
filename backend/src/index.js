const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const cron = require('node-cron');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURAÇÃO CLOUDINARY ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET
});

// --- CONEXÃO COM BANCO DE DADOS ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Conectado ao MongoDB Atlas!");
        // Inicia a sincronização inicial após conectar ao banco
        syncProductsFromBling();
    })
    .catch((err) => console.error("❌ Erro ao conectar ao MongoDB:", err));

// --- SCHEMAS E MODELOS ---

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

// Sub-schema seguro para evitar CastError nas variações
const variationItemSchema = new mongoose.Schema({
    sku: { type: String },
    name: { type: String },
    price: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    type: { type: String },
    value: { type: String }
}, { _id: false });

const productSchema = new mongoose.Schema({
    blingId: { type: String, unique: true, sparse: true }, 
    sku: { type: String },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, default: 0 },
    category: { type: String },
    subcategory: { type: String },
    hasVariations: { type: Boolean, default: false },
    variations: [variationItemSchema],
    image: { type: String, default: null },
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

// --- FUNÇÃO DE SINCRONIZAÇÃO (BLING -> MONGODB) ---
async function syncProductsFromBling() {
    console.log("🔄 Iniciando sincronização dinâmica por ID com Variações e Auto-Delete...");
    try {
        const tokenData = await BlingToken.findOne();
        if (!tokenData || !tokenData.access_token) {
            return console.log("⚠️ Sincronização interrompida: Sem credenciais no banco.");
        }

        let accessToken = tokenData.access_token;

        // --- RENOVAÇÃO DE TOKEN ---
        if (!tokenData.expires_at || new Date(Date.now() + 60000) > tokenData.expires_at) {
            console.log("🔄 Token expirado ou próximo de expirar. Renovando acesso...");
            const credentials = Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64');
            const refreshResponse = await axios.post('https://api.bling.com.br/v3/oauth/token', 
                new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokenData.refresh_token }), 
                { headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            const { access_token, refresh_token, expires_in } = refreshResponse.data;
            tokenData.access_token = access_token;
            tokenData.refresh_token = refresh_token;
            tokenData.expires_at = new Date(Date.now() + expires_in * 1000);
            await tokenData.save();
            accessToken = access_token;
            console.log("✅ Token Bling renovado com sucesso!");
        }

        let pagina = 1;
        let temMaisProdutos = true;
        let productsFromBling = [];

        console.log("📦 Buscando páginas de produtos no Bling...");
        while (temMaisProdutos) {
            try {
                const responseProdutos = await axios.get(`https://api.bling.com.br/v3/produtos?limite=100&pagina=${pagina}&criterio=1&tipo=P`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });

                const produtosPagina = responseProdutos.data.data || [];

                if (produtosPagina.length === 0) {
                    temMaisProdutos = false;
                } else {
                    productsFromBling = productsFromBling.concat(produtosPagina);
                    console.log(`📑 Página ${pagina} processada (${produtosPagina.length} itens estruturais encontrados).`);
                    pagina++;
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            } catch (errPage) {
                console.error(`❌ Erro crítico ao buscar a página ${pagina} do Bling. Interrompendo paginação.`);
                temMaisProdutos = false;
            }
        }

        if (productsFromBling.length === 0) {
            return console.log("ℹ️ Nenhum produto retornado pelo Bling.");
        }

        console.log(`✅ Coleta concluída! Total bruto de itens estruturais: ${productsFromBling.length}`);

        const responseDepositos = await axios.get('https://api.bling.com.br/Api/v3/depositos?situacao=1&limite=100', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const depositosAtivos = responseDepositos.data.data || [];

        const produtosSimples = productsFromBling.filter(p => p.formato !== 'V');
        const estoqueMap = {};

        if (produtosSimples.length > 0) {
            const tamanhoChunk = 50;
            for (let i = 0; i < produtosSimples.length; i += tamanhoChunk) {
                const chunk = produtosSimples.slice(i, i + tamanhoChunk);
                const queryIdsProdutosSimples = chunk.map(p => `idsProdutos[]=${p.id}`).join('&');

                for (const dep of depositosAtivos) {
                    try {
                        const responseEstoqueDep = await axios.get(`https://api.bling.com.br/Api/v3/estoques/saldos/${dep.id}?${queryIdsProdutosSimples}&filtroSaldoEstoque=1`, {
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                        });
                        const saldosDep = responseEstoqueDep.data.data || [];
                        saldosDep.forEach(item => {
                            if (item.produto && item.produto.id) {
                                const prodId = String(item.produto.id);
                                const saldoFisico = Number(item.saldoFisicoTotal || 0);
                                estoqueMap[prodId] = (estoqueMap[prodId] || 0) + saldoFisico;
                            }
                        });
                    } catch (errDep) { /* silencia */ }
                }
            }
        }

        const operations = [];
        const ignoredProducts = [];
        const idsBlingProcessados = []; 
        let contadorSimples = 0;

        for (const p of productsFromBling) {
            if (p.variacao && p.variacao.produtoPai) {
                ignoredProducts.push({ nome: p.nome, motivo: "Ignorado por ser produto filho isolado" });
                continue;
            }

            const currentBlingId = String(p.id);
            const productName = p.nome.toUpperCase();
            const skuFinal = String(p.codigo || "").trim();
            
            let finalCat = null;
            let finalSub = null;

            // --- MAPEAMENTO DE CATEGORIAS ---
            if ((productName.includes("TELA FRONTAL") || productName.includes("FRONTAL")) && !productName.includes("FLEX CÂMERA")) {
                finalCat = "Telas";
                if (productName.includes("IPHONE")) finalSub = "Telas Iphone";
                else if (productName.includes("SAMSUNG")) finalSub = "Telas Samsung";
                else if (productName.includes("MOTO") || productName.includes("MOTOROLA")) finalSub = "Telas Motorola";
                else if (productName.includes("XIAOMI") || productName.includes("POCO") || productName.includes("REDMI")) finalSub = "Telas Xiaomi";
                else if (productName.includes("REALME")) finalSub = "Telas Realme";
                else if (productName.includes("INFINIX")) finalSub = "Telas Infinix";
                else if (productName.includes("ASUS") || productName.includes("ZENFONE")) finalSub = "Telas Asus";
                else if (productName.includes("LG")) finalSub = "Telas LG";
                else if (productName.includes("OPPO")) finalSub = "Telas Oppo";
            } else if (productName.includes("BATERIA")) {
                finalCat = "Baterias";
                if (productName.includes("IPHONE")) finalSub = "Baterias Iphone";
                else if (productName.includes("SAMSUNG")) finalSub = "Baterias Samsung";
                else if (productName.includes("MOTO") || productName.includes("MOTOROLA")) finalSub = "Baterias Motorola";
                else if (productName.includes("XIAOMI") || productName.includes("POCO") || productName.includes("REDMI")) finalSub = "Baterias Xiaomi";
                else if (productName.includes("REALME")) finalSub = "Baterias Realme";
                else if (productName.includes("INFINIX")) finalSub = "Baterias Infinix";
                else if (productName.includes("ASUS") || productName.includes("ZENFONE")) finalSub = "Baterias Asus";
                else if (productName.includes("LG")) finalSub = "Baterias LG";
            } else if (productName.includes("PLACA DE CARGA")) {
                finalCat = "Placas de Carga";
                if (productName.includes("SAMSUNG")) finalSub = "Placa de Carga Samsung";
                else if (productName.includes("MOTO") || productName.includes("MOTOROLA")) finalSub = "Placa de Carga Motorola";
                else if (productName.includes("XIAOMI") || productName.includes("POCO") || productName.includes("REDMI")) finalSub = "Placa de Carga Xiaomi";
                else if (productName.includes("REALME")) finalSub = "Placa de Carga Realme";
                else if (productName.includes("INFINIX")) finalSub = "Placa de Carga Infinix";
                else if (productName.includes("ASUS") || productName.includes("ZENFONE")) finalSub = "Placa de Carga Asus";
                else if (productName.includes("LG")) finalSub = "Placa de Carga LG";
            } else if (productName.includes("CONECTOR DE CARGA") || productName.includes("FLEX DE CARGA")) {
                finalCat = "Conector de Carga";
                if (productName.includes("SAMSUNG")) finalSub = "Conector de Carga Samsung";
                else if (productName.includes("MOTO") || productName.includes("MOTOROLA")) finalSub = "Conector de Carga Motorola";
                else if (productName.includes("XIAOMI") || productName.includes("POCO") || productName.includes("REDMI")) finalSub = "Conector de Carga Xiaomi";
                else if (productName.includes("REALME")) finalSub = "Conector de Carga Realme";
                else if (productName.includes("INFINIX")) finalSub = "Conector de Carga Infinix";
                else if (productName.includes("ASUS") || productName.includes("ZENFONE")) finalSub = "Conector de Carga Asus";
                else if (productName.includes("LG")) finalSub = "Conector de Carga LG";
                else if (productName.includes("IPHONE")) finalSub = "Flex de Carga Iphone";
            } else if (productName.includes("TAMPA")) {
                finalCat = "Tampas Traseiras";
                if (productName.includes("SAMSUNG")) finalSub = "Tampa Traseira Samsung";
                else if (productName.includes("MOTO") || productName.includes("MOTOROLA")) finalSub = "Tampa Traseira Motorola";
                else if (productName.includes("XIAOMI") || productName.includes("POCO") || productName.includes("REDMI")) finalSub = "Tampa Traseira Xiaomi";
                else if (productName.includes("REALME")) finalSub = "Tampa Traseira Realme";
                else if (productName.includes("INFINIX")) finalSub = "Tampa Traseira Infinix";
                else if (productName.includes("ASUS") || productName.includes("ZENFONE")) finalSub = "Tampa Traseira Asus";
                else if (productName.includes("LG")) finalSub = "Tampa Traseira LG";
                else if (productName.includes("IPHONE")) finalSub = "Tampa Traseira Iphone";
            } else if (productName.includes("CABO") || productName.includes("CARREGADOR") || productName.includes("FONTE") || productName.includes("FONE DE OUVIDO") || productName.includes("CAIXA DE SOM")) {
                finalCat = "Acessórios";
                if (productName.includes("FONTE CARREGADOR") || productName.includes("FONTE")) finalSub = "Fontes";
                else if (productName.includes("CARREGADOR")) finalSub = "Carregadores";
                else if (productName.includes("CABO")) finalSub = "Cabos";
                else if (productName.includes("FONE DE OUVIDO")) finalSub = "Fones de Ouvido";
                else if (productName.includes("CAIXA DE SOM")) finalSub = "Caixa de som";
            }

            if (!finalCat || !finalSub) {
                ignoredProducts.push({ nome: p.nome, motivo: "Categoria/Subcategoria não mapeada" });
                continue;
            }

            idsBlingProcessados.push(currentBlingId);

            if (p.formato === 'V') {
                let variationsMapped = [];
                let estoqueTotalPai = 0;
                let erroVariacao = false;

                try {
                    await new Promise(resolve => setTimeout(resolve, 350));
                    const responseVar = await axios.get(`https://api.bling.com.br/Api/v3/produtos/variacoes/${p.id}`, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });

                    const listaFilhosBling = responseVar.data.data?.variacoes || [];

                    if (listaFilhosBling.length > 0) {
                        const queryIdsFilhos = listaFilhosBling.map(f => `idsProdutos[]=${f.id}`).join('&');
                        const estoqueFilhosMap = {};

                        await new Promise(resolve => setTimeout(resolve, 100));

                        for (const dep of depositosAtivos) {
                            try {
                                const responseEstoqueDep = await axios.get(`https://api.bling.com.br/Api/v3/estoques/saldos/${dep.id}?${queryIdsFilhos}&filtroSaldoEstoque=1`, {
                                    headers: { 'Authorization': `Bearer ${accessToken}` }
                                });
                                const saldosDep = responseEstoqueDep.data.data || [];
                                saldosDep.forEach(item => {
                                    if (item.produto && item.produto.id) {
                                        const fId = String(item.produto.id);
                                        estoqueFilhosMap[fId] = (estoqueFilhosMap[fId] || 0) + Number(item.saldoFisicoTotal || 0);
                                    }
                                });
                            } catch (e) { /* silencia */ }
                        }

                        listaFilhosBling.forEach(f => {
                            const estoqueFilhoCalculado = estoqueFilhosMap[String(f.id)] || 0;
                            estoqueTotalPai += estoqueFilhoCalculado;

                            let tipoVariacao = "Opção";
                            let valorVariacao = f.variacao?.nome || "Padrão";

                            if (f.variacao?.nome && f.variacao.nome.includes(":")) {
                                const partes = f.variacao.nome.split(":");
                                const tRaw = partes[0].trim().toLowerCase();
                                const vRaw = partes[1].trim().toLowerCase();
                                
                                tipoVariacao = tRaw.charAt(0).toUpperCase() + tRaw.slice(1);
                                valorVariacao = vRaw.charAt(0).toUpperCase() + vRaw.slice(1);
                            }

                            variationsMapped.push({
                                sku: String(f.codigo || "").trim() || `FILHO-${f.id}`,
                                name: f.nome,
                                price: parseFloat(f.preco) || 0,
                                stock: estoqueFilhoCalculado,
                                type: tipoVariacao,
                                value: valorVariacao
                            });
                        });
                    }
                } catch (errVar) {
                    erroVariacao = true;
                    console.log(`⚠️ Alerta: Problema nas variações do produto: ${p.nome}. Ignorando filhos.`);
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
                    updateFields.variations = variationsMapped;
                    updateFields.stock = Number(estoqueTotalPai);
                }

                operations.push({
                    updateOne: {
                        filter: { blingId: currentBlingId },
                        update: {
                            $set: updateFields,
                            $setOnInsert: { 
                                name: p.nome,
                                createdAt: new Date(), 
                                attributes: {}, 
                                image: null 
                            }
                        },
                        upsert: true
                    }
                });
            } else {
                const estoqueCalculado = estoqueMap[currentBlingId] || 0;

                operations.push({
                    updateOne: {
                        filter: { blingId: currentBlingId },
                        update: {
                            $set: {
                                blingId: currentBlingId,
                                sku: skuFinal || `SIMPLE-${currentBlingId}`,
                                price: parseFloat(p.preco) || 0,
                                stock: Number(estoqueCalculado),
                                category: finalCat,
                                subcategory: finalSub,
                                hasVariations: false,
                                variations: [],
                                updatedAt: new Date()
                            },
                            $setOnInsert: { 
                                name: p.nome,
                                createdAt: new Date(), 
                                attributes: {}, 
                                image: null 
                            }
                        },
                        upsert: true
                    }
                });

                contadorSimples++;
                if (contadorSimples % 150 === 0) {
                    console.log(`⚡ Processando lote: ${contadorSimples} produtos simples mapeados...`);
                }
            }
        }

        if (operations.length > 0) {
            const result = await Product.bulkWrite(operations);
            console.log(`\n--- RELATÓRIO JACK PEÇAS ---`);
            console.log(`📦 Filtro Operações Aplicadas: ${operations.length}`);
            console.log(`✨ Novos Inseridos: ${result.upsertedCount}`);
            console.log(`🔄 Atualizados no Mongo: ${result.modifiedCount}`);
            console.log(`----------------------------\n`);

            if (idsBlingProcessados.length > 0) {
                const resultadoLimpeza = await Product.deleteMany({
                    blingId: { $not: { $in: idsBlingProcessados } }
                });
                if (resultadoLimpeza.deletedCount > 0) {
                    console.log(`♻️ Auto-Clean: ${resultadoLimpeza.deletedCount} produtos excluídos por não constarem no Bling.`);
                }
            }
        }

        if (ignoredProducts.length > 0) {
            console.log(`\n🚫 --- PRODUTOS IGNORADOS NA SINCRONIZAÇÃO (${ignoredProducts.length} itens) ---`);
            console.table(ignoredProducts);
            console.log(`-------------------------------------------------------------------------\n`);
        }
    } catch (error) {
        console.error("❌ Erro na sincronização global:", error.response?.data || error.message);
    }
}

// --- MIDDLEWARES ---
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'jack_produtos',
        allowed_formats: ['jpg', 'png', 'webp', 'jpeg'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    },
});
const upload = multer({ storage });

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: "Token não fornecido." });
    try {
        const cleanToken = token.split(' ')[1] || token;
        const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) { return res.status(401).json({ message: "Sessão inválida." }); }
};

const deleteCloudinaryImage = async (publicId) => {
    if (!publicId) return;
    try { await cloudinary.uploader.destroy(publicId); } catch (err) { console.error("Erro Cloudinary:", err.message); }
};

// Variável de controle (trava) para evitar execuções simultâneas
let isSyncing = false;

// Rota dedicada e inteligente para o Cron-Job automatizado
app.get('/api/cron/sync', async (req, res) => {
    try {
        console.log("🔄 Cron-job chamou a rota de sincronização...");

        // 1. Verifica se já existe uma sincronização rodando neste momento
        if (isSyncing) {
            console.log("⚠️ Sincronização ignorada: Já existe um processo ativo rodando neste momento.");
            return res.status(200).json({
                success: true,
                message: "Sincronização já está em andamento. Requisição ignorada para evitar gargalos."
            });
        }

        // 2. RESPONDE IMEDIATAMENTE AO CRON-JOB (Menos de 1 segundo)
        // Usamos o status 202 que significa "Aceito para processamento"
        res.status(202).json({ 
            success: true, 
            message: "Sincronização iniciada em segundo plano com sucesso." 
        });

        // 3. EXECUTA A SINCRONIZAÇÃO EM SEGUNDO PLANO (Sem dar await na resposta HTTP)
        // Usamos uma função autoexecutável para isolar o processo
        (async () => {
            try {
                isSyncing = true; // Ativa a trava
                console.log("🚀 [Segundo Plano] Processo pesado iniciado. Estimativa: 7 minutos...");
                
                // Chamada da sua função pesada original
                // await suaFuncaoDeSincronizacao();
                
                console.log("✅ [Segundo Plano] Sincronização de 7 minutos concluída com sucesso!");
            } catch (syncError) {
                console.error("❌ [Segundo Plano] Erro crítico dentro do processo pesado:", syncError);
            } finally {
                isSyncing = false; // Libera a trava para a próxima hora (ou próximos 5 min de teste)
                console.log("🔓 [Segundo Plano] Trava liberada. Pronto para a próxima execução.");
            }
        })(); // O () no final executa a função imediatamente de forma assíncrona

    } catch (error) {
        console.error("❌ Erro ao tentar iniciar o Cron-job:", error);
        // Garante que a trava seja liberada caso mte antes do bloco asnc
        isSyncing = false; 
        return res.status(500).json({ success: false, error: error.message });
    }
});

// --- ROTAS DE AUTENTICAÇÃO BLING ---
app.get('/auth/bling', (req, res) => {
    const clientId = process.env.BLING_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.BLING_REDIRECT_URI);
    const authUrl = `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("Código não encontrado.");
    try {
        const credentials = Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64');
        const response = await axios.post('https://www.bling.com.br/Api/v3/oauth/token', 
            new URLSearchParams({ grant_type: 'authorization_code', code: code, redirect_uri: process.env.BLING_REDIRECT_URI }), 
            { headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const { access_token, refresh_token, expires_in } = response.data;
        await BlingToken.findOneAndUpdate({}, { access_token, refresh_token, expires_at: new Date(Date.now() + expires_in * 1000) }, { upsert: true });
        res.send("<h1>✅ Autorizado!</h1><p>O Jack Peças já está conectado ao Bling.</p>");
        syncProductsFromBling();
    } catch (error) { res.status(500).json(error.response?.data || error.message); }
});

app.post('/api/trigger-sync', async (req, res) => {
    console.log("⏱️ Gatilho externo recebido! Iniciando sincronização...");
    syncProductsFromBling()
        .then(() => console.log("✅ Sincronização de fundo concluída."))
        .catch(err => console.error("❌ Erro na sincronização de fundo:", err));
    res.json({ message: "Sincronização disparada com sucesso!", timestamp: new Date() });
});

// --- ROTAS DE API (PRODUTOS) ---
app.get('/api/products', async (req, res) => {
    try {
        const { page = 1, limit = 25, search, category, subcategory } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        let finalQuery = {};
        if (category) finalQuery.category = category;
        if (subcategory) finalQuery.subcategory = subcategory;

        if (search) {
            const searchTerm = search.trim();
            finalQuery.$or = [
                { name: { $regex: searchTerm, $options: 'i' } },
                { sku: searchTerm }
            ];
        }

        const [products, total] = await Promise.all([
            Product.find(finalQuery).sort({ blingId: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Product.countDocuments(finalQuery)
        ]);
        res.json({ products, total, pages: Math.ceil(total / limit), currentPage: parseInt(page) });
    } catch (err) { res.status(500).json({ message: "Erro ao carregar produtos" }); }
});

app.post('/api/products', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const productData = { ...req.body };
        if (typeof productData.variations === 'string') {
            try { productData.variations = JSON.parse(productData.variations); } catch (e) { productData.variations = []; }
        }
        if (productData.attributes) {
            if (typeof productData.attributes === 'string') {
                try { productData.attributes = JSON.parse(productData.attributes); } catch (e) { productData.attributes = {}; }
            }
        } else { productData.attributes = {}; }

        if (req.file) productData.image = req.file.path;
        const newProduct = new Product(productData);
        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/products/:id', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const productData = { ...req.body };
        if (typeof productData.variations === 'string') {
            try { productData.variations = JSON.parse(productData.variations); } catch (e) { productData.variations = []; }
        }
        if (productData.attributes) {
            if (typeof productData.attributes === 'string') {
                try { productData.attributes = JSON.parse(productData.attributes); } catch (e) { productData.attributes = {}; }
            }
        } else { productData.attributes = {}; }

        if (req.file) productData.image = req.file.path;
        const updated = await Product.findByIdAndUpdate(req.params.id, productData, { new: true, runValidators: true });
        if (!updated) return res.status(404).json({ message: "Produto não encontrado." });
        res.json(updated);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/products/:id', verifyToken, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product?.imagePublicId) await deleteCloudinaryImage(product.imagePublicId);
        await Product.findByIdAndDelete(req.params.id);
        res.sendStatus(204);
    } catch (err) { res.status(500).json({ message: "Erro ao excluir" }); }
});

// --- RESTANTE DAS ROTAS ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
        return res.status(200).json({ message: "Sucesso!", token: token });
    }
    res.status(401).json({ message: "E-mail ou senha incorretos." });
});

// 📊 ROTA DO DASHBOARD ATUALIZADA (PRODUTOS + FILTRO TEMPORAL DE ACESSOS)
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const { period, startDate, endDate } = req.query;
        
        let startActual, endActual;
        let startCompare, endCompare;

        const agora = new Date();

        // 1. Definição estrita dos períodos baseada na escolha do usuário
        if (period === 'today') {
            // Hoje: das 00:00:00 às 23:59:59 de hoje
            startActual = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);
            endActual = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);

            // Ontem para comparação: das 00:00:00 às 23:59:59 de ontem
            startCompare = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1, 0, 0, 0);
            endCompare = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1, 23, 59, 59);

        } else if (period === '15days') {
            // Últimos 15 dias contando retroativamente a partir de agora
            startActual = new Date(agora.getTime() - (15 * 24 * 60 * 60 * 1000));
            endActual = agora;

            // Intervalo de 15 dias imediatamente anterior para comparação
            startCompare = new Date(startActual.getTime() - (15 * 24 * 60 * 60 * 1000));
            endCompare = startActual;

        } else if (period === 'custom' && startDate && endDate) {
            // Período Personalizado (Ex: 01/05 até 10/05)
            // Divide a string "AAAA-MM-DD" para evitar problemas com fuso horário UTC
            const [sYear, sMonth, sDay] = startDate.split('-');
            const [eYear, eMonth, eDay] = endDate.split('-');

            startActual = new Date(sYear, sMonth - 1, sDay, 0, 0, 0);
            endActual = new Date(eYear, eMonth - 1, eDay, 23, 59, 59);

            // Período personalizado livre não gera comparação pré-calculada automática
            startCompare = null;
            endCompare = null;
        } else {
            // Padrão: Últimos 30 dias
            startActual = new Date(agora.getTime() - (30 * 24 * 60 * 60 * 1000));
            endActual = agora;

            startCompare = new Date(startActual.getTime() - (30 * 24 * 60 * 60 * 1000));
            endCompare = startActual;
        }

        // 2. CONSULTAS AO BANCO FILTRADAS COM OPERADORES $gte E $lte
        // Substitua 'AnalyticsModel' pelo seu modelo/coleção real do banco
        
        // --- MÉTRICAS DO PERÍODO SELECIONADO ---
        const totalVisits = await AnalyticsModel.countDocuments({ 
            type: 'pageview', 
            createdAt: { $gte: startActual, $lte: endActual } 
        });

        const uniqueUsers = await AnalyticsModel.countDocuments({ 
            type: 'pageview', 
            isNewUser: true, 
            createdAt: { $gte: startActual, $lte: endActual } 
        });

        const clickSaoRoque = await AnalyticsModel.countDocuments({ type: 'click_whatsapp', location: 'sao_roque', createdAt: { $gte: startActual, $lte: endActual } });
        const clickCotia = await AnalyticsModel.countDocuments({ type: 'click_whatsapp', location: 'cotia', createdAt: { $gte: startActual, $lte: endActual } });
        const clickIbiuna = await AnalyticsModel.countDocuments({ type: 'click_whatsapp', location: 'ibiuna', createdAt: { $gte: startActual, $lte: endActual } });

        // --- MÉTRICAS DO HISTÓRICO DE COMPARAÇÃO ---
        let totalVisitsCompare = 0;
        let uniqueUsersCompare = 0;

        if (startCompare && endCompare) {
            totalVisitsCompare = await AnalyticsModel.countDocuments({ 
                type: 'pageview', 
                createdAt: { $gte: startCompare, $lte: endCompare } 
            });
            uniqueUsersCompare = await AnalyticsModel.countDocuments({ 
                type: 'pageview', 
                isNewUser: true, 
                createdAt: { $gte: startCompare, $lte: endCompare } 
            });
        }

        // Dados globais estáveis
        const totalProducts = await ProductModel.countDocuments({});
        const categoriesStats = {}; // Sua lógica existente de contagem por categorias...

        // 3. RETORNO DE DADOS SEPARADOS E LIMPOS
        return res.status(200).json({
            total: totalProducts,
            categories: categoriesStats,
            analytics: {
                totalVisits,
                uniqueUsers,
                clicks: {
                    sao_roque: clickSaoRoque,
                    cotia: clickCotia,
                    ibiuna: clickIbiuna
                },
                compare: {
                    hasCompare: !!startCompare,
                    totalVisitsCompare,
                    uniqueUsersCompare
                }
            }
        });

    } catch (error) {
        console.error("Erro ao processar analytics no backend:", error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

app.get('/api/attributes', async (req, res) => { res.json(await Attribute.find()); });
app.post('/api/attributes', verifyToken, async (req, res) => {
    const newAttr = new Attribute(req.body);
    await newAttr.save();
    res.status(201).json(newAttr);
});
app.put('/api/attributes/:id', verifyToken, async (req, res) => {
    res.json(await Attribute.findByIdAndUpdate(req.params.id, req.body, { new: true }));
});
app.delete('/api/attributes/:id', verifyToken, async (req, res) => {
    await Attribute.findByIdAndDelete(req.params.id);
    res.sendStatus(204);
});

app.get('/api/categories', async (req, res) => { res.json(await Category.find()); });
app.post('/api/categories', verifyToken, async (req, res) => {
    const newCat = new Category(req.body);
    await newCat.save();
    res.status(201).json(newCat);
});
app.put('/api/categories/:id', verifyToken, async (req, res) => {
    res.json(await Category.findByIdAndUpdate(req.params.id, req.body, { new: true }));
});
app.delete('/api/categories/:id', verifyToken, async (req, res) => {
    await Category.findByIdAndDelete(req.params.id);
    res.sendStatus(204);
});

app.post('/api/products/batch', verifyToken, async (req, res) => {
    try {
        const { products } = req.body;
        if (!products || !Array.isArray(products)) {
            return res.status(400).json({ error: "O corpo da requisição deve ser um array." });
        }
        
        const operations = products.map(p => {
            const filterQuery = p.blingId ? { blingId: String(p.blingId) } : { sku: p.sku };
            return {
                updateOne: {
                    filter: filterQuery, 
                    update: { $set: p },
                    upsert: true 
                }
            };
        });
        
        const result = await Product.bulkWrite(operations);
        res.status(200).json({ message: "Lote processado com sucesso", detalhes: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 📥 POST /api/analytics (SALVA OS ACESSOS ENVIADOS PELO CATÁLOGO)
app.post('/api/analytics', async (req, res) => {
    try {
        const { type, location, isNewUser } = req.body;
        if (!type || !location) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }

        const newEvent = new Analytics({
            type,
            location,
            isNewUser: !!isNewUser
        });

        await newEvent.save();
        return res.status(201).json({ success: true });
    } catch (error) {
        console.error('Erro ao salvar analytics:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor JACK PEÇAS rodando na porta ${PORT}`);
});