const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
// Removido 'fs' pois não usaremos mais pastas locais
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// --- NOVAS IMPORTAÇÕES PARA CLOUDINARY ---
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
app.use(cors({
    origin: '*', // Em produção, você pode trocar '*' pelo link do seu site na Vercel
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 3000;

// --- CONFIGURAÇÃO CLOUDINARY ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET
});

// --- CONEXÃO COM BANCO DE DADOS ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Conectado ao MongoDB Atlas!"))
    .catch((err) => console.error("❌ Erro ao conectar ao MongoDB:", err));

// --- SCHEMAS E MODELOS (Mantidos iguais) ---
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

const productSchema = new mongoose.Schema({
    sku: String,
    name: String,
    category: String,
    subcategory: String,
    price: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    attributes: mongoose.Schema.Types.Mixed,
    image: String,
    imagePublicId: String, // Adicionado para facilitar exclusão no Cloudinary
    hasVariations: { type: Boolean, default: false },
    variations: [{
        type: { type: String },
        value: String,
        price: Number,
        stock: Number,
        sku: String
    }]
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
productSchema.index({ name: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ category: 1, subcategory: 1, createdAt: -1 });

// --- CONFIGURAÇÃO DE UPLOAD (AGORA NO CLOUDINARY) ---
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'jack_produtos', // Nome da pasta no Cloudinary
        allowed_formats: ['jpg', 'png', 'webp', 'jpeg'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }] // Otimiza tamanho
    },
});
const upload = multer({ storage });

// Função para deletar imagem do Cloudinary
const deleteCloudinaryImage = async (publicId) => {
    if (!publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (err) { console.error(`❌ Erro ao deletar no Cloudinary: ${err.message}`); }
};

// Middleware de Autenticação (Mantido igual)
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: "Token não fornecido." });
    try {
        const cleanToken = token.split(' ')[1] || token;
        const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Sessão inválida ou expirada." });
    }
};

// --- ROTAS DE PRODUTOS ---

// LISTAR PRODUTOS (Mantido igual)
app.get('/api/products', async (req, res) => {
    try {
        const { page = 1, limit = 25, search, category, subcategory } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        let baseQuery = {};
        if (category) baseQuery.category = category;
        if (subcategory) baseQuery.subcategory = subcategory;
        let finalQuery = { ...baseQuery };

        if (search) {
            const searchTerm = search.trim();
            const keywords = searchTerm.split(/\s+/);
            const nameConditions = keywords.map(word => {
                const s = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regexPattern = `(^|\\s|[\\/\\-])(${s})($|\\s|[\\/\\-])`;
                return { name: { $regex: regexPattern, $options: 'i' } };
            });
            finalQuery.$and = [
                ...(baseQuery.$and || []),
                {
                    $or: [
                        { $and: nameConditions },
                        { sku: searchTerm }
                    ]
                }
            ];
            delete finalQuery.category;
            delete finalQuery.subcategory;
            if (category) finalQuery.$and.unshift({ category });
            if (subcategory) finalQuery.$and.unshift({ subcategory });
        }

        const [products, total] = await Promise.all([
            Product.find(finalQuery).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Product.countDocuments(finalQuery)
        ]);

        res.json({ products, total, pages: Math.ceil(total / limit), currentPage: parseInt(page) });
    } catch (err) { 
        res.status(500).json({ message: "Erro ao carregar produtos" }); 
    }
});

// CRIAR PRODUTO (AJUSTADO PARA CLOUDINARY)
app.post('/api/products', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const data = req.body;
        let variations = [];
        if (data.variations) {
            try { variations = typeof data.variations === 'string' ? JSON.parse(data.variations) : data.variations; } 
            catch (e) { variations = []; }
        }

        let attributes = {};
        if (data.attributes) {
            try { attributes = typeof data.attributes === 'string' ? JSON.parse(data.attributes) : data.attributes; }
            catch (e) { attributes = {}; }
        }

        const productData = {
            sku: data.sku,
            name: data.name,
            category: data.category,
            subcategory: data.subcategory,
            price: parseFloat(data.price) || 0,
            stock: parseInt(data.stock) || 0,
            attributes: attributes,
            hasVariations: data.hasVariations === 'true' || data.hasVariations === true,
            variations: variations,
            // req.file.path agora é o link https direto do Cloudinary
            image: req.file ? req.file.path : null,
            imagePublicId: req.file ? req.file.filename : null // Guardamos para deletar depois
        };

        const newProduct = new Product(productData);
        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// EDITAR PRODUTO (AJUSTADO PARA CLOUDINARY)
app.put('/api/products/:id', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const data = req.body;
        if (data.variations) data.variations = typeof data.variations === 'string' ? JSON.parse(data.variations) : data.variations;
        if (data.attributes) data.attributes = typeof data.attributes === 'string' ? JSON.parse(data.attributes) : data.attributes;

        const updateData = {
            ...data,
            price: parseFloat(data.price) || 0,
            stock: parseInt(data.stock) || 0,
            hasVariations: data.hasVariations === 'true' || data.hasVariations === true
        };

        if (req.file) {
            const product = await Product.findById(req.params.id);
            // Deleta a imagem antiga do Cloudinary
            if (product?.imagePublicId) await deleteCloudinaryImage(product.imagePublicId);
            
            updateData.image = req.file.path;
            updateData.imagePublicId = req.file.filename;
        }

        const updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// EXCLUIR PRODUTO (AJUSTADO PARA CLOUDINARY)
app.delete('/api/products/:id', verifyToken, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product?.imagePublicId) await deleteCloudinaryImage(product.imagePublicId);
        await Product.findByIdAndDelete(req.params.id);
        res.sendStatus(204);
    } catch (err) { res.status(500).json({ message: "Erro ao excluir" }); }
});

// --- RESTANTE DAS ROTAS (MANTIDAS IGUAIS) ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
        return res.status(200).json({ message: "Sucesso!", token: token });
    }
    res.status(401).json({ message: "E-mail ou senha incorretos." });
});

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const totalProducts = await Product.countDocuments();
        const categories = await Category.find();
        const stats = {};
        for (let cat of categories) {
            stats[cat.name] = await Product.countDocuments({ category: cat.name });
        }
        res.json({ total: totalProducts, categories: stats });
    } catch (err) { res.status(500).json({ message: "Erro ao carregar estatísticas" }); }
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
        if (!products || !Array.isArray(products)) return res.status(400).json({ error: "O corpo da requisição deve ser um array." });
        const operations = products.map(p => ({
            updateOne: {
                filter: { sku: p.sku }, 
                update: { $set: p },
                upsert: true 
            }
        }));
        const result = await Product.bulkWrite(operations);
        res.status(200).json({ message: "Sincronização concluída!", detalhes: result });
    } catch (err) {
        res.status(500).json({ error: "Erro interno ao processar produtos." });
    }
});

// A porta e o host 0.0.0.0 são essenciais para o Railway
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});