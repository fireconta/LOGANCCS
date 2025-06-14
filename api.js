const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const OneSignal = require('onesignal-node');
require('dotenv').config();

const client = new OneSignal.Client(process.env.ONESIGNAL_APP_ID, process.env.ONESIGNAL_API_KEY);
const mongoClient = new MongoClient('mongodb+srv://loganccs_admin:V8JCm5teHVQEGFxw@loganccs-cluster.hlc6mov.mongodb.net/loganccs?retryWrites=true&w=majority');

let db;
let isInitialized = false;

async function initializeDatabase() {
  if (isInitialized) return;
  try {
    await mongoClient.connect();
    db = mongoClient.db('loganccs');

    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    if (!collectionNames.includes('users')) {
      await db.createCollection('users');
      await db.collection('users').createIndex({ username: 1 }, { unique: true });
      await db.collection('users').insertOne({
        _id: '1',
        username: 'LVz',
        password: '123456', // ATENÇÃO: Em produção, usar bcrypt
        balance: 1000.00,
        is_admin: true,
        created_at: new Date(),
        push_token: null
      });
      console.log('Coleção users criada e usuário inicial inserido.');
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
      console.log('Coleção cards criada e cartão inicial inserido.');
    }

    if (!collectionNames.includes('transactions')) {
      await db.createCollection('transactions');
      await db.collection('transactions').createIndex({ user_id: 1, timestamp: -1 });
      console.log('Coleção transactions criada.');
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

exports.handler = async (event, context) => {
  const { httpMethod, path, queryStringParameters, body } = event;
  try {
    const db = await connectDB();
    const users = db.collection('users');
    const cards = db.collection('cards');
    const transactions = db.collection('transactions');

    const headers = {
      'Access-Control-Allow-Origin': 'https://loganccs.netlify.app',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    switch (path) {
      case '/api/login':
        if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
        const { username, password } = JSON.parse(body);
        const user = await users.findOne({ username });
        if (!user || user.password !== password) {
          return { statusCode: 401, headers, body: JSON.stringify({ error: 'Usuário ou senha incorretos' }) };
        }
        return { statusCode: 200, headers, body: JSON.stringify({ userId: user._id, username: user.username }) };

      case '/api/balance':
        if (httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Método não permitido' };
        const { userId } = queryStringParameters;
        const balanceUser = await users.findOne({ _id: userId });
        if (!balanceUser) return { statusCode: 404, headers, body: 'Usuário não encontrado' };
        return { statusCode: 200, headers, body: JSON.stringify({ balance: balanceUser.balance }) };

      case '/api/cards':
        if (httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Método não permitido' };
        const availableCards = await cards.find({ acquired: false }).toArray();
        return { statusCode: 200, headers, body: JSON.stringify(availableCards) };

      case '/api/buy':
        if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
        const { userId, cardId, price } = JSON.parse(body);
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
            const transactionId = uuidv4();
            await transactions.insertOne({
              _id: transactionId,
              user_id: userId,
              type: 'purchase',
              amount: -price,
              description: `Compra de cartão ${cardId.slice(-4)}`,
              timestamp: new Date()
            }, { session });
            if (buyUser.push_token) {
              const notification = {
                contents: { en: `Cartão comprado por R$ ${price.toFixed(2)}!` },
                include_player_ids: [buyUser.push_token]
              };
              await client.createNotification(notification);
            }
          });
          const updatedUser = await users.findOne({ _id: userId });
          return { statusCode: 200, headers, body: JSON.stringify({ success: true, newBalance: updatedUser.balance }) };
        } catch (err) {
          throw err;
        } finally {
          await session.endSession();
        }

      case '/api/deposit':
        if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
        const { userId, amount } = JSON.parse(body);
        if (amount <= 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valor inválido' }) };
        const depositSession = mongoClient.startSession();
        try {
          await depositSession.withTransaction(async () => {
            const depositUser = await users.findOne({ _id: userId }, { session: depositSession });
            if (!depositUser) throw new Error('Usuário não encontrado');
            await users.updateOne({ _id: userId }, { $inc: { balance: amount } }, { session: depositSession });
            const transactionId = uuidv4();
            await transactions.insertOne({
              _id: transactionId,
              user_id: userId,
              type: 'deposit',
              amount,
              description: `Depósito de R$ ${amount.toFixed(2)}`,
              timestamp: new Date()
            }, { session: depositSession });
            if (depositUser.push_token) {
              const notification = {
                contents: { en: `Depósito de R$ ${amount.toFixed(2)} realizado!` },
                include_player_ids: [depositUser.push_token]
              };
              await client.createNotification(notification);
            }
          });
          const updatedUser = await users.findOne({ _id: userId });
          return { statusCode: 200, headers, body: JSON.stringify({ success: true, newBalance: updatedUser.balance }) };
        } catch (err) {
          throw err;
        } finally {
          await depositSession.endSession();
        }

      case '/api/transactions':
        if (httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Método não permitido' };
        const { userId } = queryStringParameters;
        const userTransactions = await transactions.find({ user_id: userId }).sort({ timestamp: -1 }).toArray();
        return { statusCode: 200, headers, body: JSON.stringify(userTransactions) };

      case '/api/register-push':
        if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
        const { userId, token } = JSON.parse(body);
        await users.updateOne({ _id: userId }, { $set: { push_token: token } });
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

      default:
        return { statusCode: 404, headers, body: 'Rota não encontrada' };
    }
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': 'https://loganccs.netlify.app' },
      body: JSON.stringify({ error: err.message || 'Erro interno' })
    };
  }
};
