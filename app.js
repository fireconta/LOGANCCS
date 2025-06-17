const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
let db;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Função para conectar ao MongoDB com retry
async function connectToDatabase() {
    const maxRetries = 5;
    let retries = 0;
    while (retries < maxRetries) {
        try {
            const client = new MongoClient(mongoUri, {
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000,
                maxPoolSize: 10,
            });
            await client.connect();
            db = client.db('logan_ccs');
            console.log('Conectado ao MongoDB');
            await initializeDatabase();
            return;
        } catch (err) {
            retries++;
            console.error(`Tentativa ${retries}/${maxRetries} falhou: ${err.message}`);
            if (retries === maxRetries) {
                console.error('Não foi possível conectar ao MongoDB após várias tentativas.');
                process.exit(1);
            }
            await new Promise(resolve => setTimeout(resolve, 2000 * retries));
        }
    }
}

// Função para inicializar o banco de dados
async function initializeDatabase() {
    try {
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        // Criar coleção 'users' se não existir
        if (!collectionNames.includes('users')) {
            await db.createCollection('users');
            await db.collection('users').createIndex({ username: 1 }, { unique: true });
            console.log('Coleção users criada');
        }

        // Criar coleção 'cards' se não existir
        if (!collectionNames.includes('cards')) {
            await db.createCollection('cards');
            await db.collection('cards').createIndex({ numero: 1 }, { unique: true });
            console.log('Coleção cards criada');
        }

        // Criar coleção 'levels' se não existir
        if (!collectionNames.includes('levels')) {
            await db.createCollection('levels');
            const defaultLevels = [
                { level: 'Classic', price: 50.00 },
                { level: 'Gold', price: 100.00 },
                { level: 'Platinum', price: 200.00 },
                { level: 'Black', price: 500.00 }
            ];
            await db.collection('levels').insertMany(defaultLevels);
            console.log('Coleção levels criada com níveis padrão');
        }

        // Criar coleção 'transactions' se não existir
        if (!collectionNames.includes('transactions')) {
            await db.createCollection('transactions');
            await db.collection('transactions').createIndex({ user_id: 1, timestamp: -1 });
            console.log('Coleção transactions criada');
        }

        // Verificar e criar usuário LVz (admin)
        const lvzUser = await db.collection('users').findOne({ username: 'LVz' });
        if (!lvzUser) {
            const hashedPassword = await bcrypt.hash('123456', 10);
            await db.collection('users').insertOne({
                username: 'LVz',
                password: hashedPassword,
                balance: 0,
                is_admin: true,
                created_at: new Date()
            });
            console.log('Usuário LVz criado como admin');
        }

        // Verificar e criar usuário Carlos (não admin)
        const carlosUser = await db.collection('users').findOne({ username: 'Carlos' });
        if (!carlosUser) {
            const hashedPassword = await bcrypt.hash('123456', 10);
            await db.collection('users').insertOne({
                username: 'Carlos',
                password: hashedPassword,
                balance: 0,
                is_admin: false,
                created_at: new Date()
            });
            console.log('Usuário Carlos criado');
        }
    } catch (err) {
        console.error('Erro ao inicializar o banco de dados:', err);
        throw err;
    }
}

// Middleware para verificar autenticação
const authenticateUser = async (req, res, next) => {
    const userId = req.body.userId || req.query.userId;
    if (!userId || !ObjectId.isValid(userId)) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    try {
        const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }
        req.user = user;
        next();
    } catch (err) {
        console.error('Erro na autenticação:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

// Middleware para verificar admin
const requireAdmin = (req, res, next) => {
    if (!req.user.is_admin) {
        return res.status(403).json({ error: 'Acesso negado: apenas administradores' });
    }
    next();
};

// Rota de Registro
app.post('/api/register', [
    body('username').trim().matches(/^[a-zA-Z0-9_]{3,}$/).withMessage('Usuário inválido (mínimo 3 caracteres, apenas letras, números ou _)'),
    body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
        const { username, password } = req.body;
        const existingUser = await db.collection('users').findOne({ username });
        if (existingUser) {
            return res.status(409).json({ error: 'Usuário já existe' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.collection('users').insertOne({
            username,
            password: hashedPassword,
            balance: 0,
            is_admin: false,
            created_at: new Date()
        });
        res.json({ userId: result.insertedId.toString() });
    } catch (err) {
        console.error('Erro no registro:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota de Login
app.post('/api/login', [
    body('username').trim().notEmpty().withMessage('Usuário é obrigatório'),
    body('password').notEmpty().withMessage('Senha é obrigatória')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
        const { username, password } = req.body;
        const user = await db.collection('users').findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }
        res.json({ userId: user._id.toString(), is_admin: user.is_admin });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para obter dados do usuário
app.post('/api/user', [
    body('userId').isMongoId().withMessage('ID de usuário inválido')
], authenticateUser, async (req, res) => {
    try {
        res.json({
            username: req.user.username,
            balance: req.user.balance,
            is_admin: req.user.is_admin
        });
    } catch (err) {
        console.error('Erro ao obter usuário:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para verificar admin
app.post('/api/verify-admin', [
    body('userId').isMongoId().withMessage('ID de usuário inválido'),
    body('adminPassword').notEmpty().withMessage('Senha admin é obrigatória')
], authenticateUser, requireAdmin, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
        const { adminPassword } = req.body;
        const isMatch = await bcrypt.compare(adminPassword, req.user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Senha admin inválida' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro na verificação de admin:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para listar níveis
app.get('/api/levels', async (req, res) => {
    try {
        const levels = await db.collection('levels').find().toArray();
        res.json(levels);
    } catch (err) {
        console.error('Erro ao listar níveis:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para atualizar nível
app.put('/api/levels', [
    body('level').notEmpty().withMessage('Nível é obrigatório'),
    body('price').isFloat({ min: 0 }).withMessage('Preço inválido')
], authenticateUser, requireAdmin, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
        const { level, price } = req.body;
        const result = await db.collection('levels').updateOne(
            { level },
            { $set: { price, updated_at: new Date() } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Nível não encontrado' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao atualizar nível:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para listar usuários
app.get('/api/admin/users', authenticateUser, requireAdmin, async (req, res) => {
    try {
        const users = await db.collection('users').find().project({ password: 0 }).toArray();
        res.json(users);
    } catch (err) {
        console.error('Erro ao listar usuários:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para adicionar usuário
app.post('/api/admin/users', [
    body('username').trim().matches(/^[a-zA-Z0-9_]{3,}$/).withMessage('Usuário inválido'),
    body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
    body('balance').isFloat({ min: 0 }).withMessage('Saldo inválido'),
    body('is_admin').isBoolean().withMessage('Campo admin inválido')
], authenticateUser, requireAdmin, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
        const { username, password, balance, is_admin } = req.body;
        const existingUser = await db.collection('users').findOne({ username });
        if (existingUser) {
            return res.status(409).json({ error: 'Usuário já existe' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.collection('users').insertOne({
            username,
            password: hashedPassword,
            balance,
            is_admin,
            created_at: new Date()
        });
        res.json({ userId: result.insertedId.toString() });
    } catch (err) {
        console.error('Erro ao adicionar usuário:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para atualizar usuário
app.put('/api/admin/users', [
    body('userId').isMongoId().withMessage('ID de usuário inválido'),
    body('balance').isFloat({ min: 0 }).withMessage('Saldo inválido'),
    body('is_admin').isBoolean().withMessage('Campo admin inválido'),
    body('password').optional().isLength({ min: 6 }).withMessage('Nova senha deve ter pelo menos 6 caracteres')
], authenticateUser, requireAdmin, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
        const { userId, password, balance, is_admin } = req.body;
        const updateData = { balance, is_admin, updated_at: new Date() };
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }
        const result = await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            { $set: updateData }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao atualizar usuário:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para excluir usuário
app.delete('/api/admin/users', [
    body('userId').isMongoId().withMessage('ID de usuário inválido')
], authenticateUser, requireAdmin, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
        const { userId } = req.body;
        const result = await db.collection('users').deleteOne({ _id: new ObjectId(userId) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir usuário:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para listar cartões disponíveis na loja
app.post('/api/cards', [
    body('userId').isMongoId().withMessage('ID de usuário inválido')
], authenticateUser, async (req, res) => {
    try {
        const cards = await db.collection('cards').find({ acquired: false }).toArray();
        res.json(cards);
    } catch (err) {
        console.error('Erro ao listar cartões:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para listar cartões (admin)
app.get('/api/admin/cards', authenticateUser, requireAdmin, async (req, res) => {
    try {
        const cards = await db.collection('cards').find().toArray();
        res.json(cards);
    } catch (err) {
        console.error('Erro ao listar cartões:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para adicionar cartão
app.post('/api/admin/cards', [
    body('numero').matches(/^\d{16}$/).withMessage('Número do cartão inválido'),
    body('cvv').matches(/^\d{3}$/).withMessage('CVV inválido'),
    body('expiry').matches(/^\d{2}\/\d{2}$/).withMessage('Validade inválida'),
    body('name').trim().notEmpty().withMessage('Nome é obrigatório'),
    body('cpf').matches(/^\d{11}$/).withMessage('CPF inválido'),
    body('bandeira').isIn(['Visa', 'Mastercard', 'Amex', 'Elo', 'Hipercard', 'Diners Club']).withMessage('Bandeira inválida'),
    body('banco').isIn(['Nubank', 'Itaú', 'Bradesco', 'Santander', 'Banco do Brasil', 'Caixa Econômica Federal', 'Sicredi', 'Sicoob']).withMessage('Banco inválido'),
    body('nivel').isIn(['Classic', 'Gold', 'Platinum', 'Black']).withMessage('Nível inválido')
], authenticateUser, requireAdmin, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
        const { numero, cvv, expiry, name, cpf, bandeira, banco, nivel } = req.body;
        const existingCard = await db.collection('cards').findOne({ numero });
        if (existingCard) {
            return res.status(409).json({ error: 'Cartão já existe' });
        }
        const result = await db.collection('cards').insertOne({
            numero,
            cvv,
            expiry,
            name,
            cpf,
            bandeira,
            banco,
            nivel,
            acquired: false,
            user_id: null,
            created_at: new Date()
        });
        res.json({ cardId: result.insertedId.toString() });
    } catch (err) {
        console.error('Erro ao adicionar cartão:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para atualizar cartão
app.put('/api/admin/cards', [
    body('cardId').isMongoId().withMessage('ID do cartão inválido'),
    body('numero').matches(/^\d{16}$/).withMessage('Número do cartão inválido'),
    body('cvv').matches(/^\d{3}$/).withMessage('CVV inválido'),
    body('expiry').matches(/^\d{2}\/\d{2}$/).withMessage('Validade inválida'),
    body('name').trim().notEmpty().withMessage('Nome é obrigatório'),
    body('cpf').matches(/^\d{11}$/).withMessage('CPF inválido'),
    body('bandeira').isIn(['Visa', 'Mastercard', 'Amex', 'Elo', 'Hipercard', 'Diners Club']).withMessage('Bandeira inválida'),
    body('banco').isIn(['Nubank', 'Itaú', 'Bradesco', 'Santander', 'Banco do Brasil', 'Caixa Econômica Federal', 'Sicredi', 'Sicoob']).withMessage('Banco inválido'),
    body('nivel').isIn(['Classic', 'Gold', 'Platinum', 'Black']).withMessage('Nível inválido')
], authenticateUser, requireAdmin, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
        const { cardId, numero, cvv, expiry, name, cpf, bandeira, banco, nivel } = req.body;
        const existingCard = await db.collection('cards').findOne({ numero, _id: { $ne: new ObjectId(cardId) } });
        if (existingCard) {
            return res.status(409).json({ error: 'Cartão já existe' });
        }
        const result = await db.collection('cards').updateOne(
            { _id: new ObjectId(cardId) },
            { $set: { numero, cvv, expiry, name, cpf, bandeira, banco, nivel, updated_at: new Date() } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Cartão não encontrado' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao atualizar cartão:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para excluir cartão
app.delete('/api/admin/cards', [
    body('cardId').isMongoId().withMessage('ID do cartão inválido')
], authenticateUser, requireAdmin, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
        const { cardId } = req.body;
        const result = await db.collection('cards').deleteOne({ _id: new ObjectId(cardId) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Cartão não encontrado' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir cartão:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para comprar cartão
app.post('/api/purchase', [
    body('userId').isMongoId().withMessage('ID de usuário inválido'),
    body('cardId').isMongoId().withMessage('ID do cartão inválido')
], authenticateUser, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
        const { cardId } = req.body;
        const userId = req.user._id;

        // Verificar se o cartão existe e está disponível
        const card = await db.collection('cards').findOne({ _id: new ObjectId(cardId), acquired: false });
        if (!card) {
            return res.status(404).json({ error: 'Cartão não encontrado ou já adquirido' });
        }

        // Obter o preço do nível do cartão
        const level = await db.collection('levels').findOne({ level: card.nivel });
        if (!level) {
            return res.status(400).json({ error: 'Nível do cartão inválido' });
        }
        const price = level.price;

        // Verificar saldo do usuário
        if (req.user.balance < price) {
            return res.status(400).json({ error: 'Saldo insuficiente' });
        }

        // Iniciar transação
        const session = db.client.startSession();
        try {
            await session.withTransaction(async () => {
                // Debitar saldo do usuário
                const userUpdateResult = await db.collection('users').updateOne(
                    { _id: userId },
                    { $inc: { balance: -price }, $set: { updated_at: new Date() } },
                    { session }
                );
                if (userUpdateResult.matchedCount === 0) {
                    throw new Error('Usuário não encontrado');
                }

                // Marcar cartão como adquirido
                const cardUpdateResult = await db.collection('cards').updateOne(
                    { _id: new ObjectId(cardId), acquired: false },
                    { $set: { acquired: true, user_id: userId.toString(), updated_at: new Date() } },
                    { session }
                );
                if (cardUpdateResult.matchedCount === 0) {
                    throw new Error('Cartão já adquirido ou não encontrado');
                }

                // Registrar transação
                await db.collection('transactions').insertOne({
                    user_id: userId.toString(),
                    card_id: cardId,
                    level: card.nivel,
                    price,
                    timestamp: new Date()
                }, { session });
            });
            const updatedUser = await db.collection('users').findOne({ _id: userId });
            res.json({ success: true, newBalance: updatedUser.balance });
        } finally {
            await session.endSession();
        }
    } catch (err) {
        console.error('Erro na compra:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Iniciar o servidor
async function startServer() {
    await connectToDatabase();
    app.listen(port, () => {
        console.log(`Servidor rodando na porta ${port}`);
    });
}

startServer();
