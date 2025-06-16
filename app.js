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
          const registerData = JSON.parse(body || '{}');
          const registerUsername = registerData.username;
          const registerPassword = registerData.password;
          console.log('Tentando registro:', { username: registerUsername });
          if (!registerUsername || !registerPassword) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Username e senha são obrigatórios' }) };
          }
          const existingUser = await users.findOne({ username: registerUsername.toLowerCase() });
          if (existingUser) {
            console.warn('Username já registrado:', registerUsername);
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Username já registrado' }) };
          }
          const newUser = {
            _id: generateId(),
            username: registerUsername.toLowerCase(),
            password: registerPassword,
            balance: 1000.00,
            is_admin: false,
            created_at: new Date()
          };
          await users.insertOne(newUser);
          console.log('Usuário registrado:', newUser._id);
          return { statusCode: 200, headers, body: JSON.stringify({ userId: newUser._id, username: newUser.username }) };

        case '/api/login':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
          const loginData = JSON.parse(body || '{}');
          const loginUsername = loginData.username;
          const loginPassword = loginData.password;
          console.log('Tentando login:', { username: loginUsername });
          const user = await users.findOne({ username: loginUsername.toLowerCase() });
          if (!user || user.password !== loginPassword) {
            console.warn('Login falhou:', loginUsername);
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Usuário ou senha incorretos' }) };
          }
          console.log('Login bem-sucedido:', user._id);
          return { statusCode: 200, headers, body: JSON.stringify({ userId: user._id, username: user.username }) };

        case '/api/balance':
          if (httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Método não permitido' };
          const balanceUserId = queryStringParameters.userId;
          console.log('Consultando saldo:', balanceUserId);
          const balanceUser = await users.findOne({ _id: balanceUserId });
          if (!balanceUser) return { statusCode: 404, headers, body: 'Usuário não encontrado' };
          return { statusCode: 200, headers, body: JSON.stringify({ balance: balanceUser.balance }) };

        case '/api/cards':
          if (httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Método não permitido' };
          console.log('Listando cartões disponíveis');
          const availableCards = await cards.find({ acquired: false }).toArray();
          return { statusCode: 200, headers, body: JSON.stringify(availableCards) };

        case '/api/buy':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
          const buyData = JSON.parse(body || '{}');
          const buyUserId = buyData.userId;
          const buyCardId = buyData.cardId;
          const buyPrice = buyData.price;
          console.log('Tentando compra:', { userId: buyUserId, cardId: buyCardId, price: buyPrice });
          const session = mongoClient.startSession();
          try {
            await session.withTransaction(async () => {
              const buyUser = await users.findOne({ _id: buyUserId }, { session });
              if (!buyUser) throw new Error('Usuário não encontrado');
              if (buyUser.balance < buyPrice) throw new Error('Saldo insuficiente');
              const card = await cards.findOne({ _id: buyCardId }, { session });
              if (!card || card.acquired) throw new Error('Cartão indisponível');
              await users.updateOne({ _id: buyUserId }, { $inc: { balance: -buyPrice } }, { session });
              await cards.updateOne({ _id: buyCardId }, { $set: { acquired: true, user_id: buyUserId } }, { session });
              const transactionId = generateId();
              await transactions.insertOne({
                _id: transactionId,
                user_id: buyUserId,
                type: 'purchase',
                amount: -buyPrice,
                description: `Compra de cartão ${buyCardId.slice(-4)}`,
                timestamp: new Date()
              }, { session });
            });
            const updatedUser = await users.findOne({ _id: buyUserId });
            console.log('Compra concluída:', { userId: buyUserId, newBalance: updatedUser.balance });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, newBalance: updatedUser.balance }) };
          } catch (err) {
            console.error('Erro na compra:', err.message);
            throw err;
          } finally {
            await session.endSession();
          }

        case '/api/deposit':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
          const depositData = JSON.parse(body || '{}');
          const depositUserId = depositData.userId;
          const depositAmount = depositData.amount;
          console.log('Tentando depósito:', { userId: depositUserId, amount: depositAmount });
          if (depositAmount <= 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valor inválido' }) };
          const depositSession = mongoClient.startSession();
          try {
            await depositSession.withTransaction(async () => {
              const depositUser = await users.findOne({ _id: depositUserId }, { session: depositSession });
              if (!depositUser) throw new Error('Usuário não encontrado');
              await users.updateOne({ _id: depositUserId }, { $inc: { balance: depositAmount } }, { session: depositSession });
              const transactionId = generateId();
              await transactions.insertOne({
                _id: transactionId,
                user_id: depositUserId,
                type: 'deposit',
                amount: depositAmount,
                description: `Depósito de R$ ${depositAmount.toFixed(2)}`,
                timestamp: new Date()
              }, { session: depositSession });
            });
            const updatedUser = await users.findOne({ _id: depositUserId });
            console.log('Depósito concluído:', { userId: depositUserId, newBalance: updatedUser.balance });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, newBalance: updatedUser.balance }) };
          } catch (err) {
            console.error('Erro no depósito:', err.message);
            throw err;
          } finally {
            await depositSession.endSession();
          }

        case '/api/transactions':
          if (httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Método não permitido' };
          const transactionUserId = queryStringParameters.userId;
          console.log('Listando transações:', transactionUserId);
          const userTransactions = await transactions.find({ user_id: transactionUserId }).sort({ timestamp: -1 }).toArray();
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
