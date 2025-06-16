if (typeof window === 'undefined') {
  // Backend (Node.js, Netlify Function)
  const { MongoClient } = require('mongodb');

  const mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb+srv://loganccs_admin:V8JCm5teHVQEGFxw@loganccs-cluster.hlc6mov.mongodb.net/loganccs?retryWrites=true&w=majority');

  let db;
  let isInitialized = false;

  async function initializeDatabase() {
    if (isInitialized) return;
    console.log('Inicializando banco de dados...');
    try {
      await mongoClient.connect();
      db = mongoClient.db('loganccs');
      console.log('Conexão com MongoDB estabelecida');

      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);

      if (!collectionNames.includes('users')) {
        await db.createCollection('users');
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        await db.collection('users').insertOne({
          _id: '1',
          username: 'LVz',
          password: '123456',
          balance: 1000.00,
          is_admin: true,
          created_at: new Date()
        });
        console.log('Coleção users criada e usuário inicial inserido');
      }

      if (!collectionNames.includes('cards')) {
        await db.createCollection('cards');
        await db.collection('cards').createIndex({ acquired: 1 });
        await db.collection('cards').insertOne({
          _id: '1',
          numero: '4532015112830366',
          cvv: '123',
          expiry: '12/27',
          name: 'João Silva',
          cpf: '12345678901',
          bandeira: 'Visa',
          banco: 'Nubank',
          nivel: 'Platinum',
          price: 25.00,
          bin: '453201',
          acquired: false,
          user_id: null,
          created_at: new Date()
        });
        console.log('Coleção cards criada e cartão inicial inserido');
      }

      if (!collectionNames.includes('transactions')) {
        await db.createCollection('transactions');
        await db.collection('transactions').createIndex({ user_id: 1, timestamp: -1 });
        console.log('Coleção transactions criada');
      }

      isInitialized = true;
    } catch (err) {
      console.error('Erro ao inicializar banco:', err);
      throw err;
    }
  }

  async function connectDB() {
    if (!db) {
      await initializeDatabase();
    }
    return db;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  exports.handler = async (event, context) => {
    console.log('Função app invocada:', { httpMethod: event.httpMethod, path: event.path });
    const { httpMethod, path, queryStringParameters, body } = event;
    try {
      const db = await connectDB();
      const users = db.collection('users');
      const cards = db.collection('cards');
      const transactions = db.collection('transactions');

      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      };

      if (httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
      }

      switch (path) {
        case '/api/register':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
          const { username, password } = JSON.parse(body || '{}');
          console.log('Tentando registro:', { username });
          if (!username || !password) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Username e senha são obrigatórios' }) };
          }
          const existingUser = await users.findOne({ username: username.toLowerCase() });
          if (existingUser) {
            console.warn('Username já registrado:', username);
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Username já registrado' }) };
          }
          const newUser = {
            _id: generateId(),
            username: username.toLowerCase(),
            password,
            balance: 1000.00,
            is_admin: false,
            created_at: new Date()
          };
          await users.insertOne(newUser);
          console.log('Usuário registrado:', newUser._id);
          return { statusCode: 200, headers, body: JSON.stringify({ userId: newUser._id, username: newUser.username }) };

        case '/api/login':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
          const { username, password } = JSON.parse(body || '{}');
          console.log('Tentando login:', { username });
          const user = await users.findOne({ username: username.toLowerCase() });
          if (!user || user.password !== password) {
            console.warn('Login falhou:', username);
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Usuário ou senha incorretos' }) };
          }
          console.log('Login bem-sucedido:', user._id);
          return { statusCode: 200, headers, body: JSON.stringify({ userId: user._id, username: user.username }) };

        case '/api/balance':
          if (httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Método não permitido' };
          const { userId } = queryStringParameters;
          console.log('Consultando saldo:', userId);
          const balanceUser = await users.findOne({ _id: userId });
          if (!balanceUser) return { statusCode: 404, headers, body: 'Usuário não encontrado' };
          return { statusCode: 200, headers, body: JSON.stringify({ balance: balanceUser.balance }) };

        case '/api/cards':
          if (httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Método não permitido' };
          console.log('Listando cartões disponíveis');
          const availableCards = await cards.find({ acquired: false }).toArray();
          return { statusCode: 200, headers, body: JSON.stringify(availableCards) };

        case '/api/buy':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
          const { userId, cardId, price } = JSON.parse(body || '{}');
          console.log('Tentando compra:', { userId, cardId, price });
          const session = mongoClient.startSession();
          try {
            await session.withTransaction(async () => {
              const buyUser = await users.findOne({ _id: userId }, { session });
              if (!buyUser) throw new Error('Usuário não encontrado');
              if (buyUser.balance < price) throw new Error('Saldo insuficiente');
              const card = await cards.findOne({ _id: cardId }, { session });
              if (!card || card.acquired) throw new Error('Cartão indisponível');
              await users.updateOne({ _id: userId }, { $inc: { balance: -price } }, { session });
              await cards.updateOne({ _id: cardId }, { $set: { acquired: true, user_id: userId } }, { session });
              const transactionId = generateId();
              await transactions.insertOne({
                _id: transactionId,
                user_id: userId,
                type: 'purchase',
                amount: -price,
                description: `Compra de cartão ${cardId.slice(-4)}`,
                timestamp: new Date()
              }, { session });
            });
            const updatedUser = await users.findOne({ _id: userId });
            console.log('Compra concluída:', { userId, newBalance: updatedUser.balance });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, newBalance: updatedUser.balance }) };
          } catch (err) {
            console.error('Erro na compra:', err.message);
            throw err;
          } finally {
            await session.endSession();
          }

        case '/api/deposit':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
          const { userId, amount } = JSON.parse(body || '{}');
          console.log('Tentando depósito:', { userId, amount });
          if (amount <= 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valor inválido' }) };
          const depositSession = mongoClient.startSession();
          try {
            await depositSession.withTransaction(async () => {
              const depositUser = await users.findOne({ _id: userId }, { session: depositSession });
              if (!depositUser) throw new Error('Usuário não encontrado');
              await users.updateOne({ _id: userId }, { $inc: { balance: amount } }, { session: depositSession });
              const transactionId = generateId();
              await transactions.insertOne({
                _id: transactionId,
                user_id: userId,
                type: 'deposit',
                amount,
                description: `Depósito de R$ ${amount.toFixed(2)}`,
                timestamp: new Date()
              }, { session: depositSession });
            });
            const updatedUser = await users.findOne({ _id: userId });
            console.log('Depósito concluído:', { userId, newBalance: updatedUser.balance });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, newBalance: updatedUser.balance }) };
          } catch (err) {
            console.error('Erro no depósito:', err.message);
            throw err;
          } finally {
            await depositSession.endSession();
          }

        case '/api/transactions':
          if (httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Método não permitido' };
          const { userId } = queryStringParameters;
          console.log('Listando transações:', userId);
          const userTransactions = await transactions.find({ user_id: userId }).sort({ timestamp: -1 }).toArray();
          return { statusCode: 200, headers, body: JSON.stringify(userTransactions) };

        default:
          console.warn('Rota não encontrada:', path);
          return { statusCode: 404, headers, body: 'Rota não encontrada' };
      }
    } catch (err) {
      console.error('Erro no handler:', err);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: err.message || 'Erro interno' })
      };
    }
  };
} else {
  // Frontend (Browser)
  window.formatCurrency = function(value) {
    return `R$ ${value.toFixed(2)}`;
  };

  window.showNotification = function(title, body) {
    console.log(`Notificação: ${title} - ${body}`);
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, { body });
        }
      });
    }
  };

  console.log('app.js carregado no frontend');
}
