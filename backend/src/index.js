const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// --- CONEXÃO COM BANCO DE DADOS ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Conectado ao MongoDB com sucesso!"))
    .catch((err) => console.error("❌ Erro ao conectar ao MongoDB:", err));

// --- SCHEMAS E MODELOS ---
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
    attributes: mongoose.Schema.Types.Mixed, // Para salvar os atributos dinâmicos
    image: String,
    hasVariations: { type: Boolean, default: false },
    variations: [{
        type: { type: String }, // Nome do campo 'type' para não conflitar com o Mongoose
        value: String,
        price: Number,
        stock: Number,
        sku: String
    }]
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

// --- CONFIGURAÇÃO DE UPLOAD ---
const PROJECT_ROOT = process.cwd();
const uploadDir = path.join(PROJECT_ROOT, 'uploads', 'produtos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname.replace(/\s/g, "_"))
});
const upload = multer({ storage });

app.use('/uploads', express.static(path.join(PROJECT_ROOT, 'uploads')));

// Função para deletar imagem antiga
const deleteFile = (relativeColPath) => {
    if (!relativeColPath) return;
    try {
        const cleanPath = relativeColPath.startsWith('/') ? relativeColPath.substring(1) : relativeColPath;
        const absolutePath = path.join(PROJECT_ROOT, cleanPath);
        if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    } catch (err) { console.error(`❌ Erro ao deletar arquivo: ${err.message}`); }
};

// --- ROTAS DE PRODUTOS ---

// LISTAR PRODUTOS
app.get('/api/products', async (req, res) => {
    try {
        const { page = 1, limit = 25, search, category, subcategory } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        let query = {};
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { sku: { $regex: search, $options: 'i' } }
            ];
        }
        if (category) query.category = category;
        if (subcategory) query.subcategory = subcategory;

        const [products, total] = await Promise.all([
            Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            Product.countDocuments(query)
        ]);
        res.json({ products, total, pages: Math.ceil(total / limit), currentPage: parseInt(page) });
    } catch (err) { res.status(500).json({ message: "Erro ao buscar" }); }
});

// CRIAR PRODUTO (RESOLVIDO DUPLICIDADE E PARSE)
app.post('/api/products', upload.single('image'), async (req, res) => {
    try {
        const data = req.body;

        // Converte Strings do FormData em Arrays/Objetos reais
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
            image: req.file ? `/uploads/produtos/${req.file.filename}` : null
        };

        const newProduct = new Product(productData);
        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) {
        console.error("❌ Erro no POST:", err);
        res.status(500).json({ error: err.message });
    }
});

// EDITAR PRODUTO
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
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
            if (product?.image) deleteFile(product.image);
            updateData.image = `/uploads/produtos/${req.file.filename}`;
        }

        const updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// EXCLUIR PRODUTO
app.delete('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product && product.image) deleteFile(product.image);
        await Product.findByIdAndDelete(req.params.id);
        res.sendStatus(204);
    } catch (err) { res.status(500).json({ message: "Erro ao excluir" }); }
});

// --- RESTANTE DAS ROTAS (LOGIN, CATEGORIAS, ATRIBUTOS) ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        return res.status(200).json({ message: "Sucesso!", redirect: "../dashboard.html" });
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
app.post('/api/attributes', async (req, res) => {
    const newAttr = new Attribute(req.body);
    await newAttr.save();
    res.status(201).json(newAttr);
});
app.put('/api/attributes/:id', async (req, res) => {
    res.json(await Attribute.findByIdAndUpdate(req.params.id, req.body, { new: true }));
});
app.delete('/api/attributes/:id', async (req, res) => {
    await Attribute.findByIdAndDelete(req.params.id);
    res.sendStatus(204);
});

app.get('/api/categories', async (req, res) => { res.json(await Category.find()); });
app.post('/api/categories', async (req, res) => {
    const newCat = new Category(req.body);
    await newCat.save();
    res.status(201).json(newCat);
});
app.put('/api/categories/:id', async (req, res) => {
    res.json(await Category.findByIdAndUpdate(req.params.id, req.body, { new: true }));
});
app.delete('/api/categories/:id', async (req, res) => {
    await Category.findByIdAndDelete(req.params.id);
    res.sendStatus(204);
});

app.listen(PORT, () => console.log(`🚀 Servidor Jack Peças Ativo: http://localhost:${PORT}`));