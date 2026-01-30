const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// --- CONFIGURAÇÃO DE CAMINHOS ---
const PROJECT_ROOT = process.cwd();
const uploadDir = path.join(PROJECT_ROOT, 'uploads', 'produtos');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Helper para deletar arquivos físicos
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

// --- BANCO DE DADOS TEMPORÁRIO ---
let products = [
    { id: 1, sku: "T-IP13-INC", name: "Tela iPhone 13", category: "Telas Displays", subcategory: "Iphone", stock: 10, price: 250.00, attributes: {}, image: null }
];

let customAttributes = [
    { id: 1, category: "Telas Displays", name: "Qualidade", type: "select", options: ["Incell", "OLED", "Skytech"] }
];

let categoriesStructure = [
    { id: 1, name: "Telas Displays", subcategories: ["Samsung", "Motorola", "Iphone", "Xiaomi"] },
    { id: 2, name: "Baterias", subcategories: ["Samsung", "Motorola", "Iphone"] }
];

// --- ROTA DE LOGIN E DASHBOARD ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        return res.status(200).json({ message: "Sucesso!", redirect: "../dashboard.html" });
    }
    res.status(401).json({ message: "E-mail ou senha incorretos." });
});

app.get('/api/dashboard/stats', (req, res) => {
    const stats = {};
    categoriesStructure.forEach(cat => stats[cat.name] = 0);
    products.forEach(p => { if (stats[p.category] !== undefined) stats[p.category]++; });
    res.json({ total: products.length, categories: stats });
});

// --- ROTAS DE PRODUTOS ---
app.get('/api/products', (req, res) => res.json([...products].reverse()));

app.post('/api/products', upload.single('image'), (req, res) => {
    try {
        const { sku, name, category, subcategory, price, stock, attributes } = req.body;
        
        // Multer envia objetos como string, precisamos converter:
        let parsedAttributes = {};
        if (attributes) {
            parsedAttributes = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;
        }

        const newProduct = {
            id: Date.now(),
            sku: sku || "",
            name: name || "Novo Produto",
            category: category || "",
            subcategory: subcategory || "",
            price: parseFloat(price) || 0,
            stock: parseInt(stock) || 0,
            attributes: parsedAttributes,
            image: req.file ? `/uploads/produtos/${req.file.filename}` : null
        };
        products.push(newProduct);
        res.status(201).json(newProduct);
    } catch (err) { res.status(500).json({ message: "Erro no cadastro" }); }
});

app.put('/api/products/:id', upload.single('image'), (req, res) => {
    const id = parseInt(req.params.id);
    const index = products.findIndex(p => p.id === id);
    if (index === -1) return res.status(404).json({ message: "Não encontrado" });

    const oldProduct = products[index];
    if (req.file && oldProduct.image) deleteFile(oldProduct.image);

    let updatedAttributes = oldProduct.attributes;
    if (req.body.attributes) {
        try {
            updatedAttributes = typeof req.body.attributes === 'string' ? JSON.parse(req.body.attributes) : req.body.attributes;
        } catch (e) { console.error("Erro parse attributes"); }
    }

    products[index] = {
        ...oldProduct,
        sku: req.body.sku || oldProduct.sku,
        name: req.body.name || oldProduct.name,
        category: req.body.category || oldProduct.category,
        subcategory: req.body.subcategory || oldProduct.subcategory,
        price: parseFloat(req.body.price) || oldProduct.price,
        stock: parseInt(req.body.stock) || oldProduct.stock,
        attributes: updatedAttributes,
        image: req.file ? `/uploads/produtos/${req.file.filename}` : oldProduct.image
    };
    res.json(products[index]);
});

app.delete('/api/products/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = products.findIndex(p => p.id === id);
    if (index !== -1) {
        if (products[index].image) deleteFile(products[index].image);
        products.splice(index, 1);
        res.sendStatus(204);
    } else { res.status(404).json({ message: "Não encontrado" }); }
});

// --- ROTAS DE ATRIBUTOS (Requisitado por attributes_manager.js) ---
app.get('/api/attributes', (req, res) => res.json(customAttributes));

app.post('/api/attributes', (req, res) => {
    const newAttr = { id: Date.now(), ...req.body };
    customAttributes.push(newAttr);
    res.status(201).json(newAttr);
});

app.put('/api/attributes/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = customAttributes.findIndex(a => a.id === id);
    if (index !== -1) {
        customAttributes[index] = { ...customAttributes[index], ...req.body, id };
        res.json(customAttributes[index]);
    } else { res.status(404).json({ message: "Atributo não encontrado" }); }
});

app.delete('/api/attributes/:id', (req, res) => {
    const id = parseInt(req.params.id);
    customAttributes = customAttributes.filter(a => a.id !== id);
    res.sendStatus(204);
});

// --- ROTAS DE CATEGORIAS (Requisitado por categories.js) ---
app.get('/api/categories', (req, res) => res.json(categoriesStructure));

app.post('/api/categories', (req, res) => {
    const newCat = { id: Date.now(), ...req.body };
    categoriesStructure.push(newCat);
    res.status(201).json(newCat);
});

app.put('/api/categories/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = categoriesStructure.findIndex(c => c.id === id);
    if (index !== -1) {
        categoriesStructure[index] = { ...categoriesStructure[index], ...req.body, id };
        res.json(categoriesStructure[index]);
    } else { res.status(404).json({ message: "Categoria não encontrada" }); }
});

app.delete('/api/categories/:id', (req, res) => {
    const id = parseInt(req.params.id);
    // O categories.js já faz a validação de produtos no front, mas aqui garantimos no back
    categoriesStructure = categoriesStructure.filter(c => c.id !== id);
    res.sendStatus(204);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor Jack Peças Ativo: http://localhost:${PORT}`);
});