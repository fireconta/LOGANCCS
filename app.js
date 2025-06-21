const express = require('express');
const mongoose = require('mongoose');
const serverless = require('serverless-http');
const debug = require('debug')('app');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const cors = require('cors');

const app = express();
app.use(cors({ origin: 'https://loganccs.netlify.app' }));
app.use(express.json());

let mongoConnected = false;
let cachedConnection = null;

const connectMongoDB = async () => {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    debug('Reutilizando conexão existente com MongoDB');
    return;
  }
  try {
    debug('Tentando conectar ao MongoDB com URI: %s', process.env.MONGODB_URI ? 'CONFIGURADO' : 'NÃO CONFIGURADO');
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI não está configurado');
    }
    cachedConnection = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 90000
    });
    mongoConnected = true;
    debug('Conectado ao MongoDB Atlas');
  } catch (err) {
    mongoConnected = false;
    debug('Erro ao conectar ao MongoDB: %s - Stack: %s', err.message, err.stack);
    throw new Error(`Falha na conexão com o banco de dados: ${err.message}`);
  }
};

app.use(async (req, res, next) => {
  try {
    await connectMongoDB();
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  is_admin: { type: Boolean, default: false },
  balance: { type: Number, default: 0 }
}, { timestamps: true });
UserSchema.index({ username: 1 });
const User = mongoose.model('User', UserSchema);

const CardSchema = new mongoose.Schema({
  numero: { type: String, required: true, unique: true },
  bandeira: { type: String, required: true },
  banco: { type: String, required: true },
  nivel: { type: String, required: true },
  price: { type: Number, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });
CardSchema.index({ bandeira: 1, banco: 1, nivel: 1 });
const Card = mongoose.model('Card', CardSchema);

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'completed' }
}, { timestamps: true });
const Transaction = mongoose.model('Transaction', TransactionSchema);

app.get('/api/health', (req, res) => {
  debug('Verificando saúde do MongoDB');
  res.status(200).json({
    mongoConnected,
    mongooseConnectionState: mongoose.connection.readyState,
    error: mongoConnected ? null : mongoose.connection.error?.message || 'Falha na conexão'
  });
});

app.post('/api/register', [
  body('username').trim().notEmpty().isLength({ min: 3, max: 20 }),
  body('password').notEmpty().isLength({ min: 6 })
], async (req, res) => {
  debug('Tentando registrar usuário: %s', req.body.username);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      debug('Usuário já existe: %s', username);
      return res.status(400).json({ error: 'Usuário já existe' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, is_admin: username === 'admin' });
    await user.save();
    debug('Usuário registrado com sucesso: %s', username);
    res.status(201).json({ username });
  } catch (err) {
    debug('Erro ao registrar usuário: %s', err.message);
    res.status(500).json({ error: err.message.includes('MongoServerError') ? 'Falha na conexão com o banco' : err.message });
  }
});

app.post('/api/login', [
  body('username').trim().notEmpty(),
  body('password').notEmpty()
], async (req, res) => {
  debug('Tentando login para usuário: %s', req.body.username);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      debug('Usuário não encontrado: %s', username);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      debug('Senha incorreta para usuário: %s', username);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    debug('Login bem-sucedido para usuário: %s', username);
    res.status(200).json({ userId: user._id, username: user.username, is_admin: user.is_admin });
  } catch (err) {
    debug('Erro ao fazer login: %s', err.message);
    res.status(500).json({ error: err.message.includes('MongoServerError') ? 'Falha na conexão com o banco' : err.message });
  }
});

app.get('/api/user', async (req, res) => {
  debug('Buscando dados do usuário: %s', req.query.userId);
  try {
    const user = await User.findById(req.query.userId).select('-password');
    if (!user) {
      debug('Usuário não encontrado: %s', req.query.userId);
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.status(200).json(user);
  } catch (err) {
    debug('Erro ao buscar usuário: %s', err.message);
    res.status(500).json({ error: err.message.includes('MongoServerError') ? 'Falha na conexão com o banco' : err.message });
  }
});

app.get('/api/users', async (req, res) => {
  debug('Buscando lista de usuários');
  try {
    const user = await User.findById(req.query.userId);
    if (!user || !user.is_admin) {
      debug('Acesso negado para usuário: %s', req.query.userId);
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const users = await User.find().select('-password');
    res.status(200).json(users);
  } catch (err) {
    debug('Erro ao buscar usuários: %s', err.message);
    res.status(500).json({ error: err.message.includes('MongoServerError') ? 'Falha na conexão com o banco' : err.message });
  }
});

app.get('/api/cards', async (req, res) => {
  debug('Buscando lista de cartões');
  try {
    const cards = await Card.find({ userId: null });
    res.status(200).json(cards);
  } catch (err) {
    debug('Erro ao buscar cartões: %s', err.message);
    res.status(500).json({ error: err.message.includes('MongoServerError') ? 'Falha na conexão com o banco' : err.message });
  }
});

app.post('/api/buy-card', async (req, res) => {
  debug('Iniciando compra de cartão: %s', req.body.cardId);
  const { userId, cardId, price } = req.body;
  const transactionSession = await mongoose.startSession();
  try {
    transactionSession.startTransaction();
    const user = await User.findById(userId).session(transactionSession);
    if (!user) {
      debug('Usuário não encontrado: %s', userId);
      throw new Error('Usuário não encontrado');
    }
    if (user.balance < price) {
      debug('Saldo insuficiente para usuário: %s', userId);
      throw new Error('Saldo insuficiente');
    }
    const card = await Card.findById(cardId).session(transactionSession);
    if (!card || card.userId) {
      debug('Cartão inválido ou já comprado: %s', cardId);
      throw new Error('Cartão inválido ou já comprado');
    }
    user.balance -= price;
    card.userId = userId;
    const transaction = new Transaction({ userId, cardId, amount: price });
    await Promise.all([
      user.save({ session: transactionSession }),
      card.save({ session: transactionSession }),
      transaction.save({ session: transactionSession })
    ]);
    await transactionSession.commitTransaction();
    debug('Compra de cartão concluída: %s', cardId);
    res.status(200).json({ message: 'Compra realizada com sucesso' });
  } catch (err) {
    await transactionSession.abortTransaction();
    debug('Erro ao comprar cartão: %s', err.message);
    res.status(400).json({ error: err.message });
  } finally {
    transactionSession.endSession();
  }
});

app.post('/api/seed', async (req, res) => {
  debug('Iniciando seeding do banco de dados');
  try {
    const userId = req.query.userId;
    const user = await User.findById(userId);
    if (!user || !user.is_admin) {
      debug('Acesso negado para seeding: %s', userId);
      return res.status(403).json({ error: 'Acesso negado, apenas administradores podem executar o seeding' });
    }

    // Limpar coleções existentes
    await Promise.all([
      User.deleteMany({}),
      Card.deleteMany({}),
      Transaction.deleteMany({})
    ]);
    debug('Coleções existentes limpas');

    // Inserir usuários fictícios
    const adminPassword = await bcrypt.hash('admin123', 10);
    const userPassword = await bcrypt.hash('user123', 10);
    const users = [
      { username: 'admin', password: adminPassword, is_admin: true, balance: 1000, createdAt: new Date('2025-06-21T00:00:00Z'), updatedAt: new Date('2025-06-21T00:00:00Z') },
      { username: 'user1', password: userPassword, is_admin: false, balance: 500, createdAt: new Date('2025-06-21T00:00:00Z'), updatedAt: new Date('2025-06-21T00:00:00Z') },
      { username: 'user2', password: userPassword, is_admin: false, balance: 300, createdAt: new Date('2025-06-21T00:00:00Z'), updatedAt: new Date('2025-06-21T00:00:00Z') }
    ];
    const insertedUsers = await User.insertMany(users);
    debug('Usuários fictícios inseridos', { count: insertedUsers.length });

    // Inserir cartões com BINs reais
    const cards = [
      { numero: '4532015112831234', bandeira: 'Visa', banco: 'Nubank', nivel: 'Classic', price: 50, userId: null, createdAt: new Date('2025-06-21T00:00:00Z'), updatedAt: new Date('2025-06-21T00:00:00Z') },
      { numero: '5100109876543210', bandeira: 'Mastercard', banco: 'Itaú', nivel: 'Gold', price: 100, userId: null, createdAt: new Date('2025-06-21T00:00:00Z'), updatedAt: new Date('2025-06-21T00:00:00Z') },
      { numero: '374220123456789', bandeira: 'Amex', banco: 'Bradesco', nivel: 'Platinum', price: 200, userId: null, createdAt: new Date('2025-06-21T00:00:00Z'), updatedAt: new Date('2025-06-21T00:00:00Z') },
      { numero: '5067891234567890', bandeira: 'Elo', banco: 'Caixa Econômica Federal', nivel: 'Black', price: 300, userId: null, createdAt: new Date('2025-06-21T00:00:00Z'), updatedAt: new Date('2025-06-21T00:00:00Z') }
    ];
    const insertedCards = await Card.insertMany(cards);
    debug('Cartões fictícios inseridos', { count: insertedCards.length });

    res.status(200).json({ message: 'Banco de dados populado com sucesso', users: insertedUsers.length, cards: insertedCards.length });
  } catch (err) {
    debug('Erro ao realizar seeding: %s', err.message);
    res.status(500).json({ error: err.message.includes('MongoServerError') ? 'Falha na conexão com o banco' : err.message });
  }
});

app.post('/api/logout', (req, res) => {
  debug('Logout solicitado para usuário: %s', req.body.userId);
  res.status(200).json({ message: 'Logout realizado com sucesso' });
});

module.exports.handler = serverless(app);
