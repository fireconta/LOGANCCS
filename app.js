const express = require('express');
const mongoose = require('mongoose');
const serverless = require('serverless-http');
const debug = require('debug')('app');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const cors = require('cors');

const app = express();
app.use(cors({ 
  origin: 'https://loganccs.netlify.app', 
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '50kb' }));

let mongoConnected = false;
let cachedConnection = null;

const connectMongoDB = async () => {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    debug('Reutilizando conexão MongoDB');
    return;
  }
  try {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI não configurado');
    cachedConnection = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 180000
    });
    mongoConnected = true;
    debug('Conectado ao MongoDB Atlas');
  } catch (err) {
    mongoConnected = false;
    debug('Erro ao conectar ao MongoDB: %s', err.message);
    throw new Error('Falha na conexão com o banco');
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

const CardPriceSchema = new mongoose.Schema({
  nivel: { type: String, required: true, unique: true },
  price: { type: Number, required: true }
}, { timestamps: true });
const CardPrice = mongoose.model('CardPrice', CardPriceSchema);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    mongoConnected,
    mongooseConnectionState: mongoose.connection.readyState,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/register', [
  body('username').trim().notEmpty().isLength({ min: 3, max: 20 }).withMessage('Usuário: 3-20 caracteres'),
  body('password').notEmpty().isLength({ min: 6 }).withMessage('Senha: mínimo 6 caracteres')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: 'Usuário já existe' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, is_admin: username === 'LVz' });
    await user.save();
    debug('Usuário registrado: %s', username);
    res.status(201).json({ username });
  } catch (err) {
    debug('Erro ao registrar: %s', err.message);
    res.status(500).json({ error: 'Falha no servidor' });
  }
});

app.post('/api/login', [
  body('username').trim().notEmpty().withMessage('Usuário obrigatório'),
  body('password').notEmpty().withMessage('Senha obrigatória')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Senha incorreta' });
    debug('Login bem-sucedido: %s', username);
    res.status(200).json({ userId: user._id, username: user.username, is_admin: user.is_admin });
  } catch (err) {
    debug('Erro ao logar: %s', err.message);
    res.status(500).json({ error: 'Falha no servidor' });
  }
});

app.get('/api/user', async (req, res) => {
  try {
    const user = await User.findById(req.query.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.status(200).json(user);
  } catch (err) {
    debug('Erro ao buscar usuário: %s', err.message);
    res.status(500).json({ error: 'Falha no servidor' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const user = await User.findById(req.query.userId);
    if (!user || !user.is_admin) return res.status(403).json({ error: 'Acesso negado' });
    const users = await User.find().select('-password');
    res.status(200).json(users);
  } catch (err) {
    debug('Erro ao listar usuários: %s', err.message);
    res.status(500).json({ error: 'Falha no servidor' });
  }
});

app.get('/api/cards', async (req, res) => {
  try {
    const cards = await Card.find({ userId: null });
    res.status(200).json(cards);
  } catch (err) {
    debug('Erro ao listar cartões: %s', err.message);
    res.status(500).json({ error: 'Falha no servidor' });
  }
});

app.post('/api/buy-card', async (req, res) => {
  const { userId, cardId, price } = req.body;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error('Usuário não encontrado');
    if (user.balance < price) throw new Error('Saldo insuficiente');
    const card = await Card.findById(cardId).session(session);
    if (!card || card.userId) throw new Error('Cartão inválido ou já comprado');
    user.balance -= price;
    card.userId = userId;
    const transaction = new Transaction({ userId, cardId, amount: price });
    await Promise.all([
      user.save({ session }),
      card.save({ session }),
      transaction.save({ session })
    ]);
    await session.commitTransaction();
    debug('Compra realizada: cartão %s por usuário %s', cardId, userId);
    res.status(200).json({ message: 'Compra realizada' });
  } catch (err) {
    await session.abortTransaction();
    debug('Erro ao comprar cartão: %s', err.message);
    res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
});

app.post('/api/set-card-prices', [
  body('prices').isArray().notEmpty(),
  body('prices.*.nivel').isIn(['Classic', 'Gold', 'Platinum', 'Black']),
  body('prices.*.price').isFloat({ min: 0 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  const { prices } = req.body;
  const userId = req.query.userId;
  try {
    const user = await User.findById(userId);
    if (!user || !user.is_admin) return res.status(403).json({ error: 'Acesso negado' });
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      for (const { nivel, price } of prices) {
        await CardPrice.findOneAndUpdate(
          { nivel },
          { price, updatedAt: new Date() },
          { upsert: true, session }
        );
        await Card.updateMany(
          { nivel, userId: null },
          { price, updatedAt: new Date() },
          { session }
        );
      }
      await session.commitTransaction();
      debug('Preços atualizados por usuário %s', userId);
      res.status(200).json({ message: 'Preços atualizados' });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (err) {
    debug('Erro ao atualizar preços: %s', err.message);
    res.status(500).json({ error: 'Falha no servidor' });
  }
});

app.get('/api/get-card-prices', async (req, res) => {
  try {
    const user = await User.findById(req.query.userId);
    if (!user || !user.is_admin) return res.status(403).json({ error: 'Acesso negado' });
    const prices = await CardPrice.find();
    res.status(200).json(prices);
  } catch (err) {
    debug('Erro ao listar preços: %s', err.message);
    res.status(500).json({ error: 'Falha no servidor' });
  }
});

app.post('/api/logout', (req, res) => {
  debug('Logout solicitado');
  res.status(200).json({ message: 'Logout realizado' });
});

module.exports.handler = serverless(app);
