const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { body, validationResult, query } = require('express-validator');
const debug = require('debug')('app');
require('dotenv').config();

const app = express();
app.use(express.json());

let connectionAttempts = 0;
const MAX_RETRIES = 3;

async function connectToMongoDB() {
    if (mongoose.connection.readyState === 1) return true;
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: 'loganccs'
        });
        debug('Connected to MongoDB');
        connectionAttempts = 0;
        return true;
    } catch (err) {
        connectionAttempts++;
        debug('MongoDB connection error: %s', err.message);
        if (connectionAttempts < MAX_RETRIES) {
            debug('Retrying MongoDB connection (%d/%d)', connectionAttempts, MAX_RETRIES);
            setTimeout(connectToMongoDB, 5000);
        } else {
            debug('Max MongoDB connection retries reached');
        }
        return false;
    }
}

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    balance: { type: Number, default: 1000 },
    createdAt: { type: Date, default: Date.now }
});

const CardPriceSchema = new mongoose.Schema({
    nivel: { type: String, required: true, unique: true },
    price: { type: Number, required: true }
});

const PurchaseSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nivel: { type: String, required: true },
    price: { type: Number, required: true },
    purchasedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const CardPrice = mongoose.model('CardPrice', CardPriceSchema);
const Purchase = mongoose.model('Purchase', PurchaseSchema);

async function checkCollections() {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        return {
            User: { exists: collectionNames.includes('users'), accessible: await User.countDocuments().then(() => true).catch(() => false) },
            CardPrice: { exists: collectionNames.includes('cardprices'), accessible: await CardPrice.countDocuments().then(() => true).catch(() => false) },
            Purchase: { exists: collectionNames.includes('purchases'), accessible: await Purchase.countDocuments().then(() => true).catch(() => false) }
        };
    } catch (err) {
        debug('Error checking collections: %s', err.message);
        return {
            User: { exists: false, accessible: false },
            CardPrice: { exists: false, accessible: false },
            Purchase: { exists: false, accessible: false }
        };
    }
}

app.get('/api/check-env', async (req, res) => {
    debug('Checking environment and MongoDB connection');
    try {
        const mongodbConnected = await connectToMongoDB();
        const collections = await checkCollections();
        const environment = {
            MONGODB_URI: { exists: !!process.env.MONGODB_URI },
            ADMIN_PASSWORD: { exists: !!process.env.ADMIN_PASSWORD },
            NODE_VERSION: { exists: !!process.env.NODE_VERSION }
        };
        debug('Environment check: %O', { mongodbConnected, collections, environment });
        res.json({ mongodbConnected, collections, environment });
    } catch (err) {
        debug('Error checking environment: %s', err.message);
        res.status(500).json({ error: 'Erro ao verificar ambiente' });
    }
});

app.post('/api/register', [
    body('username').isString().trim().isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9]+$/),
    body('password').isString().isLength({ min: 6 })
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB not connected');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Validation errors: %O', errors.array());
        return res.status(400).json({ error: 'Dados inválidos' });
    }
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            debug('User already exists: %s', username);
            return res.status(400).json({ error: 'Usuário já existe' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const isAdmin = username === 'LVz' && password === process.env.ADMIN_PASSWORD;
        const user = new User({ username, password: hashedPassword, isAdmin });
        await user.save();
        debug('User registered: %s, isAdmin: %s', username, isAdmin);
        res.status(201).json({ message: 'Usuário registrado' });
    } catch (err) {
        debug('Error registering user: %s', err.message);
        res.status(500).json({ error: 'Erro ao registrar usuário' });
    }
});

app.post('/api/login', [
    body('username').isString().trim().notEmpty(),
    body('password').isString().notEmpty()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB not connected');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Validation errors: %O', errors.array());
        return res.status(400).json({ error: 'Dados inválidos' });
    }
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            debug('Login failed: User not found: %s', username);
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            debug('Login failed: Invalid password for %s', username);
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        debug('Login successful: %s, isAdmin: %s', username, user.isAdmin);
        res.json({ userId: user._id, username: user.username, is_admin: user.isAdmin });
    } catch (err) {
        debug('Error logging in: %s', err.message);
        res.status(500).json({ error: 'Erro ao logar' });
    }
});

app.get('/api/user', [
    query('userId').isMongoId()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB not connected');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Validation errors: %O', errors.array());
        return res.status(400).json({ error: 'ID de usuário inválido' });
    }
    try {
        const user = await User.findById(req.query.userId);
        if (!user) {
            debug('User not found: %s', req.query.userId);
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json({ username: user.username, balance: user.balance, isAdmin: user.isAdmin });
    } catch (err) {
        debug('Error fetching user: %s', err.message);
        res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
});

app.get('/api/users', [
    query('userId').isMongoId()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB not connected');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Validation errors: %O', errors.array());
        return res.status(400).json({ error: 'ID de usuário inválido' });
    }
    try {
        const admin = await User.findById(req.query.userId);
        if (!admin || !admin.isAdmin) {
            debug('Access denied: Not admin or user not found: %s', req.query.userId);
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const users = await User.find({}, 'username isAdmin balance createdAt');
        res.json(users);
    } catch (err) {
        debug('Error fetching users: %s', err.message);
        res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
});

app.delete('/api/delete-user', [
    query('userId').isMongoId(),
    query('targetId').isMongoId()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB not connected');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Validation errors: %O', errors.array());
        return res.status(400).json({ error: 'ID de usuário inválido' });
    }
    try {
        const admin = await User.findById(req.query.userId);
        if (!admin || !admin.isAdmin) {
            debug('Access denied: Not admin or user not found: %s', req.query.userId);
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const target = await User.findById(req.query.targetId);
        if (!target) {
            debug('Target user not found: %s', req.query.targetId);
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        if (target.username === 'LVz') {
            debug('Attempt to delete admin user LVz');
            return res.status(403).json({ error: 'Não é possível excluir o administrador principal' });
        }
        await User.deleteOne({ _id: req.query.targetId });
        debug('User deleted: %s', req.query.targetId);
        res.json({ message: 'Usuário excluído' });
    } catch (err) {
        debug('Error deleting user: %s', err.message);
        res.status(500).json({ error: 'Erro ao excluir usuário' });
    }
});

app.get('/api/get-card-prices', [
    query('userId').isMongoId()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB not connected');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Validation errors: %O', errors.array());
        return res.status(400).json({ error: 'ID de usuário inválido' });
    }
    try {
        const prices = await CardPrice.find();
        if (!prices.length) {
            const defaultPrices = [
                { nivel: 'Classic', price: 100 },
                { nivel: 'Gold', price: 200 },
                { nivel: 'Platinum', price: 300 },
                { nivel: 'Black', price: 500 }
            ];
            await CardPrice.insertMany(defaultPrices);
            debug('Default card prices initialized');
            return res.json(defaultPrices);
        }
        res.json(prices);
    } catch (err) {
        debug('Error fetching card prices: %s', err.message);
        res.status(500).json({ error: 'Erro ao buscar preços' });
    }
});

app.post('/api/set-card-prices', [
    query('userId').isMongoId(),
    body('prices').isArray(),
    body('prices.*.nivel').isIn(['Classic', 'Gold', 'Platinum', 'Black']),
    body('prices.*.price').isFloat({ min: 0.01 })
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB not connected');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Validation errors: %O', errors.array());
        return res.status(400).json({ error: 'Dados inválidos' });
    }
    try {
        const admin = await User.findById(req.query.userId);
        if (!admin || !admin.isAdmin) {
            debug('Access denied: Not admin or user not found: %s', req.query.userId);
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const { prices } = req.body;
        for (const price of prices) {
            await CardPrice.findOneAndUpdate(
                { nivel: price.nivel },
                { price: price.price },
                { upsert: true }
            );
        }
        debug('Card prices updated');
        res.json({ message: 'Preços atualizados' });
    } catch (err) {
        debug('Error setting card prices: %s', err.message);
        res.status(500).json({ error: 'Erro ao atualizar preços' });
    }
});

app.post('/api/buy-card', [
    query('userId').isMongoId(),
    body('nivel').isIn(['Classic', 'Gold', 'Platinum', 'Black'])
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB not connected');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Validation errors: %O', errors.array());
        return res.status(400).json({ error: 'Dados inválidos' });
    }
    try {
        const user = await User.findById(req.query.userId);
        if (!user) {
            debug('User not found: %s', req.query.userId);
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        const card = await CardPrice.findOne({ nivel: req.body.nivel });
        if (!card) {
            debug('Card not found: %s', req.body.nivel);
            return res.status(404).json({ error: 'Cartão não encontrado' });
        }
        if (user.balance < card.price) {
            debug('Insufficient balance for %s: %d < %d', user.username, user.balance, card.price);
            return res.status(400).json({ error: 'Saldo insuficiente' });
        }
        user.balance -= card.price;
        await user.save();
        const purchase = new Purchase({
            userId: user._id,
            nivel: card.nivel,
            price: card.price
        });
        await purchase.save();
        debug('Card purchased: %s by %s', card.nivel, user.username);
        res.json({ message: 'Cartão comprado', newBalance: user.balance });
    } catch (err) {
        debug('Error buying card: %s', err.message);
        res.status(500).json({ error: 'Erro ao comprar cartão' });
    }
});

module.exports.handler = serverless(app);
