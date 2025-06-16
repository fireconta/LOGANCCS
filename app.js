const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect('mongodb://localhost:27017/logan_ccs', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Conectado ao MongoDB'))
    .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

const userSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    is_admin: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const cardSchema = new mongoose.Schema({
    numero: { type: String, unique: true, required: true },
    cvv: { type: String, required: true },
    validade: { type: String, required: true },
    nome: { type: String, required: true },
    cpf: { type: String, required: true },
    bandeira: { type: String, required: true },
    banco: { type: String, required: true },
    nivel: { type: String, required: true },
    price: { type: Number, required: true },
    acquired: { type: Boolean, default: false },
    acquiredBy: { type: String, default: null }
});
const Card = mongoose.model('Card', cardSchema);

const levelSchema = new mongoose.Schema({
    level: { type: String, unique: true, required: true },
    price: { type: Number, required: true }
});
const Level = mongoose.model('Level', levelSchema);

const ADMIN_PASSWORD = 'admin123'; // Substitua por uma senha segura em produção

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, balance, isAdmin } = req.body;
        if (!username.match(/^[a-zA-Z0-9]{3,}$/)) return res.status(400).json({ error: 'Usuário inválido.' });
        if (password.length < 4) return res.status(400).json({ error: 'Senha deve ter 4+ caracteres.' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = Date.now().toString();
        const user = new User({ userId, username, password: hashedPassword, balance, is_admin: isAdmin });
        await user.save();
        res.status(200).json({ userId });
    } catch (err) {
        res.status(400).json({ error: err.code === 11000 ? 'Usuário já existe.' : err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Credenciais inválidas.' });
        res.status(200).json({ userId: user.userId, isAdmin: user.is_admin });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const { userId } = req.query;
        const user = await User.findOne({ userId }).select('-password');
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
        res.status(200).json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/verify-admin', async (req, res) => {
    try {
        const { userId, adminPassword } = req.body;
        const user = await User.findOne({ userId });
        if (!user || !user.is_admin || adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Autenticação admin falhou.' });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.status(200).json(users);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/admin/users/:userId', async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.params.userId }).select('-password');
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
        res.status(200).json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/admin/users/:userId', async (req, res) => {
    try {
        const { balance, isAdmin, password } = req.body;
        const updateData = { balance, is_admin: isAdmin };
        if (password) updateData.password = await bcrypt.hash(password, 10);
        const user = await User.findOneAndUpdate({ userId: req.params.userId }, updateData, { new: true });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/admin/users/:userId', async (req, res) => {
    try {
        const user = await User.findOneAndDelete({ userId: req.params.userId });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
        await Card.updateMany({ acquiredBy: req.params.userId }, { acquired: false, acquiredBy: null });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/admin/levels', async (req, res) => {
    try {
        const levels = await Level.find();
        if (levels.length === 0) {
            const defaultLevels = [
                { level: 'Classic', price: 50 },
                { level: 'Gold', price: 100 },
                { level: 'Platinum', price: 200 },
                { level: 'Black', price: 500 }
            ];
            await Level.insertMany(defaultLevels);
            return res.status(200).json(defaultLevels);
        }
        res.status(200).json(levels);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/admin/levels/:level', async (req, res) => {
    try {
        const { price } = req.body;
        if (price <= 0) return res.status(400).json({ error: 'Preço deve ser maior que 0.' });
        const level = await Level.findOneAndUpdate({ level: req.params.level }, { price }, { new: true });
        if (!level) return res.status(404).json({ error: 'Nível não encontrado.' });
        await Card.updateMany({ nivel: req.params.level }, { price });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/cards', async (req, res) => {
    try {
        const cards = await Card.find({ acquired: false }).select('numero bandeira banco nivel price');
        res.status(200).json(cards);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/cards/:cardId', async (req, res) => {
    try {
        const card = await Card.findById(req.params.cardId);
        if (!card) return res.status(404).json({ error: 'Cartão não encontrado.' });
        res.status(200).json(card);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/cards/purchase', async (req, res) => {
    try {
        const { cardId, userId } = req.body;
        const card = await Card.findById(cardId);
        if (!card || card.acquired) return res.status(400).json({ error: 'Cartão não disponível.' });
        const user = await User.findOne({ userId });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
        if (user.balance < card.price) return res.status(400).json({ error: 'Saldo insuficiente.' });
        user.balance -= card.price;
        await user.save();
        card.acquired = true;
        card.acquiredBy = userId;
        await card.save();
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/admin/cards', async (req, res) => {
    try {
        const cards = await Card.find();
        res.status(200).json(cards);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/admin/cards', async (req, res) => {
    try {
        const { numero, cvv, validade, nome, cpf, bandeira, banco, nivel } = req.body;
        if (!numero.match(/^\d{16}$/)) return res.status(400).json({ error: 'Número inválido.' });
        if (!cvv.match(/^\d{3}$/)) return res.status(400).json({ error: 'CVV inválido.' });
        if (!validade.match(/^\d{2}\/\d{2}$/)) return res.status(400).json({ error: 'Validade inválida.' });
        if (!cpf.match(/^\d{11}$/)) return res.status(400).json({ error: 'CPF inválido.' });
        const level = await Level.findOne({ level: nivel });
        if (!level) return res.status(400).json({ error: 'Nível inválido.' });
        const card = new Card({ numero, cvv, validade, nome, cpf, bandeira, banco, nivel, price: level.price });
        await card.save();
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.code === 11000 ? 'Cartão já existe.' : err.message });
    }
});

app.put('/api/admin/cards/:cardId', async (req, res) => {
    try {
        const { numero, cvv, validade, nome, cpf, bandeira, banco, nivel } = req.body;
        if (!numero.match(/^\d{16}$/)) return res.status(400).json({ error: 'Número inválido.' });
        if (!cvv.match(/^\d{3}$/)) return res.status(400).json({ error: 'CVV inválido.' });
        if (!validade.match(/^\d{2}\/\d{2}$/)) return res.status(400).json({ error: 'Validade inválida.' });
        if (!cpf.match(/^\d{11}$/)) return res.status(400).json({ error: 'CPF inválido.' });
        const level = await Level.findOne({ level: nivel });
        if (!level) return res.status(400).json({ error: 'Nível inválido.' });
        const card = await Card.findByIdAndUpdate(req.params.cardId, { numero, cvv, validade, nome, cpf, bandeira, banco, nivel, price: level.price }, { new: true });
        if (!card) return res.status(404).json({ error: 'Cartão não encontrado.' });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/admin/cards/:cardId', async (req, res) => {
    try {
        const card = await Card.findByIdAndDelete(req.params.cardId);
        if (!card) return res.status(404).json({ error: 'Cartão não encontrado.' });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/admin/cards/bulk', async (req, res) => {
    try {
        const { cards } = req.body;
        const validCards = [];
        for (const card of cards) {
            if (!card.numero.match(/^\d{16}$/)) continue;
            if (!card.cvv.match(/^\d{3}$/)) continue;
            if (!card.validade.match(/^\d{2}\/\d{2}$/)) continue;
            if (!card.cpf.match(/^\d{11}$/)) continue;
            const level = await Level.findOne({ level: card.nivel });
            if (!level) continue;
            validCards.push({ ...card, price: level.price });
        }
        await Card.insertMany(validCards, { ordered: false });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.listen(3000, () => console.log('Servidor rodando na porta 3000'));
