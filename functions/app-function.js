const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

exports.handler = async function(event, context) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Erro: MONGODB_URI não está definido');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Configuração do servidor incompleta: MONGODB_URI não definido' })
    };
  }

  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = client.db('loganccs');
  const path = event.path.replace('/.netlify/functions/app-function', '');
  const tokenSecret = process.env.JWT_SECRET || 'your_jwt_secret';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  try {
    await client.connect();

    // Verificar ambiente
    if (path === '/check-env' && event.httpMethod === 'GET') {
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          mongodbConnected: true,
          collections: {
            users: collectionNames.includes('users'),
            cards: collectionNames.includes('cards'),
            cardprices: collectionNames.includes('cardprices'),
            purchases: collectionNames.includes('purchases')
          },
          environment: {
            MONGODB_URI: !!process.env.MONGODB_URI,
            JWT_SECRET: !!process.env.JWT_SECRET
          }
        })
      };
    }

    // Listar bancos
    if (path === '/banks' && event.httpMethod === 'GET') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.log('Tentativa de acesso à rota /banks sem token');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      try {
        const decoded = jwt.verify(token, tokenSecret);
        const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
        if (!user || !user.isAdmin) {
          console.log(`Acesso negado à rota /banks para usuário: ${user?.username || 'desconhecido'}`);
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
        }
        const banks = await db.collection('banks').find({}).toArray();
        console.log(`Bancos listados: ${banks.length} encontrados`);
        return { statusCode: 200, headers, body: JSON.stringify(banks) };
      } catch (error) {
        console.error('Erro ao listar bancos:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: `Erro ao listar bancos: ${error.message}` }) };
      }
    }

    // Registro
    if (path === '/register' && event.httpMethod === 'POST') {
      const { username, password } = JSON.parse(event.body);
      if (!username || !password || username.length < 3 || password.length < 6 || !/^[a-zA-Z0-9]+$/.test(username)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Usuário (mín. 3 caracteres, alfanumérico) e senha (mín. 6 caracteres) são obrigatórios' }) };
      }
      const existingUser = await db.collection('users').findOne({ username });
      if (existingUser) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Usuário já existe' }) };
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const isAdmin = username === 'LVz' && password === process.env.ADMIN_PASSWORD;
      await db.collection('users').insertOne({
        username,
        password: hashedPassword,
        balance: 1000,
        isAdmin,
        createdAt: new Date()
      });
      console.log(`Usuário registrado: ${username}, isAdmin: ${isAdmin}`);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Usuário registrado com sucesso' }) };
    }

    // Login
    if (path === '/login' && event.httpMethod === 'POST') {
      const { username, password } = JSON.parse(event.body);
      if (!username || !password) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Usuário e senha são obrigatórios' }) };
      }
      const user = await db.collection('users').findOne({ username });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        console.log(`Tentativa de login falhou para usuário: ${username}`);
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Credenciais inválidas' }) };
      }
      const token = jwt.sign({ userId: user._id.toString() }, tokenSecret, { expiresIn: '1h' });
      console.log(`Login bem-sucedido para usuário: ${username}`);
      return { statusCode: 200, headers, body: JSON.stringify({ token, username: user.username, isAdmin: user.isAdmin }) };
    }

    // Verificar autenticação
    if (path === '/check-auth' && event.httpMethod === 'GET') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ authenticated: false, error: 'Token não fornecido' }) };
      }
      try {
        const decoded = jwt.verify(token, tokenSecret);
        const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
        if (!user) {
          return { statusCode: 401, headers, body: JSON.stringify({ authenticated: false, error: 'Usuário não encontrado' }) };
        }
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ authenticated: true, user: { _id: user._id, username: user.username, balance: user.balance, isAdmin: user.isAdmin } })
        };
      } catch (error) {
        return { statusCode: 401, headers, body: JSON.stringify({ authenticated: false, error: 'Token inválido' }) };
      }
    }

    // Listar cartões
    if (path === '/cards' && event.httpMethod === 'GET') {
      const cards = await db.collection('cards').find({}).toArray();
      return { statusCode: 200, headers, body: JSON.stringify(cards) };
    }

    // Adicionar cartão
    if (path === '/cards' && event.httpMethod === 'POST') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!user || !user.isAdmin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { bank, brand, level, cardNumber, cvv, expiryMonth, expiryYear } = JSON.parse(event.body);
      if (!bank || !brand || !level || !cardNumber || !cvv || !expiryMonth || !expiryYear) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Todos os campos são obrigatórios' }) };
      }
      const existingCard = await db.collection('cards').findOne({ cardNumber });
      if (existingCard) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cartão já existe' }) };
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
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Remover cartão
    if (path === '/cards' && event.httpMethod === 'DELETE') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!user || !user.isAdmin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { cardNumber } = JSON.parse(event.body);
      const result = await db.collection('cards').deleteOne({ cardNumber });
      if (result.deletedCount === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cartão não encontrado' }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Listar preços
    if (path === '/cardprices' && event.httpMethod === 'GET') {
      const prices = await db.collection('cardprices').find({}).toArray();
      return { statusCode: 200, headers, body: JSON.stringify(prices) };
    }

    // Atualizar preço ou link de pagamento
    if (path === '/cardprices' && event.httpMethod === 'PUT') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!user || !user.isAdmin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { nivel, price, paymentLink } = JSON.parse(event.body);
      if (!nivel) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nível é obrigatório' }) };
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
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nenhum preço ou link atualizado' }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Processar compra
    if (path === '/purchase' && event.httpMethod === 'POST') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
      }
      const { cardNumber, level } = JSON.parse(event.body);
      const card = await db.collection('cards').findOne({ cardNumber: { $regex: `${cardNumber}$` }, level });
      if (!card) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cartão não encontrado' }) };
      }
      const price = await db.collection('cardprices').findOne({ nivel: level });
      if (!price) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nível de cartão inválido' }) };
      }
      if (user.balance < price.price) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Saldo insuficiente' }) };
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
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, paymentLink: price.paymentLink }) };
    }

    // Listar compras
    if (path === '/purchases' && event.httpMethod === 'GET') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const purchases = await db.collection('purchases').find({ userId: new ObjectId(decoded.userId) }).toArray();
      return { statusCode: 200, headers, body: JSON.stringify(purchases) };
    }

    // Listar usuários (admin)
    if (path === '/users' && event.httpMethod === 'GET') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!user || !user.isAdmin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const users = await db.collection('users').find({}, { projection: { password: 0 } }).toArray();
      return { statusCode: 200, headers, body: JSON.stringify(users) };
    }

    // Atualizar usuário (admin)
    if (path === '/users' && event.httpMethod === 'PUT') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const admin = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!admin || !admin.isAdmin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { userId, balance, isAdmin } = JSON.parse(event.body);
      const updateFields = {};
      if (balance !== undefined) updateFields.balance = balance;
      if (isAdmin !== undefined) updateFields.isAdmin = isAdmin;
      const result = await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { $set: updateFields }
      );
      if (result.modifiedCount === 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nenhum usuário atualizado' }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Excluir usuário (admin)
    if (path === '/delete-user' && event.httpMethod === 'DELETE') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const admin = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!admin || !admin.isAdmin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { targetId } = JSON.parse(event.body);
      const target = await db.collection('users').findOne({ _id: new ObjectId(targetId) });
      if (!target) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
      }
      if (target.username === 'LVz') {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não é possível excluir o administrador principal' }) };
      }
      await db.collection('users').deleteOne({ _id: new ObjectId(targetId) });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Rota não encontrada' }) };
  } catch (error) {
    console.error('Erro no servidor:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Erro interno do servidor: ${error.message}` }) };
  } finally {
    await client.close();
  }
};
