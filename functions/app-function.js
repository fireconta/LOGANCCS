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
const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 5000;

async function connectToMongoDB() {
    if (mongoose.connection.readyState === 1) {
        debug('MongoDB already connected (readyState: %d)', mongoose.connection.readyState);
        return true;
    }
    try {
        debug('Attempting MongoDB connection (%d/%d)', connectionAttempts + 1, MAX_RETRIES);
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: 'loganccs',
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 10
        });
        debug('Connected to MongoDB successfully');
        connectionAttempts = 0;
        return true;
    } catch (err) {
        connectionAttempts++;
        debug('MongoDB connection failed: %s', err.message);
        if (err.name === 'MongoServerSelectionError') {
            debug('Possible causes: Invalid MONGODB_URI, network restrictions, or IP not whitelisted in MongoDB Atlas');
        } else if (err.name === 'MongoNetworkError') {
            debug('Network issue detected. Check internet connectivity or MongoDB Atlas status');
        }
        if (connectionAttempts < MAX_RETRIES) {
            const delay = RETRY_INTERVAL_MS * Math.pow(2, connectionAttempts);
            debug('Retrying MongoDB connection in %dms (%d/%d)', delay, connectionAttempts, MAX_RETRIES);
            await new Promise(resolve => setTimeout(resolve, delay));
            return connectToMongoDB();
        } else {
            debug('Max MongoDB connection retries reached');
            return false;
        }
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

const CardSchema = new mongoose.Schema({
    nivel: { type: String, required: true },
    numero: { type: String, required: true, unique: true },
    dataValidade: { type: String, required: true },
    cvv: { type: String, required: true },
    bin: { type: String, required: true },
    bandeira: { type: String, required: true },
    banco: { type: String, required: true }
});

const BankSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    type: { type: String, required: true, enum: ['Estatal', 'Privado', 'Estrangeiro', 'Neobanco'] }
});

const User = mongoose.model('User', UserSchema);
const CardPrice = mongoose.model('CardPrice', CardPriceSchema);
const Purchase = mongoose.model('Purchase', PurchaseSchema);
const Card = mongoose.model('Card', CardSchema);
const Bank = mongoose.model('Bank', BankSchema);

async function checkCollections() {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        const result = {
            users: { exists: collectionNames.includes('users'), accessible: false },
            cardPrices: { exists: collectionNames.includes('cardprices'), accessible: false },
            purchases: { exists: collectionNames.includes('purchases'), accessible: false },
            cards: { exists: collectionNames.includes('cards'), accessible: false },
            banks: { exists: collectionNames.includes('banks'), accessible: false }
        };
        if (result.users.exists) result.users.accessible = await User.countDocuments().then(() => true).catch(() => false);
        if (result.cardPrices.exists) result.cardPrices.accessible = await CardPrice.countDocuments().then(() => true).catch(() => false);
        if (result.purchases.exists) result.purchases.accessible = await Purchase.countDocuments().then(() => true).catch(() => false);
        if (result.cards.exists) result.cards.accessible = await Card.countDocuments().then(() => true).catch(() => false);
        if (result.banks.exists) result.banks.accessible = await Bank.countDocuments().then(() => true).catch(() => false);
        debug('Collections check: %O', result);
        return result;
    } catch (err) {
        debug('Error checking collections: %s', err.message);
        return {
            users: { exists: false, accessible: false },
            cardPrices: { exists: false, accessible: false },
            purchases: { exists: false, accessible: false },
            cards: { exists: false, accessible: false },
            banks: { exists: false, accessible: false }
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
        debug('Environment check result: %O', { mongodbConnected, collections, environment });
        res.json({ mongodbConnected, collections, environment });
    } catch (err) {
        debug('Error checking environment: %s', err.message);
        res.status(500).json({ error: `Erro ao verificar ambiente: ${err.message}` });
    }
});

app.post('/api/register', [
    body('username').isString().trim().isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9]+$/),
    body('password').isString().isLength({ min: 6 }),
    body('balance').optional().isFloat({ min: 0 }),
    body('isAdmin').optional().isBoolean()
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
    const { username, password, balance = 1000, isAdmin = false } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            debug('User already exists: %s', username);
            return res.status(400).json({ error: 'Usuário já existe' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword, isAdmin: username === 'LVz' ? true : isAdmin, balance });
        await user.save();
        debug('User registered: %s, isAdmin: %s, balance: %d', username, user.isAdmin, balance);
        res.status(201).json({ message: 'Usuário registrado', userId: user._id });
    } catch (err) {
        debug('Error registering user: %s', err.message);
        res.status(500).json({ error: `Erro ao registrar usuário: ${err.message}` });
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
        res.status(500).json({ error: `Erro ao logar: ${err.message}` });
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
        res.status(500).json({ error: `Erro ao buscar usuário: ${err.message}` });
    }
});

app.get('/api/get-users', [
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
        res.status(500).json({ error: `Erro ao buscar usuários: ${err.message}` });
    }
});

app.post('/api/add-user', [
    query('userId').isMongoId(),
    body('username').isString().trim().isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9]+$/),
    body('password').isString().isLength({ min: 6 }),
    body('balance').isFloat({ min: 0 }),
    body('isAdmin').isBoolean()
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
        const { username, password, balance, isAdmin } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            debug('User already exists: %s', username);
            return res.status(400).json({ error: 'Usuário já existe' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword, isAdmin, balance });
        await user.save();
        debug('User added by admin: %s, isAdmin: %s, balance: %d', username, isAdmin, balance);
        res.status(201).json({ message: 'Usuário adicionado', userId: user._id });
    } catch (err) {
        debug('Error adding user: %s', err.message);
        res.status(500).json({ error: `Erro ao adicionar usuário: ${err.message}` });
    }
});

app.put('/api/update-user', [
    query('userId').isMongoId(),
    query('targetId').isMongoId(),
    body('username').isString().trim().isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9]+$/),
    body('balance').isFloat({ min: 0 }),
    body('isAdmin').isBoolean()
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
        const target = await User.findById(req.query.targetId);
        if (!target) {
            debug('Target user not found: %s', req.query.targetId);
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        if (target.username === 'LVz') {
            debug('Attempt to update admin user LVz');
            return res.status(403).json({ error: 'Não é possível editar o administrador principal' });
        }
        const { username, balance, isAdmin } = req.body;
        const existingUser = await User.findOne({ username, _id: { $ne: req.query.targetId } });
        if (existingUser) {
            debug('Username already exists: %s', username);
            return res.status(400).json({ error: 'Nome de usuário já existe' });
        }
        target.username = username;
        target.balance = balance;
        target.isAdmin = isAdmin;
        await target.save();
        debug('User updated: %s', req.query.targetId);
        res.json({ message: 'Usuário atualizado' });
    } catch (err) {
        debug('Error updating user: %s', err.message);
        res.status(500).json({ error: `Erro ao atualizar usuário: ${err.message}` });
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
        res.status(500).json({ error: `Erro ao excluir usuário: ${err.message}` });
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
        res.status(500).json({ error: `Erro ao buscar preços: ${err.message}` });
    }
});

app.post('/api/add-price', [
    query('userId').isMongoId(),
    body('nivel').isString().trim().notEmpty(),
    body('price').isFloat({ min: 0.01 })
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
        const { nivel, price } = req.body;
        const existingPrice = await CardPrice.findOne({ nivel });
        if (existingPrice) {
            debug('Price level already exists: %s', nivel);
            return res.status(400).json({ error: 'Nível de preço já existe' });
        }
        const cardPrice = new CardPrice({ nivel, price });
        await cardPrice.save();
        debug('Price added: %s, price: %d', nivel, price);
        res.status(201).json({ message: 'Preço adicionado' });
    } catch (err) {
        debug('Error adding price: %s', err.message);
        res.status(500).json({ error: `Erro ao adicionar preço: ${err.message}` });
    }
});

app.put('/api/update-price', [
    query('userId').isMongoId(),
    query('priceId').isMongoId(),
    body('nivel').isString().trim().notEmpty(),
    body('price').isFloat({ min: 0.01 })
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
        const { nivel, price } = req.body;
        const existingPrice = await CardPrice.findOne({ nivel, _id: { $ne: req.query.priceId } });
        if (existingPrice) {
            debug('Price level already exists: %s', nivel);
            return res.status(400).json({ error: 'Nível de preço já existe' });
        }
        const cardPrice = await CardPrice.findById(req.query.priceId);
        if (!cardPrice) {
            debug('Price not found: %s', req.query.priceId);
            return res.status(404).json({ error: 'Preço não encontrado' });
        }
        cardPrice.nivel = nivel;
        cardPrice.price = price;
        await cardPrice.save();
        debug('Price updated: %s', req.query.priceId);
        res.json({ message: 'Preço atualizado' });
    } catch (err) {
        debug('Error updating price: %s', err.message);
        res.status(500).json({ error: `Erro ao atualizar preço: ${err.message}` });
    }
});

app.delete('/api/delete-price', [
    query('userId').isMongoId(),
    query('priceId').isMongoId()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB not connected');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Validation errors: %O', errors.array());
        return res.status(400).json({ error: 'ID de preço inválido' });
    }
    try {
        const admin = await User.findById(req.query.userId);
        if (!admin || !admin.isAdmin) {
            debug('Access denied: Not admin or user not found: %s', req.query.userId);
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const cardPrice = await CardPrice.findById(req.query.priceId);
        if (!cardPrice) {
            debug('Price not found: %s', req.query.priceId);
            return res.status(404).json({ error: 'Preço não encontrado' });
        }
        await CardPrice.deleteOne({ _id: req.query.priceId });
        debug('Price deleted: %s', req.query.priceId);
        res.json({ message: 'Preço excluído' });
    } catch (err) {
        debug('Error deleting price: %s', err.message);
        res.status(500).json({ error: `Erro ao excluir preço: ${err.message}` });
    }
});

app.get('/api/get-cards', [
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
        const cards = await Card.find();
        res.json(cards);
    } catch (err) {
        debug('Error fetching cards: %s', err.message);
        res.status(500).json({ error: `Erro ao buscar cartões: ${err.message}` });
    }
});

app.post('/api/add-card', [
    query('userId').isMongoId(),
    body('nivel').isString().trim().notEmpty(),
    body('numero').isString().trim().matches(/^\d{16}$/),
    body('dataValidade').isString().trim().matches(/^(0[1-9]|1[0-2])\/\d{2}$/),
    body('cvv').isString().trim().matches(/^\d{3,4}$/),
    body('bin').isString().trim().matches(/^\d{6}$/),
    body('bandeira').isString().trim().notEmpty(),
    body('banco').isString().trim().notEmpty()
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
        const { nivel, numero, dataValidade, cvv, bin, bandeira, banco } = req.body;
        const existingCard = await Card.findOne({ numero });
        if (existingCard) {
            debug('Card already exists: %s', numero);
            return res.status(400).json({ error: 'Cartão já existe' });
        }
        const card = new Card({ nivel, numero, dataValidade, cvv, bin, bandeira, banco });
        await card.save();
        debug('Card added: %s', numero);
        res.status(201).json({ message: 'Cartão adicionado' });
    } catch (err) {
        debug('Error adding card: %s', err.message);
        res.status(500).json({ error: `Erro ao adicionar cartão: ${err.message}` });
    }
});

app.put('/api/update-card', [
    query('userId').isMongoId(),
    query('cardId').isMongoId(),
    body('nivel').isString().trim().notEmpty(),
    body('numero').isString().trim().matches(/^\d{16}$/),
    body('dataValidade').isString().trim().matches(/^(0[1-9]|1[0-2])\/\d{2}$/),
    body('cvv').isString().trim().matches(/^\d{3,4}$/),
    body('bin').isString().trim().matches(/^\d{6}$/),
    body('bandeira').isString().trim().notEmpty(),
    body('banco').isString().trim().notEmpty()
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
        const { nivel, numero, dataValidade, cvv, bin, bandeira, banco } = req.body;
        const existingCard = await Card.findOne({ numero, _id: { $ne: req.query.cardId } });
        if (existingCard) {
            debug('Card number already exists: %s', numero);
            return res.status(400).json({ error: 'Número de cartão já existe' });
        }
        const card = await Card.findById(req.query.cardId);
        if (!card) {
            debug('Card not found: %s', req.query.cardId);
            return res.status(404).json({ error: 'Cartão não encontrado' });
        }
        card.nivel = nivel;
        card.numero = numero;
        card.dataValidade = dataValidade;
        card.cvv = cvv;
        card.bin = bin;
        card.bandeira = bandeira;
        card.banco = banco;
        await card.save();
        debug('Card updated: %s', req.query.cardId);
        res.json({ message: 'Cartão atualizado' });
    } catch (err) {
        debug('Error updating card: %s', err.message);
        res.status(500).json({ error: `Erro ao atualizar cartão: ${err.message}` });
    }
});

app.delete('/api/delete-card', [
    query('userId').isMongoId(),
    query('cardId').isMongoId()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB not connected');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Validation errors: %O', errors.array());
        return res.status(400).json({ error: 'ID de cartão inválido' });
    }
    try {
        const admin = await User.findById(req.query.userId);
        if (!admin || !admin.isAdmin) {
            debug('Access denied: Not admin or user not found: %s', req.query.userId);
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const card = await Card.findById(req.query.cardId);
        if (!card) {
            debug('Card not found: %s', req.query.cardId);
            return res.status(404).json({ error: 'Cartão não encontrado' });
        }
        await Card.deleteOne({ _id: req.query.cardId });
        debug('Card deleted: %s', req.query.cardId);
        res.json({ message: 'Cartão excluído' });
    } catch (err) {
        debug('Error deleting card: %s', err.message);
        res.status(500).json({ error: `Erro ao excluir cartão: ${err.message}` });
    }
});

app.get('/api/get-banks', [
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
        const banks = await Bank.find();
        res.json(banks);
    } catch (err) {
        debug('Error fetching banks: %s', err.message);
        res.status(500).json({ error: `Erro ao buscar bancos: ${err.message}` });
    }
});

app.post('/api/add-bank', [
    query('userId').isMongoId(),
    body('name').isString().trim().notEmpty(),
    body('type').isIn(['Estatal', 'Privado', 'Estrangeiro', 'Neobanco'])
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
        const { name, type } = req.body;
        const existingBank = await Bank.findOne({ name });
        if (existingBank) {
            debug('Bank already exists: %s', name);
            return res.status(400).json({ error: 'Banco já existe' });
        }
        const bank = new Bank({ name, type });
        await bank.save();
        debug('Bank added: %s', name);
        res.status(201).json({ message: 'Banco adicionado' });
    } catch (err) {
        debug('Error adding bank: %s', err.message);
        res.status(500).json({ error: `Erro ao adicionar banco: ${err.message}` });
    }
});

app.put('/api/update-bank', [
    query('userId').isMongoId(),
    query('bankId').isMongoId(),
    body('name').isString().trim().notEmpty(),
    body('type').isIn(['Estatal', 'Privado', 'Estrangeiro', 'Neobanco'])
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
        const { name, type } = req.body;
        const existingBank = await Bank.findOne({ name, _id: { $ne: req.query.bankId } });
        if (existingBank) {
            debug('Bank name already exists: %s', name);
            return res.status(400).json({ error: 'Nome de banco já existe' });
        }
        const bank = await Bank.findById(req.query.bankId);
        if (!bank) {
            debug('Bank not found: %s', req.query.bankId);
            return res.status(404).json({ error: 'Banco não encontrado' });
        }
        bank.name = name;
        bank.type = type;
        await bank.save();
        debug('Bank updated: %s', req.query.bankId);
        res.json({ message: 'Banco atualizado' });
    } catch (err) {
        debug('Error updating bank: %s', err.message);
        res.status(500).json({ error: `Erro ao atualizar banco: ${err.message}` });
    }
});

app.delete('/api/delete-bank', [
    query('userId').isMongoId(),
    query('bankId').isMongoId()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB not connected');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Validation errors: %O', errors.array());
        return res.status(400).json({ error: 'ID de banco inválido' });
    }
    try {
        const admin = await User.findById(req.query.userId);
        if (!admin || !admin.isAdmin) {
            debug('Access denied: Not admin or user not found: %s', req.query.userId);
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const bank = await Bank.findById(req.query.bankId);
        if (!bank) {
            debug('Bank not found: %s', req.query.bankId);
            return res.status(404).json({ error: 'Banco não encontrado' });
        }
        await Bank.deleteOne({ _id: req.query.bankId });
        debug('Bank deleted: %s', req.query.bankId);
        res.json({ message: 'Banco excluído' });
    } catch (err) {
        debug('Error deleting bank: %s', err.message);
        res.status(500).json({ error: `Erro ao excluir banco: ${err.message}` });
    }
});

app.post('/api/buy-card', [
    query('userId').isMongoId(),
    body('nivel').isString().trim().notEmpty()
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
        const cardPrice = await CardPrice.findOne({ nivel: req.body.nivel });
        if (!cardPrice) {
            debug('Card price not found: %s', req.body.nivel);
            return res.status(404).json({ error: 'Nível de cartão não encontrado' });
        }
        if (user.balance < cardPrice.price) {
            debug('Insufficient balance for %s: %d < %d', user.username, user.balance, cardPrice.price);
            return res.status(400).json({ error: 'Saldo insuficiente' });
        }
        const card = await Card.findOneAndDelete({ nivel: req.body.nivel });
        if (!card) {
            debug('No available card for level: %s', req.body.nivel);
            return res.status(400).json({ error: 'Nenhum cartão disponível para este nível' });
        }
        user.balance -= cardPrice.price;
        await user.save();
        const purchase = new Purchase({
            userId: user._id,
            nivel: card.nivel,
            price: cardPrice.price
        });
        await purchase.save();
        debug('Card purchased: %s by %s, new balance: %d', card.nivel, user.username, user.balance);
        res.json({ message: 'Cartão comprado', newBalance: user.balance, cardDetails: card });
    } catch (err) {
        debug('Error buying card: %s', err.message);
        res.status(500).json({ error: `Erro ao comprar cartão: ${err.message}` });
    }
});

module.exports.handler = serverless(app);
