const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.handler = async (event, context) => {
  const { httpMethod, path, body, headers } = event;
  const uri = process.env.MONGODB_URI;
  const secret = process.env.JWT_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;

  let client;
  try {
    client = new MongoClient(uri);
    await client.connect();
    const db = client.db('loganccs');

    if (path === '/api/register' && httpMethod === 'POST') {
      const { username, password, isAdmin, adminPassword: providedAdminPassword } = JSON.parse(body);
      if (!username || !password || username.length < 3 || password.length < 6) {
        return { statusCode: 400, body: JSON.stringify({ error: '❌ Usuário deve ter no mínimo 3 caracteres e senha 6 caracteres' }) };
      }
      const existingUser = await db.collection('users').findOne({ username });
      if (existingUser) {
        return { statusCode: 400, body: JSON.stringify({ error: '❌ Usuário já existe' }) };
      }
      const user = { username, password, isAdmin: isAdmin && providedAdminPassword === adminPassword };
      await db.collection('users').insertOne(user);
      const token = jwt.sign({ username, isAdmin: user.isAdmin }, secret, { expiresIn: '1h' });
      return { statusCode: 200, body: JSON.stringify({ token, isAdmin: user.isAdmin }) };
    }

    if (path === '/api/login' && httpMethod === 'POST') {
      const { username, password } = JSON.parse(body);
      if (!username || !password) {
        return { statusCode: 400, body: JSON.stringify({ error: '❌ Usuário e senha são obrigatórios' }) };
      }
      const user = await db.collection('users').findOne({ username, password });
      if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: '❌ Credenciais inválidas' }) };
      }
      const token = jwt.sign({ username, isAdmin: user.isAdmin }, secret, { expiresIn: '1h' });
      return { statusCode: 200, body: JSON.stringify({ token, isAdmin: user.isAdmin }) };
    }

    if (path === '/api/users' && httpMethod === 'GET') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      const decoded = jwt.verify(token, secret);
      if (!decoded.isAdmin) return { statusCode: 403, body: JSON.stringify({ error: '❌ Acesso negado' }) };
      const users = await db.collection('users').find({}).toArray();
      return { statusCode: 200, body: JSON.stringify(users) };
    }

    if (path === '/api/delete-user' && httpMethod === 'POST') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      const decoded = jwt.verify(token, secret);
      if (!decoded.isAdmin) return { statusCode: 403, body: JSON.stringify({ error: '❌ Acesso negado' }) };
      const { username } = JSON.parse(body);
      await db.collection('users').deleteOne({ username });
      return { statusCode: 200, body: JSON.stringify({ message: '✅ Usuário deletado' }) };
    }

    if (path === '/api/banks' && httpMethod === 'GET') {
      const banks = await db.collection('banks').find({}).toArray();
      return { statusCode: 200, body: JSON.stringify(banks) };
    }

    if (path === '/api/cards' && httpMethod === 'GET') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      jwt.verify(token, secret);
      const cards = await db.collection('cards').find({}).toArray();
      return { statusCode: 200, body: JSON.stringify(cards) };
    }

    if (path === '/api/cards' && httpMethod === 'POST') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      const decoded = jwt.verify(token, secret);
      if (!decoded.isAdmin) return { statusCode: 403, body: JSON.stringify({ error: '❌ Acesso negado' }) };
      const card = JSON.parse(body);
      await db.collection('cards').insertOne(card);
      return { statusCode: 200, body: JSON.stringify({ message: '✅ Cartão adicionado' }) };
    }

    if (path === '/api/cardprices' && httpMethod === 'GET') {
      const prices = await db.collection('cardprices').find({}).toArray();
      return { statusCode: 200, body: JSON.stringify(prices) };
    }

    if (path === '/api/cardprices' && httpMethod === 'POST') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      const decoded = jwt.verify(token, secret);
      if (!decoded.isAdmin) return { statusCode: 403, body: JSON.stringify({ error: '❌ Acesso negado' }) };
      const price = JSON.parse(body);
      await db.collection('cardprices').insertOne(price);
      return { statusCode: 200, body: JSON.stringify({ message: '✅ Preço adicionado' }) };
    }

    if (path === '/api/purchase' && httpMethod === 'POST') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      const decoded = jwt.verify(token, secret);
      const { cardNumber, level } = JSON.parse(body);
      const card = await db.collection('cards').findOne({ cardNumber });
      if (!card) return { statusCode: 404, body: JSON.stringify({ error: '❌ Cartão não encontrado' }) };
      await db.collection('purchases').insertOne({
        user: decoded.username,
        card,
        purchasedAt: new Date(),
      });
      const price = await db.collection('cardprices').findOne({ nivel: level });
      return { statusCode: 200, body: JSON.stringify({ paymentLink: price?.paymentLink || 'https://example.com/pay' }) };
    }

    if (path === '/api/purchases' && httpMethod === 'GET') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      const decoded = jwt.verify(token, secret);
      const purchases = await db.collection('purchases').find({ user: decoded.username }).toArray();
      return { statusCode: 200, body: JSON.stringify(purchases) };
    }

    return { statusCode: 404, body: JSON.stringify({ error: '❌ Rota não encontrada' }) };
  } catch (error) {
    console.error('Erro no servidor:', error);
    return { statusCode: 500, body: JSON.stringify({ error: '❌ Erro interno do servidor' }) };
  } finally {
    if (client) await client.close();
  }
};
