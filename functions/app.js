const express = require('express');
const mongoose = require('mongoose');
const serverless = require('serverless-http');
const debug = require('debug')('app') || console.log;
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const cors = require('cors');

const app = express();

// Configurar CORS
app.use(cors({ 
  origin: 'https://loganccs.netlify.app', 
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  exposedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '50kb' }));

// Middleware para logar todas as requisições
app.use((req, res, next) => {
  debug(`[INFO] Recebida requisição: ${req.method} ${req.originalUrl} - Body: %O`, req.body);
  res.on('finish', () => {
    debug(`[INFO] Resposta enviada: Status ${res.statusCode} - ${req.method} ${req.originalUrl}`);
  });
  next();
});

let mongoConnected = false;
let cachedConnection = null;

const connectMongoDB = async () => {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    debug('[INFO] Reutilizando conexão existente com MongoDB');
    return;
  }
  try {
    if (!process.env.MONGODB_URI) {
      debug('[ERRO] Variável de ambiente MONGODB_URI não está configurada');
      throw new Error('MONGODB_URI não configurado');
    }
    cachedConnection = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 60000,
      socketTimeoutMS: 180000
    });
    mongoConnected = true;
    debug('[INFO] Conexão estabelecida com MongoDB Atlas');
  } catch (err) {
    mongoConnected = false;
    debug('[ERRO] Falha ao conectar ao MongoDB: %s - Detalhes: %O', err.message, err);
    throw new Error('Falha na conexão com o banco de dados');
  }
};

// Middleware para conexão MongoDB
app.use(async (req, res, next) => {
  try {
    await connectMongoDB();
    next();
  } catch (err) {
    debug('[ERRO] Middleware MongoDB falhou: %s', err.message);
    res.status(500).json({ error: err.message, details: 'Erro ao conectar ao banco de dados' });
  }
});

// Middleware para tratamento de erros
app.use((err, req, res, next) => {
  debug('[ERRO] Erro não tratado na requisição %s %s: %s - Stack: %O', req.method, req.originalUrl, err.message, err.stack);
  res.status(500).json({ error: 'Erro interno do servidor', details: err.message });
});

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
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

// Endpoint de teste
app.get('/api/test-endpoint', (req, res) => {
  debug('[INFO] Acessando endpoint de teste /api/test-endpoint');
  res.status(200).json({ 
    message: 'Servidor funcionando', 
    env: !!process.env.MONGODB_URI,
    timestamp: new Date().toISOString()
  });
});

// Endpoint de saúde
app.get('/api/health', (req, res) => {
  debug('[INFO] Acessando endpoint de saúde /api/health');
  res.status(200).json({
    mongoConnected,
    mongooseConnectionState: mongoose.connection.readyState,
    timestamp: new Date().toISOString()
  });
});

// Registro
app.post('/api/register', [
  body('username').trim().notEmpty().isLength({ min: 3, max: 20 }).withMessage('Usuário deve ter entre 3 e 20 caracteres'),
  body('password').notEmpty().isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    debug('[ERRO] Validação falhou em /api/register: %O', errors.array());
    return res.status(400).json({ error: errors.array()[0].msg, details: 'Erro de validação nos dados de entrada' });
  }
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      debug('[ERRO] Tentativa de registro com usuário existente: %s', username);
      return res.status(400).json({ error: 'Usuário já existe', details: 'O nome de usuário já está registrado' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, isAdmin: username === 'LVz' });
    await user.save();
    debug('[INFO] Usuário registrado com sucesso: %s', username);
    res.status(201).json({ username, message: 'Registro concluído' });
  } catch (err) {
    debug('[ERRO] Falha ao registrar usuário: %s - Detalhes: %O', err.message, err);
    res.status(500).json({ error: 'Falha no servidor', details: err.message });
  }
});

// Login
app.post('/api/login', [
  body('username').trim().notEmpty().withMessage('Usuário é obrigatório'),
  body('password').notEmpty().withMessage('Senha é obrigatória')
], async (req, res) => {
  debug('[INFO] Acessando /api/login com body: %O', req.body);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    debug('[ERRO] Validação falhou em /api/login: %O', errors.array());
    return res.status(400).json({ error: errors.array()[0].msg, details: 'Erro de validação nos dados de entrada' });
  }
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      debug('[ERRO] Usuário não encontrado: %s', username);
      return res.status(404).json({ error: 'Usuário não encontrado', details: 'O usuário informado não existe' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      debug('[ERRO] Senha incorreta para usuário: %s', username);
      return res.status(401).json({ error: 'Senha incorreta', details: 'A senha fornecida não corresponde ao usuário' });
    }
    debug('[INFO] Login bem-sucedido: %s', username);
    res.status(200).json({ 
      userId: user._id.toString(), 
      username: user.username, 
      is_admin: user.isAdmin,
      message: 'Login realizado com sucesso'
    });
  } catch (err) {
    debug('[ERRO] Falha ao processar login: %s - Detalhes: %O', err.message, err);
    res.status(500).json({ error: 'Falha no servidor', details: err.message });
  }
});

// Buscar usuário
app.get('/api/user', async (req, res) => {
  debug('[INFO] Acessando /api/user com userId: %s', req.query.userId);
  try {
    const user = await User.findById(req.query.userId).select('-password');
    if (!user) {
      debug('[ERRO] Usuário não encontrado: %s', req.query.userId);
      return res.status(404).json({ error: 'Usuário não encontrado', details: 'O ID de usuário informado não existe' });
    }
    res.status(200).json(user);
  } catch (err) {
    debug('[ERRO] Falha ao buscar usuário: %s - Detalhes: %O', err.message, err);
    res.status(500).json({ error: 'Falha no servidor', details: err.message });
  }
});

// Listar usuários (admin)
app.get('/api/users', async (req, res) => {
  debug('[INFO] Acessando /api/users com userId: %s', req.query.userId);
  try {
    const user = await User.findById(req.query.userId);
    if (!user || !user.isAdmin) {
      debug('[ERRO] Acesso negado para userId: %s', req.query.userId);
      return res.status(403).json({ error: 'Acesso negado', details: 'Apenas administradores podem acessar esta rota' });
    }
    const users = await User.find().select('-password');
    res.status(200).json(users);
  } catch (err) {
    debug('[ERRO] Falha ao listar usuários: %s - Detalhes: %O', err.message, err);
    res.status(500).json({ error: 'Falha no servidor', details: err.message });
  }
});

// Listar cartões disponíveis
app.get('/api/cards', async (req, res) => {
  debug('[INFO] Acessando /api/cards');
  try {
    const cards = await Card.find({ userId: null });
    res.status(200).json(cards);
  } catch (err) {
    debug('[ERRO] Falha ao listar cartões: %s - Detalhes: %O', err.message, err);
    res.status(500).json({ error: 'Falha no servidor', details: err.message });
  }
});

// Comprar cartão
app.post('/api/buy-card', async (req, res) => {
  debug('[INFO] Acessando /api/buy-card com body: %O', req.body);
  const { userId, cardId, price } = req.body;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const user = await User.findById(userId).session(session);
    if (!user) {
      debug('[ERRO] Usuário não encontrado: %s', userId);
      throw new Error('Usuário não encontrado');
    }
    if (user.balance < price) {
      debug('[ERRO] Saldo insuficiente para usuário: %s', userId);
      throw new Error('Saldo insuficiente');
    }
    const card = await Card.findById(cardId).session(session);
    if (!card || card.userId) {
      debug('[ERRO] Cartão inválido ou já comprado: %s', cardId);
      throw new Error('Cartão inválido ou já comprado');
    }
    user.balance -= price;
    card.userId = userId;
    const transaction = new Transaction({ userId, cardId, amount: price });
    await Promise.all([
      user.save({ session }),
      card.save({ session }),
      transaction.save({ session })
    ]);
    await session.commitTransaction();
    debug('[INFO] Compra realizada: cartão %s por usuário %s', cardId, userId);
    res.status(200).json({ message: 'Compra realizada com sucesso' });
  } catch (err) {
    await session.abortTransaction();
    debug('[ERRO] Falha ao comprar cartão: %s - Detalhes: %O', err.message, err);
    res.status(400).json({ error: err.message, details: 'Erro ao processar a compra' });
  } finally {
    session.endSession();
  }
});

// Definir preços de cartões (admin)
app.post('/api/set-card-prices', [
  body('prices').isArray().notEmpty(),
  body('prices.*.nivel').isIn(['Classic', 'Gold', 'Platinum', 'Black']),
  body('prices.*.price').isFloat({ min: 0 })
], async (req, res) => {
  debug('[INFO] Acessando /api/set-card-prices com body: %O', req.body);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    debug('[ERRO] Validação falhou em /api/set-card-prices: %O', errors.array());
    return res.status(400).json({ error: errors.array()[0].msg, details: 'Erro de validação nos dados de entrada' });
  }
  const { prices } = req.body;
  const userId = req.query.userId;
  try {
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) {
      debug('[ERRO] Acesso negado para userId: %s', userId);
      return res.status(403).json({ error: 'Acesso negado', details: 'Apenas administradores podem acessar esta rota' });
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
      debug('[INFO] Preços de cartões atualizados por usuário: %s', userId);
      res.status(200).json({ message: 'Preços atualizados com sucesso' });
    } catch (err) {
      await session.abortTransaction();
      debug('[ERRO] Falha ao atualizar preços: %s - Detalhes: %O', err.message, err);
      throw err;
    } finally {
      session.endSession();
    }
  } catch (err) {
    debug('[ERRO] Falha geral ao atualizar preços: %s - Detalhes: %O', err.message, err);
    res.status(500).json({ error: 'Falha no servidor', details: err.message });
  }
});

// Obter preços de cartões (admin)
app.get('/api/get-card-prices', async (req, res) => {
  debug('[INFO] Acessando /api/get-card-prices com userId: %s', req.query.userId);
  try {
    const user = await User.findById(req.query.userId);
    if (!user || !user.isAdmin) {
      debug('[ERRO] Acesso negado para userId: %s', req.query.userId);
      return res.status(403).json({ error: 'Acesso negado', details: 'Apenas administradores podem acessar esta rota' });
    }
    const prices = await CardPrice.find();
    res.status(200).json(prices);
  } catch (err) {
    debug('[ERRO] Falha ao listar preços: %s - Detalhes: %O', err.message, err);
    res.status(500).json({ error: 'Falha no servidor', details: err.message });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  debug('[INFO] Logout solicitado');
  res.status(200).json({ message: 'Logout realizado com sucesso' });
});

// Exportar função serverless
module.exports.handler = serverless(app, {
  binary: ['application/json']
});
