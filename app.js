const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const xlsx = require('xlsx');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requisições por IP
  message: 'Muitas requisições, tente novamente mais tarde.'
}));

// Conexão com MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('Conectado ao MongoDB')).catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  is_admin: { type: Boolean, default: false }
}, { timestamps: true });

const cardSchema = new mongoose.Schema({
  numero: { type: String, required: true, unique: true },
  cvv: { type: String, required: true },
  expiry: { type: String, required: true },
  name: { type: String, required: true },
  cpf: { type: String, required: true },
  bandeira: { type: String, required: true },
  banco: { type: String, required: true },
  nivel: { type: String, required: true },
  price: { type: Number, required: true },
  acquiredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
  amount: { type: Number, required: true }
}, { timestamps: true });

const levelSchema = new mongoose.Schema({
  level: { type: String, required: true, unique: true },
  price: { type: Number, required: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Card = mongoose.model('Card', cardSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Level = mongoose.model('Level', levelSchema);

// Validações
const validateUser = [
  body('username').isAlphanumeric().isLength({ min: 3 }).trim().escape(),
  body('password').isLength({ min: 4 }).trim()
];

const validateCard = [
  body('numero').matches(/^\d{16}$/).trim(),
  body('cvv').matches(/^\d{3}$/).trim(),
  body('expiry').matches(/^\d{2}\/\d{2}$/).trim(),
  body('cpf').matches(/^\d{11}$/).trim(),
  body('bandeira').isIn(['Visa', 'Mastercard', 'Amex', 'Elo', 'Hipercard', 'Diners Club']).trim(),
  body('banco').isIn(['Nubank', 'Itaú', 'Bradesco', 'Santander', 'Banco do Brasil', 'Caixa Econômica Federal', 'Sicredi', 'Sicoob']).trim(),
  body('nivel').isIn(['Classic', 'Gold', 'Platinum', 'Black']).trim(),
  body('price').isFloat({ min: 0 })
];

// Middleware de autenticação
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido.' });
  }
};

// Middleware de admin
const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.is_admin) return res.status(403).json({ error: 'Acesso negado.' });
    next();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar permissão.' });
  }
};

// Rotas
app.post('/api/login', validateUser, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ userId: user._id, token, isAdmin: user.is_admin });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
});

app.get('/api/users', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.query.userId).select('username balance is_admin');
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar usuário.' });
  }
});

app.get('/api/cards', authenticate, async (req, res) => {
  try {
    const cards = await Card.find({ acquiredBy: null }).select('-cvv -name -cpf -acquiredBy');
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar cartões.' });
  }
});

app.get('/api/admin/cards', authenticate, isAdmin, async (req, res) => {
  try {
    const cards = await Card.find().select('numero bandeira banco nivel price acquiredBy');
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar cartões.' });
  }
});

app.post('/api/transactions', authenticate, async (req, res) => {
  const { userId, cardId } = req.body;
  if (!userId || !cardId) return res.status(400).json({ error: 'Dados inválidos.' });
  try {
    const user = await User.findById(userId);
    const card = await Card.findById(cardId);
    if (!user || !card) return res.status(404).json({ error: 'Usuário ou cartão não encontrado.' });
    if (card.acquiredBy) return res.status(400).json({ error: 'Cartão já adquirido.' });
    if (user.balance < card.price) return res.status(400).json({ error: 'Saldo insuficiente.' });
    user.balance -= card.price;
    card.acquiredBy = userId;
    const transaction = new Transaction({ userId, cardId, amount: card.price });
    await Promise.all([user.save(), card.save(), transaction.save()]);
    res.json({ message: 'Compra realizada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao processar transação.' });
  }
});

app.post('/api/verify-admin', authenticate, isAdmin, async (req, res) => {
  const { adminPassword } = req.body;
  if (adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Senha de admin inválida.' });
  res.json({ message: 'Autenticação de admin bem-sucedida.' });
});

app.get('/api/admin/users', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select('username balance is_admin');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar usuários.' });
  }
});

app.post('/api/admin/users', authenticate, isAdmin, validateUser, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  const { username, password, balance, is_admin } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: 'Usuário já existe.' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, balance: parseFloat(balance) || 0, is_admin: is_admin === 'true' });
    await user.save();
    res.json({ message: 'Usuário criado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar usuário.' });
  }
});

app.put('/api/admin/users', authenticate, isAdmin, async (req, res) => {
  const { userId, password, balance, is_admin } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (password) user.password = await bcrypt.hash(password, 10);
    user.balance = parseFloat(balance) || user.balance;
    user.is_admin = is_admin === 'true';
    await user.save();
    res.json({ message: 'Usuário atualizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar usuário.' });
  }
});

app.delete('/api/admin/users', authenticate, isAdmin, async (req, res) => {
  const { userId } = req.body;
  try {
    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ message: 'Usuário excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});

app.post('/api/admin/cards', authenticate, isAdmin, validateCard, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  try {
    const card = new Card(req.body);
    await card.save();
    res.json({ message: 'Cartão adicionado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao adicionar cartão.' });
  }
});

app.put('/api/admin/cards', authenticate, isAdmin, validateCard, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  const { _id, ...cardData } = req.body;
  try {
    const card = await Card.findByIdAndUpdate(_id, cardData, { new: true });
    if (!card) return res.status(404).json({ error: 'Cartão não encontrado.' });
    res.json({ message: 'Cartão atualizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar cartão.' });
  }
});

app.delete('/api/admin/cards', authenticate, isAdmin, async (req, res) => {
  const { cardId } = req.body;
  try {
    const card = await Card.findByIdAndDelete(cardId);
    if (!card) return res.status(404).json({ error: 'Cartão não encontrado.' });
    res.json({ message: 'Cartão excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir cartão.' });
  }
});

app.post('/api/admin/cards/import', authenticate, isAdmin, upload.single('file'), async (req, res) => {
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);
    const validCards = data.filter(row => (
      /^\d{16}$/.test(row.numero) &&
      /^\d{3}$/.test(row.cvv) &&
      /^\d{2}\/\d{2}$/.test(row.expiry) &&
      /^\d{11}$/.test(row.cpf) &&
      ['Visa', 'Mastercard', 'Amex', 'Elo', 'Hipercard', 'Diners Club'].includes(row.bandeira) &&
      ['Nubank', 'Itaú', 'Bradesco', 'Santander', 'Banco do Brasil', 'Caixa Econômica Federal', 'Sicredi', 'Sicoob'].includes(row.banco) &&
      ['Classic', 'Gold', 'Platinum', 'Black'].includes(row.nivel) &&
      typeof row.price === 'number' && row.price >= 0
    ));
    for (const card of validCards) {
      const existingCard = await Card.findOne({ numero: card.numero });
      if (!existingCard) await new Card(card).save();
    }
    res.json({ message: `${validCards.length} cartões importados com sucesso.` });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao importar cartões.' });
  }
});

app.get('/api/levels', authenticate, isAdmin, async (req, res) => {
  try {
    const levels = await Level.find();
    res.json(levels);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar níveis.' });
  }
});

app.put('/api/levels', authenticate, isAdmin, async (req, res) => {
  const { level, price } = req.body;
  if (!level || typeof price !== 'number' || price < 0) return res.status(400).json({ error: 'Dados inválidos.' });
  try {
    const updatedLevel = await Level.findOneAndUpdate({ level }, { price }, { new: true, upsert: true });
    res.json({ message: 'Preço do nível atualizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar nível.' });
  }
});

// Inicialização
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
