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
      serverSelectionTimeoutMS: 20000,
      socketTimeoutMS: 120000
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

const CardPriceSchema = new mongoose.Schema({
  nivel: { type: String, required: true, unique: true },
  price: { type: Number, required: true }
}, { timestamps: true });
const CardPrice = mongoose.model('CardPrice', CardPriceSchema);

app.get('/api/health', (req, res) => {
  debug('Verificando saúde do MongoDB');
  res.status(200).json({
    mongoConnected,
    mongooseConnectionState: mongoose.connection.readyState,
    error: mongoConnected ? null : mongoose.connection.error?.message || 'Falha na conexão'
  });
});

app.post('/api/register', [
  body('username').trim().notEmpty().isLength({ min: 3, max: 20 }).withMessage('Usuário deve ter entre 3 e 20 caracteres'),
  body('password').notEmpty().isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres')
], async (req, res) => {
  debug('Tentando registrar usuário: %s', req.body.username);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    debug('Erros de validação: %o', errors.array());
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
    debug('Hash de senha gerado para %s', username);
    const user = new User({ username, password: hashedPassword, is_admin: username === 'LVz' });
    await user.save();
    debug('Usuário registrado com sucesso: %s', username);
    res.status(201).json({ username });
  } catch (err) {
    debug('Erro ao registrar usuário: %s - Stack: %s', err.message, err.stack);
    res.status(500).json({ error: err.message.includes('MongoServerError') ? 'Falha na conexão com o banco' : err.message });
  }
});

app.post('/api/login', [
  body('username').trim().notEmpty().withMessage('Usuário é obrigatório'),
  body('password').notEmpty().withMessage('Senha é obrigatória')
], async (req, res) => {
  debug('Tentando login para usuário: %s', req.body.username);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    debug('Erros de validação: %o', errors.array());
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      debug('Usuário não encontrado: %s', username);
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      debug('Senha incorreta para usuário: %s', username);
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    debug('Login bem-sucedido para usuário: %s', username);
    res.status(200).json({ userId: user._id, username: user.username, is_admin: user.is_admin });
  } catch (err) {
    debug('Erro ao fazer login: %s - Stack: %s', err.message, err.stack);
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

app.post('/api/set-card-prices', [
  body('prices').isArray().notEmpty(),
  body('prices.*.nivel').isIn(['Classic', 'Gold', 'Platinum', 'Black']),
  body('prices.*.price').isFloat({ min: 0 })
], async (req, res) => {
  debug('Atualizando preços dos cartões');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    debug('Erros de validação: %o', errors.array());
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  const { prices } = req.body;
  const userId = req.query.userId;
  try {
    const user = await User.findById(userId);
    if (!user || !user.is_admin) {
      debug('Acesso negado para usuário: %s', userId);
      return res.status(403).json({ error: 'Acesso negado' });
    }
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
      debug('Preços dos cartões atualizados com sucesso');
      res.status(200).json({ message: 'Preços atualizados com sucesso' });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (err) {
    debug('Erro ao atualizar preços: %s - Stack: %s', err.message, err.stack);
    res.status(500).json({ error: err.message.includes('MongoServerError') ? 'Falha na conexão com o banco' : err.message });
  }
});

app.get('/api/get-card-prices', async (req, res) => {
  debug('Buscando preços dos cartões');
  try {
    const userId = req.query.userId;
    const user = await User.findById(userId);
    if (!user || !user.is_admin) {
      debug('Acesso negado para usuário: %s', userId);
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const prices = await CardPrice.find();
    res.status(200).json(prices);
  } catch (err) {
    debug('Erro ao buscar preços: %s', err.message);
    res.status(500).json({ error: err.message.includes('MongoServerError') ? 'Falha na conexão com o banco' : err.message });
  }
});

app.post('/api/logout', (req, res) => {
  debug('Logout solicitado para usuário: %s', req.body.userId);
  res.status(200).json({ message: 'Logout realizado com sucesso' });
});

module.exports.handler = serverless(app);
