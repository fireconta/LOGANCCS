const express = require('express');
const mongoose = require('mongoose');
const serverless = require('serverless-http');
const debug = require('debug')('loganccs:app');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos do mesmo diretório
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
    throw err;
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
CardSchema.index({ acquired: 1 });
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

// Endpoints
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      debug('Dados de registro ausentes:', { username });
      return res.status(400).json({ error: 'Username e senha são obrigatórios' });
    }
    if (password.length < 6) {
      debug('Senha muito curta:', { username });
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }
    const existingUser = await User.findOne({ username }).lean();
    if (existingUser) {
      debug('Usuário já existe:', username);
      return res.status(400).json({ error: 'Usuário já existe' });
    }
    const user = new User({ username, password, balance: 0, is_admin: false });
    await user.save();
    debug('Usuário registrado:', username);
    res.status(201).json({
      userId: user._id,
      username: user.username,
      is_admin: user.is_admin
    });
  } catch (err) {
    debug('Erro no registro:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      debug('Dados de login ausentes:', { username });
      return res.status(400).json({ error: 'Username e senha são obrigatórios' });
    }
    const user = await User.findOne({ username }).lean();
    if (!user) {
      debug('Usuário não encontrado:', username);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    // Em produção, use bcrypt
    if (user.password !== password) {
      debug('Senha incorreta para:', username);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    debug('Login bem-sucedido:', username);
    res.status(200).json({
      userId: user._id,
      username: user.username,
      is_admin: user.is_admin
    });
  } catch (err) {
    debug('Erro no login:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.get('/api/cards', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId || !isValidObjectId(userId)) {
      debug('userId inválido:', userId);
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const cards = await Card.find({ acquired: false }).lean();
    debug(`Retornando ${cards.length} cartões disponíveis`);
    res.status(200).json(cards);
  } catch (err) {
    debug('Erro ao buscar cartões:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/buy-card', async (req, res) => {
  try {
    const { userId, cardId, price } = req.body;
    if (!userId || !cardId || !isValidObjectId(userId) || !isValidObjectId(cardId)) {
      debug('Dados inválidos:', { userId, cardId });
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    if (!price || isNaN(price) || price <= 0) {
      debug('Preço inválido:', price);
      return res.status(400).json({ error: 'Preço inválido' });
    }
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
  } catch (err) {
    debug('Erro ao comprar cartão:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const userId = req.query.userId;
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
  } catch (err) {
    debug('Erro ao buscar usuário:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/logout', (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId || !isValidObjectId(userId)) {
      debug('userId inválido para logout:', userId);
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    debug('Logout realizado no backend:', userId);
    res.status(200).json({ message: 'Logout realizado com sucesso' });
  } catch (err) {
    debug('Erro ao realizar logout:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota padrão
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Manipulador de erros
app.use((err, req, res, next) => {
  debug('Erro não tratado:', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Exportar para Netlify
module.exports = app;
module.exports.handler = serverless(app);
