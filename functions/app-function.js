const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.handler = async function(event, context) {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  const db = client.db('loganccs');
  const path = event.path.replace('/.netlify/functions/app-function', '');
  const tokenSecret = 'your_jwt_secret'; // Substituir por segredo seguro

  try {
    await client.connect();

    // Registro
    if (path === '/register' && event.httpMethod === 'POST') {
      const { username, password } = JSON.parse(event.body);
      if (!username || !password) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Usuário e senha são obrigatórios' }) };
      }
      const existingUser = await db.collection('users').findOne({ username });
      if (existingUser) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Usuário já existe' }) };
      }
      await db.collection('users').insertOne({
        username,
        password, // Em produção, usar bcrypt para hash
        balance: 0,
        isAdmin: false
      });
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    // Login
    if (path === '/login' && event.httpMethod === 'POST') {
      const { username, password } = JSON.parse(event.body);
      const user = await db.collection('users').findOne({ username, password });
      if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Credenciais inválidas' }) };
      }
      const token = jwt.sign({ userId: user._id }, tokenSecret, { expiresIn: '1h' });
      return { statusCode: 200, body: JSON.stringify({ token }) };
    }

    // Verificar autenticação
    if (path === '/check-auth' && event.httpMethod === 'GET') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, body: JSON.stringify({ authenticated: false }) };
      }
      try {
        const decoded = jwt.verify(token, tokenSecret);
        const user = await db.collection('users').findOne({ _id: decoded.userId });
        if (!user) {
          return { statusCode: 401, body: JSON.stringify({ authenticated: false }) };
        }
        return {
          statusCode: 200,
          body: JSON.stringify({ authenticated: true, user: { _id: user._id, username: user.username, balance: user.balance, isAdmin: user.isAdmin } })
        };
      } catch (error) {
        return { statusCode: 401, body: JSON.stringify({ authenticated: false }) };
      }
    }

    // Listar cartões
    if (path === '/cards' && event.httpMethod === 'GET') {
      const cards = await db.collection('cards').find({}).toArray();
      return { statusCode: 200, body: JSON.stringify(cards) };
    }

    // Adicionar cartão
    if (path === '/cards' && event.httpMethod === 'POST') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: decoded.userId });
      if (!user || !user.isAdmin) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { bank, brand, level, cardNumber, cvv, expiryMonth, expiryYear } = JSON.parse(event.body);
      if (!bank || !brand || !level || !cardNumber || !cvv || !expiryMonth || !expiryYear) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Todos os campos são obrigatórios' }) };
      }
      const existingCard = await db.collection('cards').findOne({ cardNumber });
      if (existingCard) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Cartão já existe' }) };
      }
      await db.collection('cards').insertOne({
        bank,
        brand,
        level,
        cardNumber,
        cvv,
        expiryMonth: String(expiryMonth).padStart(2, '0'),
        expiryYear: String(expiryYear)
      });
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    // Remover cartão
    if (path === '/cards' && event.httpMethod === 'DELETE') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: decoded.userId });
      if (!user || !user.isAdmin) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { cardNumber } = JSON.parse(event.body);
      const result = await db.collection('cards').deleteOne({ cardNumber });
      if (result.deletedCount === 0) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Cartão não encontrado' }) };
      }
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    // Listar preços
    if (path === '/cardprices' && event.httpMethod === 'GET') {
      const prices = await db.collection('cardprices').find({}).toArray();
      return { statusCode: 200, body: JSON.stringify(prices) };
    }

    // Atualizar preço ou link de pagamento
    if (path === '/cardprices' && event.httpMethod === 'PUT') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: decoded.userId });
      if (!user || !user.isAdmin) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { nivel, price, paymentLink } = JSON.parse(event.body);
      if (!nivel) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Nível é obrigatório' }) };
      }
      const updateFields = {};
      if (price !== undefined) updateFields.price = price;
      if (paymentLink !== undefined) updateFields.paymentLink = paymentLink;
      const result = await db.collection('cardprices').updateOne(
        { nivel },
        { $set: updateFields },
        { upsert: true }
      );
      if (result.modifiedCount === 0 && result.upsertedCount === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Nenhum preço ou link atualizado' }) };
      }
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    // Processar compra
    if (path === '/purchase' && event.httpMethod === 'POST') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: decoded.userId });
      if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
      }
      const { cardNumber, level } = JSON.parse(event.body);
      const card = await db.collection('cards').findOne({ cardNumber: { $regex: `${cardNumber}$` }, level });
      if (!card) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Cartão não encontrado' }) };
      }
      const price = await db.collection('cardprices').findOne({ nivel: level });
      if (!price) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Nível de cartão inválido' }) };
      }
      if (user.balance < price.price) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Saldo insuficiente' }) };
      }
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { balance: user.balance - price.price } }
      );
      await db.collection('purchases').insertOne({
        userId: user._id,
        card: {
          cardNumber: card.cardNumber,
          bank: card.bank,
          brand: card.brand,
          level: card.level,
          cvv: card.cvv,
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear
        },
        purchasedAt: new Date()
      });
      await db.collection('cards').deleteOne({ cardNumber: card.cardNumber });
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    // Listar compras
    if (path === '/purchases' && event.httpMethod === 'GET') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const purchases = await db.collection('purchases').find({ userId: decoded.userId }).toArray();
      return { statusCode: 200, body: JSON.stringify(purchases) };
    }

    // Listar usuários (admin)
    if (path === '/users' && event.httpMethod === 'GET') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: decoded.userId });
      if (!user || !user.isAdmin) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const users = await db.collection('users').find({}).toArray();
      return { statusCode: 200, body: JSON.stringify(users) };
    }

    // Atualizar usuário (admin)
    if (path === '/users' && event.httpMethod === 'PUT') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const admin = await db.collection('users').findOne({ _id: decoded.userId });
      if (!admin || !admin.isAdmin) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { userId, balance, isAdmin } = JSON.parse(event.body);
      const updateFields = {};
      if (balance !== undefined) updateFields.balance = balance;
      if (isAdmin !== undefined) updateFields.isAdmin = isAdmin;
      const result = await db.collection('users').updateOne(
        { _id: userId },
        { $set: updateFields }
      );
      if (result.modifiedCount === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Nenhum usuário atualizado' }) };
      }
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, body: JSON.stringify({ error: 'Rota não encontrada' }) };
  } catch (error) {
    console.error('Erro no servidor:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno do servidor' }) };
  } finally {
    await client.close();
  }
};
