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

// --- CONEXÃO COM BANCO DE DADOS MONGODB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado ao MongoDB com sucesso!"))
  .catch((err) => console.error("❌ Erro ao conectar ao MongoDB:", err));

// --- SCHEMAS E MODELOS (ESTRUTURA DO BANCO) ---

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
    price: Number,
    stock: Number,
    attributes: mongoose.Schema.Types.Mixed, // Permite objetos flexíveis
    image: String
}, { timestamps: true }); // Adiciona data de criação e atualização automaticamente
const Product = mongoose.model('Product', productSchema);

// --- CONFIGURAÇÃO DE CAMINHOS E UPLOAD ---
const PROJECT_ROOT = process.cwd();
const uploadDir = path.join(PROJECT_ROOT, 'uploads', 'produtos');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const deleteFile = (relativeColPath) => {
    if (!relativeColPath) return;
    try {
        const cleanPath = relativeColPath.startsWith('/') ? relativeColPath.substring(1) : relativeColPath;
        const absolutePath = path.join(PROJECT_ROOT, cleanPath);
        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
            console.log(`✅ Arquivo removido: ${absolutePath}`);
        }
    } catch (err) {
        console.error(`❌ Erro ao deletar arquivo: ${err.message}`);
    }
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        cb(null, Date.now() + "_" + file.originalname.replace(/\s/g, "_"));
    }
});
const upload = multer({ storage });

app.use('/uploads', express.static(path.join(PROJECT_ROOT, 'uploads')));

// --- ROTA DE LOGIN ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        return res.status(200).json({ message: "Sucesso!", redirect: "../dashboard.html" });
    }
    res.status(401).json({ message: "E-mail ou senha incorretos." });
});

// --- ROTA DO DASHBOARD ---
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const totalProducts = await Product.countDocuments();
        const categories = await Category.find();
        const stats = {};

        for (let cat of categories) {
            stats[cat.name] = await Product.countDocuments({ category: cat.name });
        }

        res.json({ total: totalProducts, categories: stats });
    } catch (err) {
        res.status(500).json({ message: "Erro ao carregar estatísticas" });
    }
});

// --- ROTAS DE PRODUTOS ---
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: "Erro ao buscar produtos" });
    }
});

app.post('/api/products', upload.single('image'), async (req, res) => {
    try {
        const { sku, name, category, subcategory, price, stock, attributes } = req.body;
        
        let parsedAttributes = {};
        if (attributes) {
            parsedAttributes = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;
        }

        const newProduct = new Product({
            sku,
            name,
            category,
            subcategory,
            price: parseFloat(price) || 0,
            stock: parseInt(stock) || 0,
            attributes: parsedAttributes,
            image: req.file ? `/uploads/produtos/${req.file.filename}` : null
        });

        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) { 
        res.status(500).json({ message: "Erro no cadastro" }); 
    }
});

app.put('/api/products/:id', upload.single('image'), async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: "Produto não encontrado" });

        if (req.file && product.image) deleteFile(product.image);

        let updatedAttributes = product.attributes;
        if (req.body.attributes) {
            try {
                updatedAttributes = typeof req.body.attributes === 'string' ? JSON.parse(req.body.attributes) : req.body.attributes;
            } catch (e) { console.error("Erro parse attributes"); }
        }

        const updateData = {
            sku: req.body.sku || product.sku,
            name: req.body.name || product.name,
            category: req.body.category || product.category,
            subcategory: req.body.subcategory || product.subcategory,
            price: parseFloat(req.body.price) || product.price,
            stock: parseInt(req.body.stock) || product.stock,
            attributes: updatedAttributes
        };

        if (req.file) {
            updateData.image = `/uploads/produtos/${req.file.filename}`;
        }

        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(updatedProduct);
    } catch (err) {
        res.status(500).json({ message: "Erro na atualização" });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product && product.image) deleteFile(product.image);
        
        await Product.findByIdAndDelete(req.params.id);
        res.sendStatus(204);
    } catch (err) {
        res.status(500).json({ message: "Erro ao excluir produto" });
    }
});

// --- ROTAS DE ATRIBUTOS ---
app.get('/api/attributes', async (req, res) => {
    const attrs = await Attribute.find();
    res.json(attrs);
});

app.post('/api/attributes', async (req, res) => {
    const newAttr = new Attribute(req.body);
    await newAttr.save();
    res.status(201).json(newAttr);
});

app.put('/api/attributes/:id', async (req, res) => {
    const updated = await Attribute.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
});

app.delete('/api/attributes/:id', async (req, res) => {
    await Attribute.findByIdAndDelete(req.params.id);
    res.sendStatus(204);
});

// --- ROTAS DE CATEGORIAS ---
app.get('/api/categories', async (req, res) => {
    const cats = await Category.find();
    res.json(cats);
});

app.post('/api/categories', async (req, res) => {
    const newCat = new Category(req.body);
    await newCat.save();
    res.status(201).json(newCat);
});

app.put('/api/categories/:id', async (req, res) => {
    const updated = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
});

app.delete('/api/categories/:id', async (req, res) => {
    await Category.findByIdAndDelete(req.params.id);
    res.sendStatus(204);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor Jack Peças Ativo: http://localhost:${PORT}`);
});