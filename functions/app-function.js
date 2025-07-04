const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

let db;

async function connectToDB() {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Erro: MONGODB_URI não está definido');
    throw new Error('Configuração do servidor incompleta: MONGODB_URI não definido');
  }
  try {
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    console.log('Conexão com MongoDB Atlas estabelecida');
    db = client.db('loganccs');
    return db;
  } catch (error) {
    console.error('Erro ao conectar ao MongoDB:', error.message);
    throw error;
  }
}

exports.handler = async function(event, context) {
  const path = event.path.replace('/.netlify/functions/app-function', '');
  const tokenSecret = process.env.JWT_SECRET || 'your_jwt_secret';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  try {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] Recebida requisição ${event.httpMethod} ${path}`);

    const db = await connectToDB();

    // Verificar ambiente
    if (path === '/check-env' && event.httpMethod === 'GET') {
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      console.log('Coleções disponíveis:', collectionNames);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          mongodbConnected: true,
          collections: {
            users: collectionNames.includes('users'),
            cards: collectionNames.includes('cards'),
            cardprices: collectionNames.includes('cardprices'),
            purchases: collectionNames.includes('purchases'),
            banks: collectionNames.includes('banks')
          },
          environment: {
            MONGODB_URI: !!process.env.MONGODB_URI,
            JWT_SECRET: !!process.env.JWT_SECRET
          }
        })
      };
    }

    // Registro
    if (path === '/register' && event.httpMethod === 'POST') {
      const { username, password } = JSON.parse(event.body);
      if (!username || !password || username.length < 3 || password.length < 6 || !/^[a-zA-Z0-9]+$/.test(username)) {
        console.error('Dados inválidos na rota /register:', { username, password });
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Usuário (mín. 3 caracteres, alfanumérico) e senha (mín. 6 caracteres) são obrigatórios' }) };
      }
      const existingUser = await db.collection('users').findOne({ username });
      if (existingUser) {
        console.error('Usuário já existe:', username);
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Usuário já existe' }) };
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const isAdmin = username === 'LVz' && password === process.env.ADMIN_PASSWORD;
      const result = await db.collection('users').insertOne({
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
        console.error('Dados incompletos na rota /login:', { username, password });
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Usuário e senha são obrigatórios' }) };
      }
      const user = await db.collection('users').findOne({ username });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        console.error(`Tentativa de login falhou para usuário: ${username}`);
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Credenciais inválidas' }) };
      }
      const token = jwt.sign({ userId: user._id.toString(), username: user.username, isAdmin: user.isAdmin }, tokenSecret, { expiresIn: '1h' });
      console.log(`Login bem-sucedido para usuário: ${username}`);
      return { statusCode: 200, headers, body: JSON.stringify({ token, username: user.username, isAdmin: user.isAdmin }) };
    }

    // Verificar autenticação
    if (path === '/check-auth' && event.httpMethod === 'GET') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.error('Token não fornecido na rota /check-auth');
        return { statusCode: 401, headers, body: JSON.stringify({ authenticated: false, error: 'Token não fornecido' }) };
      }
      try {
        const decoded = jwt.verify(token, tokenSecret);
        const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
        if (!user) {
          console.error('Usuário não encontrado para token:', decoded.userId);
          return { statusCode: 401, headers, body: JSON.stringify({ authenticated: false, error: 'Usuário não encontrado' }) };
        }
        console.log(`Autenticação bem-sucedida para usuário: ${user.username}`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ authenticated: true, user: { _id: user._id, username: user.username, balance: user.balance, isAdmin: user.isAdmin } })
        };
      } catch (error) {
        console.error('Erro ao verificar token na rota /check-auth:', error.message);
        return { statusCode: 401, headers, body: JSON.stringify({ authenticated: false, error: 'Token inválido' }) };
      }
    }

    // Listar bancos
    if (path === '/banks' && event.httpMethod === 'GET') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.error('Token não fornecido na rota /banks');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      try {
        const decoded = jwt.verify(token, tokenSecret);
        const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
        if (!user || !user.isAdmin) {
          console.error('Acesso negado na rota /banks:', { userId: decoded.userId, isAdmin: user?.isAdmin });
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
        }
        console.log('Buscando bancos na coleção loganccs.banks');
        const banks = await db.collection('banks').find().toArray();
        if (!Array.isArray(banks)) {
          console.error('Resposta da coleção banks não é um array:', banks);
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro nos dados de bancos: formato inválido' }) };
        }
        console.log(`Bancos encontrados: ${banks.length}`);
        return { statusCode: 200, headers, body: JSON.stringify(banks) };
      } catch (error) {
        console.error('Erro na rota /banks:', error.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
      }
    }

    // Listar cartões
    if (path === '/cards' && event.httpMethod === 'GET') {
      console.log('Buscando cartões na coleção loganccs.cards');
      const cards = await db.collection('cards').find({}).toArray();
      return { statusCode: 200, headers, body: JSON.stringify(cards) };
    }

    // Adicionar cartão
    if (path === '/cards' && event.httpMethod === 'POST') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.error('Token não fornecido na rota /cards (POST)');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!user || !user.isAdmin) {
        console.error('Acesso negado na rota /cards (POST):', { userId: decoded.userId, isAdmin: user?.isAdmin });
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { bank, brand, level, cardNumber, cvv, expiryMonth, expiryYear } = JSON.parse(event.body);
      if (!bank || !brand || !level || !cardNumber || !cvv || !expiryMonth || !expiryYear) {
        console.error('Dados incompletos na rota /cards (POST):', { bank, brand, level, cardNumber, cvv, expiryMonth, expiryYear });
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Todos os campos são obrigatórios' }) };
      }
      const existingCard = await db.collection('cards').findOne({ cardNumber });
      if (existingCard) {
        console.error('Cartão já existe:', cardNumber);
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
      console.log('Cartão adicionado:', cardNumber);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Remover cartão
    if (path === '/cards' && event.httpMethod === 'DELETE') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.error('Token não fornecido na rota /cards (DELETE)');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!user || !user.isAdmin) {
        console.error('Acesso negado na rota /cards (DELETE):', { userId: decoded.userId, isAdmin: user?.isAdmin });
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { cardNumber } = JSON.parse(event.body);
      const result = await db.collection('cards').deleteOne({ cardNumber });
      if (result.deletedCount === 0) {
        console.error('Cartão não encontrado:', cardNumber);
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cartão não encontrado' }) };
      }
      console.log('Cartão removido:', cardNumber);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Listar preços
    if (path === '/cardprices' && event.httpMethod === 'GET') {
      console.log('Buscando preços na coleção loganccs.cardprices');
      const prices = await db.collection('cardprices').find({}).toArray();
      return { statusCode: 200, headers, body: JSON.stringify(prices) };
    }

    // Atualizar preço ou link de pagamento
    if (path === '/cardprices' && event.httpMethod === 'PUT') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.error('Token não fornecido na rota /cardprices (PUT)');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!user || !user.isAdmin) {
        console.error('Acesso negado na rota /cardprices (PUT):', { userId: decoded.userId, isAdmin: user?.isAdmin });
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { nivel, price, paymentLink } = JSON.parse(event.body);
      if (!nivel) {
        console.error('Nível não fornecido na rota /cardprices (PUT):', { nivel, price, paymentLink });
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nível é obrigatório' }) };
      }
      const updateFields = {};
      if (price !== undefined) updateFields.price = parseFloat(price);
      if (paymentLink !== undefined) updateFields.paymentLink = paymentLink;
      const result = await db.collection('cardprices').updateOne(
        { nivel },
        { $set: updateFields },
        { upsert: true }
      );
      if (result.modifiedCount === 0 && result.upsertedCount === 0) {
        console.error('Nenhum preço ou link atualizado para nível:', nivel);
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nenhum preço ou link atualizado' }) };
      }
      console.log('Preço/link atualizado para nível:', nivel);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Processar compra
    if (path === '/purchase' && event.httpMethod === 'POST') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.error('Token não fornecido na rota /purchase');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!user) {
        console.error('Usuário não encontrado na rota /purchase:', decoded.userId);
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
      }
      const { cardNumber, level } = JSON.parse(event.body);
      const card = await db.collection('cards').findOne({ cardNumber: { $regex: `${cardNumber}$` }, level });
      if (!card) {
        console.error('Cartão não encontrado na rota /purchase:', { cardNumber, level });
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cartão não encontrado' }) };
      }
      const price = await db.collection('cardprices').findOne({ nivel: level });
      if (!price) {
        console.error('Nível de cartão inválido na rota /purchase:', level);
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nível de cartão inválido' }) };
      }
      if (user.balance < price.price) {
        console.error('Saldo insuficiente na rota /purchase:', { userId: user._id, balance: user.balance, price: price.price });
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
      console.log('Compra processada:', { userId: user._id, cardNumber });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, paymentLink: price.paymentLink }) };
    }

    // Listar compras
    if (path === '/purchases' && event.httpMethod === 'GET') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.error('Token não fornecido na rota /purchases');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      console.log('Buscando compras para usuário:', decoded.userId);
      const purchases = await db.collection('purchases').find({ userId: new ObjectId(decoded.userId) }).toArray();
      return { statusCode: 200, headers, body: JSON.stringify(purchases) };
    }

    // Listar cartões disponíveis na loja
    if (path === '/shop' && event.httpMethod === 'GET') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.error('Token não fornecido na rota /shop');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!user) {
        console.error('Usuário não encontrado na rota /shop:', decoded.userId);
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
      }
      console.log('Buscando cartões disponíveis na coleção loganccs.cards');
      const cards = await db.collection('cards').find().toArray();
      const prices = await db.collection('cardprices').find().toArray();
      const priceMap = prices.reduce((map, price) => {
        map[price.nivel] = { price: price.price, paymentLink: price.paymentLink };
        return map;
      }, {});
      const availableCards = cards.map(card => ({
        bank: card.bank,
        brand: card.brand,
        level: card.level,
        price: priceMap[card.level]?.price || 0,
        paymentLink: priceMap[card.level]?.paymentLink || ''
      }));
      console.log(`Cartões disponíveis encontrados: ${availableCards.length}`);
      return { statusCode: 200, headers, body: JSON.stringify(availableCards) };
    }

    // Listar usuários
    if (path === '/users' && event.httpMethod === 'GET') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.error('Token não fornecido na rota /users');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!user || !user.isAdmin) {
        console.error('Acesso negado na rota /users:', { userId: decoded.userId, isAdmin: user?.isAdmin });
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      console.log('Buscando usuários na coleção loganccs.users');
      const users = await db.collection('users').find({}, { projection: { password: 0 } }).toArray();
      return { statusCode: 200, headers, body: JSON.stringify(users) };
    }

    // Atualizar usuário
    if (path === '/users' && event.httpMethod === 'PUT') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.error('Token não fornecido na rota /users (PUT)');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const admin = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!admin || !admin.isAdmin) {
        console.error('Acesso negado na rota /users (PUT):', { userId: decoded.userId, isAdmin: admin?.isAdmin });
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { userId, balance, isAdmin } = JSON.parse(event.body);
      if (!userId) {
        console.error('ID do usuário não fornecido na rota /users (PUT)');
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'ID do usuário é obrigatório' }) };
      }
      const updateFields = {};
      if (balance !== undefined) updateFields.balance = parseFloat(balance);
      if (isAdmin !== undefined) updateFields.isAdmin = isAdmin;
      const result = await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { $set: updateFields }
      );
      if (result.modifiedCount === 0) {
        console.error('Nenhum usuário atualizado:', userId);
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nenhum usuário atualizado' }) };
      }
      console.log('Usuário atualizado:', userId);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Excluir usuário
    if (path === '/delete-user' && event.httpMethod === 'DELETE') {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        console.error('Token não fornecido na rota /delete-user');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
      }
      const decoded = jwt.verify(token, tokenSecret);
      const admin = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
      if (!admin || !admin.isAdmin) {
        console.error('Acesso negado na rota /delete-user:', { userId: decoded.userId, isAdmin: admin?.isAdmin });
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
      }
      const { targetId } = JSON.parse(event.body);
      if (!targetId) {
        console.error('ID do usuário não fornecido na rota /delete-user');
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'ID do usuário é obrigatório' }) };
      }
      const target = await db.collection('users').findOne({ _id: new ObjectId(targetId) });
      if (!target) {
        console.error('Usuário não encontrado para exclusão:', targetId);
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
      }
      if (target.username === 'LVz') {
        console.error('Tentativa de excluir administrador principal:', targetId);
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Não é possível excluir o administrador principal' }) };
      }
      await db.collection('users').deleteOne({ _id: new ObjectId(targetId) });
      console.log('Usuário excluído:', targetId);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    console.error(`Rota não encontrada: ${event.httpMethod} ${path}`);
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Rota não encontrada' }) };
  } catch (error) {
    console.error('Erro no servidor:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Erro interno do servidor: ${error.message}` }) };
  } finally {
    console.log(`Tempo de execução: ${Date.now() - startTime}ms`);
  }
};
