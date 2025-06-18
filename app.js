const express = require('express');
const mongoose = require('mongoose');
const serverless = require('serverless-http');
const debug = require('debug')('loganccs:app');
const path = require('path');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  debug(`Requisição recebida: ${req.method} ${req.url}`);
  res.setHeader('Content-Type', 'application/json');
  res.header('Access-Control-Allow-Origin', 'https://loganccs.netlify.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Servir arquivos estáticos
app.use(express.static(__dirname));

// Conexão com MongoDB
const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    debug('Conectado ao MongoDB Atlas');
  } catch (err) {
    debug('Erro ao conectar ao MongoDB:', err.message);
    throw new Error('Falha na conexão com o banco de dados');
  }
};
connectMongoDB().catch(err => {
  console.error('Falha na conexão inicial com MongoDB:', err.message);
  process.exit(1);
});

// Modelos
const CardSchema = new mongoose.Schema({
  numero: { type: String, required: true, unique: true },
  bandeira: { type: String, required: true },
  banco: { type: String, required: true },
  nivel: { type: String, required: true },
  price: { type: Number, required: true },
  cvv: { type: String, required: true },
  validade: { type: String, required: true },
  acquired: { type: Boolean, default: false },
  acquired_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
CardSchema.index({ acquired: 1, bandeira: 1, banco: 1, nivel: 1 });
const Card = mongoose.model('Card', CardSchema);

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  is_admin: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
}, { timestamps: true });
UserSchema.index({ username: 1 });
const User = mongoose.model('User', UserSchema);

const TransactionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });
TransactionSchema.index({ user_id: 1, timestamp: -1 });
const Transaction = mongoose.model('Transaction', TransactionSchema);

// Validação de ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// Validações
const registerValidation = [
  body('username').trim().notEmpty().withMessage('Username é obrigatório').isLength({ max: 50 }).withMessage('Username deve ter no máximo 50 caracteres'),
  body('password').notEmpty().withMessage('Senha é obrigatória').isLength({ min: 6 }).withMessage('A senha deve ter pelo menos 6 caracteres'),
];

const loginValidation = [
  body('username').trim().notEmpty().withMessage('Username é obrigatório'),
  body('password').notEmpty().withMessage('Senha é obrigatória'),
];

const buyCardValidation = [
  body('userId').custom(isValidObjectId).withMessage('ID de usuário inválido'),
  body('cardId').custom(isValidObjectId).withMessage('ID de cartão inválido'),
  body('price').isFloat({ min: 0 }).withMessage('Preço inválido'),
];

// Rota de teste
app.get('/api/test', (req, res) => {
  debug('Rota de teste acessada');
  res.json({ message: 'API funcionando' });
});

// Endpoints
app.post('/api/register', registerValidation, async (req, res) => {
  try {
    debug('Iniciando registro:', req.body.username);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      debug('Erros de validação:', errors.array());
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username }).lean();
    if (existingUser) {
      debug('Usuário já existe:', username);
      return res.status(400).json({ error: 'Usuário já existe' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, balance: 0, is_admin: false });
    await user.save();
    debug('Usuário registrado:', username);
    res.status(201).json({
      userId: user._id,
      username: user.username,
      is_admin: user.is_admin
    });
  } catch (error) {
    debug('Erro no registro:', error.message);
    res.status(500).json({ error: 'Erro ao registrar usuário. Tente novamente.' });
  }
});

app.post('/api/login', loginValidation, async (req, res) => {
  try {
    debug('Iniciando login:', req.body.username);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      debug('Erros de validação:', errors.array());
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    const { username, password } = req.body;
    const user = await User.findOne({ username }).lean();
    if (!user) {
      debug('Usuário não encontrado:', username);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      debug('Senha incorreta para:', username);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    debug('Login bem-sucedido:', username);
    res.status(200).json({
      userId: user._id,
      username: user.username,
      is_admin: user.is_admin
    });
  } catch (error) {
    debug('Erro no login:', error.message);
    res.status(500).json({ error: 'Erro ao realizar login. Tente novamente.' });
  }
});

app.get('/api/cards', async (req, res) => {
  try {
    const userId = req.query.userId;
    debug('Buscando cartões para userId:', userId);
    if (!userId || !isValidObjectId(userId)) {
      debug('userId inválido:', userId);
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const cards = await Card.find({ acquired: false }).lean();
    debug(`Retornando ${cards.length} cartões disponíveis`);
    res.status(200).json(cards);
  } catch (error) {
    debug('Erro ao buscar cartões:', error.message);
    res.status(500).json({ error: 'Erro ao carregar cartões. Tente novamente.' });
  }
});

app.post('/api/buy-card', buyCardValidation, async (req, res) => {
  try {
    debug('Iniciando compra de cartão:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      debug('Erros de validação:', errors.array());
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    const { userId, cardId, price } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(userId).session(session);
      const card = await Card.findById(cardId).session(session);
      if (!user || !card) {
        await session.abortTransaction();
        debug('Usuário ou cartão não encontrado:', { userId, cardId });
        return res.status(404).json({ error: 'Usuário ou cartão não encontrado' });
      }
      if (card.acquired) {
        await session.abortTransaction();
        debug('Cartão já adquirido:', cardId);
        return res.status(400).json({ error: 'Cartão já foi adquirido' });
      }
      if (user.balance < price) {
        await session.abortTransaction();
        debug('Saldo insuficiente:', { userId, balance: user.balance, price });
        return res.status(400).json({ error: 'Saldo insuficiente' });
      }
      user.balance -= price;
      card.acquired = true;
      card.acquired_by = userId;
      await user.save({ session });
      await card.save({ session });
      await Transaction.create([{
        user_id: userId,
        type: 'purchase',
        amount: price,
        description: `Compra de cartão ${card.nivel} ${card.bandeira}`,
      }], { session });
      await session.commitTransaction();
      debug('Compra realizada:', { userId, cardId, price });
      res.status(200).json({ message: 'Compra realizada com sucesso' });
    } catch (err) {
      await session.abortTransaction();
      debug('Erro na transação de compra:', err.message);
      throw err;
    } finally {
      session.endSession();
    }
  } catch (error) {
    debug('Erro ao comprar cartão:', error.message);
    res.status(500).json({ error: 'Erro ao processar compra. Tente novamente.' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const userId = req.query.userId;
    debug('Buscando usuários:', { userId });
    if (!userId || !isValidObjectId(userId)) {
      debug('userId inválido:', userId);
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const user = await User.findById(userId).select('is_admin').lean();
    if (!user) {
      debug('Usuário não encontrado:', userId);
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    if (!user.is_admin) {
      debug('Acesso não autorizado:', userId);
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    const users = await User.find().select('username balance is_admin created_at').lean();
    debug(`Retornando ${users.length} usuários`);
    res.status(200).json(users);
  } catch (error) {
    debug('Erro ao buscar usuários:', error.message);
    res.status(500).json({ error: 'Erro ao carregar usuários. Tente novamente.' });
  }
});

app.get('/api/user', async (req, res) => {
  try {
    const userId = req.query.userId;
    debug('Buscando dados do usuário:', userId);
    if (!userId || !isValidObjectId(userId)) {
      debug('userId inválido:', userId);
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const user = await User.findById(userId).select('username balance is_admin').lean();
    if (!user) {
      debug('Usuário não encontrado:', userId);
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    debug('Dados do usuário retornados:', userId);
    res.status(200).json(user);
  } catch (error) {
    debug('Erro ao buscar usuário:', error.message);
    res.status(500).json({ error: 'Erro ao carregar dados do usuário. Tente novamente.' });
  }
});

app.post('/api/logout', async (req, res) => {
  try {
    const userId = req.body.userId;
    debug('Iniciando logout:', userId);
    if (!userId || !isValidObjectId(userId)) {
      debug('userId inválido para logout:', userId);
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    debug('Logout realizado no backend:', userId);
    res.status(200).json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    debug('Erro no logout:', error.message);
    res.status(500).json({ error: 'Erro ao realizar logout. Tente novamente.' });
  }
});

// Rota padrão
app.get('/', (req, res) => {
  debug('Servindo index.html');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Manipulador de erros
app.use((err, req, res, next) => {
  debug('Erro não tratado:', err.message);
  res.status(500).json({ error: 'Erro interno do servidor. Tente novamente.' });
});

module.exports = app;
module.exports.handler = serverless(app);
