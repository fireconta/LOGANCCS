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
const RETRY_INTERVAL_MS = 2000;

async function connectToMongoDB() {
    if (!process.env.MONGODB_URI) {
        debug('Erro: MONGODB_URI não configurada');
        return false;
    }
    if (mongoose.connection.readyState === 1) {
        debug('MongoDB já conectado ao banco loganccs (readyState: %d)', mongoose.connection.readyState);
        return true;
    }
    try {
        debug('Tentando conexão com MongoDB (%d/%d)', connectionAttempts + 1, MAX_RETRIES);
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: 'loganccs',
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 5,
            retryWrites: true,
            w: 'majority'
        });
        debug('Conexão com MongoDB loganccs estabelecida com sucesso');
        connectionAttempts = 0;
        return true;
    } catch (err) {
        connectionAttempts++;
        debug('Falha na conexão com MongoDB: %s', err.message);
        if (err.name === 'MongoServerSelectionError') {
            debug('Possíveis causas: MONGODB_URI inválida, restrições de rede, ou IP não autorizado no MongoDB Atlas');
        } else if (err.name === 'MongoNetworkError') {
            debug('Problema de rede detectado. Verifique a conectividade ou status do MongoDB Atlas');
        }
        if (connectionAttempts < MAX_RETRIES) {
            const delay = RETRY_INTERVAL_MS * Math.pow(2, connectionAttempts);
            debug('Tentando reconexão em %dms (%d/%d)', delay, connectionAttempts, MAX_RETRIES);
            await new Promise(resolve => setTimeout(resolve, delay));
            return connectToMongoDB();
        } else {
            debug('Número máximo de tentativas de conexão atingido');
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

const BankSchema = new mongoose.Schema({
    name: { type: String, required: true }
});

const User = mongoose.model('User', UserSchema);
const CardPrice = mongoose.model('CardPrice', CardPriceSchema);
const Purchase = mongoose.model('Purchase', PurchaseSchema);
const Bank = mongoose.model('Bank', BankSchema);

async function checkCollections() {
    try {
        debug('Verificando coleções no banco loganccs');
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        const result = {
            User: { exists: collectionNames.includes('users'), accessible: false },
            CardPrice: { exists: collectionNames.includes('cardprices'), accessible: false },
            Purchase: { exists: collectionNames.includes('purchases'), accessible: false },
            Bank: { exists: collectionNames.includes('banks'), accessible: false }
        };

        const accessibilityChecks = [
            result.User.exists ? User.countDocuments().then(() => true).catch(() => false) : false,
            result.CardPrice.exists ? CardPrice.countDocuments().then(() => true).catch(() => false) : false,
            result.Purchase.exists ? Purchase.countDocuments().then(() => true).catch(() => false) : false,
            result.Bank.exists ? Bank.countDocuments().then(() => true).catch(() => false) : false
        ];
        const [userAccessible, cardPriceAccessible, purchaseAccessible, bankAccessible] = await Promise.all(accessibilityChecks);

        result.User.accessible = userAccessible;
        result.CardPrice.accessible = cardPriceAccessible;
        result.Purchase.accessible = purchaseAccessible;
        result.Bank.accessible = bankAccessible;

        debug('Coleção users: %s, acessível: %s', result.User.exists ? 'existe' : 'não existe', result.User.accessible ? 'sim' : 'não');
        debug('Coleção cardprices: %s, acessível: %s', result.CardPrice.exists ? 'existe' : 'não existe', result.CardPrice.accessible ? 'sim' : 'não');
        debug('Coleção purchases: %s, acessível: %s', result.Purchase.exists ? 'existe' : 'não existe', result.Purchase.accessible ? 'sim' : 'não');
        debug('Coleção banks: %s, acessível: %s', result.Bank.exists ? 'existe' : 'não existe', result.Bank.accessible ? 'sim' : 'não');
        return result;
    } catch (err) {
        debug('Erro ao verificar coleções: %s', err.message);
        return {
            User: { exists: false, accessible: false },
            CardPrice: { exists: false, accessible: false },
            Purchase: { exists: false, accessible: false },
            Bank: { exists: false, accessible: false }
        };
    }
}

app.get('/api/check-env', async (req, res) => {
    debug('Iniciando verificação de ambiente e conexão com MongoDB');
    try {
        const mongodbConnected = await connectToMongoDB();
        const collections = await checkCollections();
        const environment = {
            MONGODB_URI: { exists: !!process.env.MONGODB_URI },
            ADMIN_PASSWORD: { exists: !!process.env.ADMIN_PASSWORD },
            NODE_VERSION: { exists: !!process.env.NODE_VERSION }
        };
        debug('Verificação concluída: MongoDB %s, coleções: %O', mongodbConnected ? 'conectado' : 'não conectado', collections);
        res.json({ mongodbConnected, collections, environment });
    } catch (err) {
        debug('Erro ao verificar ambiente: %s', err.message);
        res.status(500).json({ error: `Erro ao verificar ambiente: ${err.message}` });
    }
});

app.post('/api/register', [
    body('username').isString().trim().isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9]+$/),
    body('password').isString().isLength({ min: 6 })
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB não conectado');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Erros de validação: %O', errors.array());
        return res.status(400).json({ error: 'Dados inválidos' });
    }
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            debug('Usuário já existe: %s', username);
            return res.status(400).json({ error: 'Usuário já existe' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const isAdmin = username === 'LVz' && password === process.env.ADMIN_PASSWORD;
        const user = new User({ username, password: hashedPassword, isAdmin });
        await user.save();
        debug('Usuário registrado: %s, isAdmin: %s', username, isAdmin);
        res.status(201).json({ message: 'Usuário registrado' });
    } catch (err) {
        debug('Erro ao registrar usuário: %s', err.message);
        res.status(500).json({ error: `Erro ao registrar usuário: ${err.message}` });
    }
});

app.post('/api/login', [
    body('username').isString().trim().notEmpty(),
    body('password').isString().notEmpty()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB não conectado');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Erros de validação: %O', errors.array());
        return res.status(400).json({ error: 'Dados inválidos' });
    }
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            debug('Login falhou: Usuário não encontrado: %s', username);
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            debug('Login falhou: Senha inválida para %s', username);
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        debug('Login bem-sucedido: %s, isAdmin: %s', username, user.isAdmin);
        res.json({ userId: user._id, username: user.username, is_admin: user.isAdmin });
    } catch (err) {
        debug('Erro ao fazer login: %s', err.message);
        res.status(500).json({ error: `Erro ao logar: ${err.message}` });
    }
});

app.get('/api/user', [
    query('userId').isMongoId()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB não conectado');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Erros de validação: %O', errors.array());
        return res.status(400).json({ error: 'ID de usuário inválido' });
    }
    try {
        const user = await User.findById(req.query.userId);
        if (!user) {
            debug('Usuário não encontrado: %s', req.query.userId);
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json({ username: user.username, balance: user.balance, isAdmin: user.isAdmin });
    } catch (err) {
        debug('Erro ao buscar usuário: %s', err.message);
        res.status(500).json({ error: `Erro ao buscar usuário: ${err.message}` });
    }
});

app.get('/api/users', [
    query('userId').isMongoId()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB não conectado');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Erros de validação: %O', errors.array());
        return res.status(400).json({ error: 'ID de usuário inválido' });
    }
    try {
        const admin = await User.findById(req.query.userId);
        if (!admin || !admin.isAdmin) {
            debug('Acesso negado: Não é admin ou usuário não encontrado: %s', req.query.userId);
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const users = await User.find({}, 'username isAdmin balance createdAt');
        res.json(users);
    } catch (err) {
        debug('Erro ao buscar usuários: %s', err.message);
        res.status(500).json({ error: `Erro ao buscar usuários: ${err.message}` });
    }
});

app.delete('/api/delete-user', [
    query('userId').isMongoId(),
    query('targetId').isMongoId()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB não conectado');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Erros de validação: %O', errors.array());
        return res.status(400).json({ error: 'ID de usuário inválido' });
    }
    try {
        const admin = await User.findById(req.query.userId);
        if (!admin || !admin.isAdmin) {
            debug('Acesso negado: Não é admin ou usuário não encontrado: %s', req.query.userId);
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const target = await User.findById(req.query.targetId);
        if (!target) {
            debug('Usuário alvo não encontrado: %s', req.query.targetId);
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        if (target.username === 'LVz') {
            debug('Tentativa de excluir usuário admin LVz');
            return res.status(403).json({ error: 'Não é possível excluir o administrador principal' });
        }
        await User.deleteOne({ _id: req.query.targetId });
        debug('Usuário excluído: %s', req.query.targetId);
        res.json({ message: 'Usuário excluído' });
    } catch (err) {
        debug('Erro ao excluir usuário: %s', err.message);
        res.status(500).json({ error: `Erro ao excluir usuário: ${err.message}` });
    }
});

app.get('/api/get-card-prices', [
    query('userId').isMongoId()
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB não conectado');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Erros de validação: %O', errors.array());
        return res.status(400).json({ error: 'ID de usuário inválido' });
    }
    try {
        const prices = await CardPrice.find();
        if (!prices.length) {
            debug('Nenhum preço de cartão encontrado, inicializando preços padrão');
            const defaultPrices = [
                { nivel: 'Classic', price: 100 },
                { nivel: 'Gold', price: 200 },
                { nivel: 'Platinum', price: 300 },
                { nivel: 'Black', price: 500 }
            ];
            await CardPrice.insertMany(defaultPrices);
            return res.json(defaultPrices);
        }
        res.json(prices);
    } catch (err) {
        debug('Erro ao buscar preços de cartões: %s', err.message);
        res.status(500).json({ error: `Erro ao buscar preços: ${err.message}` });
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
        debug('MongoDB não conectado');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Erros de validação: %O', errors.array());
        return res.status(400).json({ error: 'Dados inválidos' });
    }
    try {
        const admin = await User.findById(req.query.userId);
        if (!admin || !admin.isAdmin) {
            debug('Acesso negado: Não é admin ou usuário não encontrado: %s', req.query.userId);
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
        debug('Preços de cartões atualizados');
        res.json({ message: 'Preços atualizados' });
    } catch (err) {
        debug('Erro ao atualizar preços de cartões: %s', err.message);
        res.status(500).json({ error: `Erro ao atualizar preços: ${err.message}` });
    }
});

app.post('/api/buy-card', [
    query('userId').isMongoId(),
    body('nivel').isIn(['Classic', 'Gold', 'Platinum', 'Black'])
], async (req, res) => {
    const connected = await connectToMongoDB();
    if (!connected) {
        debug('MongoDB não conectado');
        return res.status(500).json({ error: 'Banco de dados não conectado' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        debug('Erros de validação: %O', errors.array());
        return res.status(400).json({ error: 'Dados inválidos' });
    }
    try {
        const user = await User.findById(req.query.userId);
        if (!user) {
            debug('Usuário não encontrado: %s', req.query.userId);
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        const card = await CardPrice.findOne({ nivel: req.body.nivel });
        if (!card) {
            debug('Cartão não encontrado: %s', req.body.nivel);
            return res.status(404).json({ error: 'Cartão não encontrado' });
        }
        if (user.balance < card.price) {
            debug('Saldo insuficiente para %s: %d < %d', user.username, user.balance, card.price);
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
        debug('Cartão comprado: %s por %s', card.nivel, user.username);
        res.json({ message: 'Cartão comprado', newBalance: user.balance });
    } catch (err) {
        debug('Erro ao comprar cartão: %s', err.message);
        res.status(500).json({ error: `Erro ao comprar cartão: ${err.message}` });
    }
});

module.exports.handler = serverless(app);
