const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

let db;

// Função para conectar ao MongoDB Atlas
async function connectToDB() {
  if (db) return db;
  try {
    const client = new MongoClient(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    console.log('Conexão com MongoDB Atlas estabelecida');
    db = client.db('loganccs');
    return db;
  } catch (error) {
    console.error('Erro ao conectar ao MongoDB:', error.message);
    throw new Error('Erro ao conectar ao banco de dados');
  }
}

// Middleware para verificar JWT
function verifyJWT(req, res) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    console.error('Token JWT não fornecido');
    return res.status(401).json({ success: false, error: 'Token não fornecido' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) {
      console.error('Usuário não é admin:', decoded.username);
      return res.status(403).json({ success: false, error: 'Acesso negado: usuário não é admin' });
    }
    return decoded;
  } catch (error) {
    console.error('Erro ao verificar JWT:', error.message);
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
  }
}

// Configuração do Express
const express = require('express');
const serverless = require('serverless-http');
const app = express();
app.use(express.json());

// Rota para verificar autenticação
app.get('/check-auth', async (req, res) => {
  try {
    const user = verifyJWT(req, res);
    if (!user) return;
    console.log('Autenticação bem-sucedida para usuário:', user.username);
    res.json({ success: true, authenticated: true, user: { username: user.username, balance: user.balance, isAdmin: user.isAdmin } });
  } catch (error) {
    console.error('Erro na rota /check-auth:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para listar bancos
app.get('/banks', async (req, res) => {
  try {
    const user = verifyJWT(req, res);
    if (!user) return;
    const db = await connectToDB();
    console.log('Buscando bancos na coleção loganccs.banks');
    const banks = await db.collection('banks').find().toArray();
    if (!Array.isArray(banks)) {
      console.error('Resposta da coleção banks não é um array:', banks);
      return res.status(500).json({ success: false, error: 'Erro nos dados de bancos: formato inválido' });
    }
    if (banks.length === 0) {
      console.log('Nenhum banco encontrado na coleção banks');
    } else {
      console.log(`Bancos encontrados: ${banks.length}`);
    }
    res.json(banks);
  } catch (error) {
    console.error('Erro na rota /banks:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para listar usuários
app.get('/users', async (req, res) => {
  try {
    const user = verifyJWT(req, res);
    if (!user) return;
    const db = await connectToDB();
    console.log('Buscando usuários na coleção loganccs.users');
    const users = await db.collection('users').find().toArray();
    res.json(users);
  } catch (error) {
    console.error('Erro na rota /users:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para atualizar usuário
app.put('/users', async (req, res) => {
  try {
    const user = verifyJWT(req, res);
    if (!user) return;
    const { userId, balance, isAdmin } = req.body;
    if (!userId) {
      console.error('ID do usuário não fornecido na rota /users');
      return res.status(400).json({ success: false, error: 'ID do usuário é obrigatório' });
    }
    const db = await connectToDB();
    const updateData = {};
    if (balance !== undefined) updateData.balance = parseFloat(balance);
    if (isAdmin !== undefined) updateData.isAdmin = isAdmin;
    console.log(`Atualizando usuário ${userId} com dados:`, updateData);
    const result = await db.collection('users').updateOne(
      { _id: userId },
      { $set: updateData }
    );
    if (result.matchedCount === 0) {
      console.error('Usuário não encontrado:', userId);
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Erro na rota /users (PUT):', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para excluir usuário
app.delete('/delete-user', async (req, res) => {
  try {
    const user = verifyJWT(req, res);
    if (!user) return;
    const { targetId } = req.body;
    if (!targetId) {
      console.error('ID do usuário não fornecido na rota /delete-user');
      return res.status(400).json({ success: false, error: 'ID do usuário é obrigatório' });
    }
    if (targetId === user._id) {
      console.error('Tentativa de excluir o próprio usuário:', user.username);
      return res.status(403).json({ success: false, error: 'Não é permitido excluir o próprio usuário' });
    }
    const db = await connectToDB();
    console.log('Excluindo usuário:', targetId);
    const result = await db.collection('users').deleteOne({ _id: targetId });
    if (result.deletedCount === 0) {
      console.error('Usuário não encontrado para exclusão:', targetId);
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Erro na rota /delete-user:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para listar níveis e preços
app.get('/cardprices', async (req, res) => {
  try {
    const user = verifyJWT(req, res);
    if (!user) return;
    const db = await connectToDB();
    console.log('Buscando níveis na coleção loganccs.cardprices');
    const prices = await db.collection('cardprices').find().toArray();
    res.json(prices);
  } catch (error) {
    console.error('Erro na rota /cardprices:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para adicionar nível
app.post('/cardprices', async (req, res) => {
  try {
    const user = verifyJWT(req, res);
    if (!user) return;
    const { nivel, price, paymentLink } = req.body;
    if (!nivel || !price || !paymentLink) {
      console.error('Dados incompletos na rota /cardprices:', req.body);
      return res.status(400).json({ success: false, error: 'Nível, preço e link de pagamento são obrigatórios' });
    }
    const db = await connectToDB();
    console.log('Adicionando nível:', nivel);
    const result = await db.collection('cardprices').insertOne({ nivel, price: parseFloat(price), paymentLink });
    res.json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error('Erro na rota /cardprices (POST):', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para atualizar nível
app.put('/cardprices', async (req, res) => {
  try {
    const user = verifyJWT(req, res);
    if (!user) return;
    const { nivel, price, paymentLink } = req.body;
    if (!nivel || !price || !paymentLink) {
      console.error('Dados incompletos na rota /cardprices (PUT):', req.body);
      return res.status(400).json({ success: false, error: 'Nível, preço e link de pagamento são obrigatórios' });
    }
    const db = await connectToDB();
    console.log('Atualizando nível:', nivel);
    const result = await db.collection('cardprices').updateOne(
      { nivel },
      { $set: { price: parseFloat(price), paymentLink } }
    );
    if (result.matchedCount === 0) {
      console.error('Nível não encontrado:', nivel);
      return res.status(404).json({ success: false, error: 'Nível não encontrado' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Erro na rota /cardprices (PUT):', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para excluir nível
app.delete('/cardprices', async (req, res) => {
  try {
    const user = verifyJWT(req, res);
    if (!user) return;
    const { nivel } = req.body;
    if (!nivel) {
      console.error('Nível não fornecido na rota /cardprices (DELETE)');
      return res.status(400).json({ success: false, error: 'Nível é obrigatório' });
    }
    const db = await connectToDB();
    console.log('Excluindo nível:', nivel);
    const result = await db.collection('cardprices').deleteOne({ nivel });
    if (result.deletedCount === 0) {
      console.error('Nível não encontrado:', nivel);
      return res.status(404).json({ success: false, error: 'Nível não encontrado' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Erro na rota /cardprices (DELETE):', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para listar cartões
app.get('/cards', async (req, res) => {
  try {
    const user = verifyJWT(req, res);
    if (!user) return;
    const db = await connectToDB();
    console.log('Buscando cartões na coleção loganccs.cards');
    const cards = await db.collection('cards').find().toArray();
    res.json(cards);
  } catch (error) {
    console.error('Erro na rota /cards:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para adicionar cartão
app.post('/cards', async (req, res) => {
  try {
    const user = verifyJWT(req, res);
    if (!user) return;
    const { bank, brand, level, cardNumber, cvv, expiryMonth, expiryYear } = req.body;
    if (!bank || !brand || !level || !cardNumber || !cvv || !expiryMonth || !expiryYear) {
      console.error('Dados incompletos na rota /cards:', req.body);
      return res.status(400).json({ success: false, error: 'Todos os campos do cartão são obrigatórios' });
    }
    const db = await connectToDB();
    console.log('Adicionando cartão:', cardNumber);
    const result = await db.collection('cards').insertOne({ bank, brand, level, cardNumber, cvv, expiryMonth, expiryYear });
    res.json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error('Erro na rota /cards (POST):', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para excluir cartão
app.delete('/cards', async (req, res) => {
  try {
    const user = verifyJWT(req, res);
    if (!user) return;
    const { cardNumber } = req.body;
    if (!cardNumber) {
      console.error('Número do cartão não fornecido na rota /cards (DELETE)');
      return res.status(400).json({ success: false, error: 'Número do cartão é obrigatório' });
    }
    const db = await connectToDB();
    console.log('Excluindo cartão:', cardNumber);
    const result = await db.collection('cards').deleteOne({ cardNumber });
    if (result.deletedCount === 0) {
      console.error('Cartão não encontrado:', cardNumber);
      return res.status(404).json({ success: false, error: 'Cartão não encontrado' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Erro na rota /cards (DELETE):', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports.handler = serverless(app);
