const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const crypto = require('crypto');

let client = null;
let db = null;

const schemas = {
  login: Joi.object({
    username: Joi.string().alphanum().min(3).required(),
    password: Joi.string().min(6).pattern(/[A-Z]/).pattern(/[0-9]/).required()
  }),
  register: Joi.object({
    username: Joi.string().alphanum().min(3).required(),
    password: Joi.string().min(6).pattern(/[A-Z]/).pattern(/[0-9]/).required()
  }),
  card: Joi.object({
    cardNumber: Joi.string().creditCard().required(),
    cardHolder: Joi.string().min(2).required(),
    expiry: Joi.string().pattern(/^(0[1-9]|1[0-2])\/[0-9]{2}$/).required(),
    cvv: Joi.string().pattern(/^[0-9]{3,4}$/).required()
  }),
  purchase: Joi.object({
    cardId: Joi.string().required(),
    amount: Joi.number().positive().required()
  })
};

async function connectToMongo() {
  if (db) return db;
  try {
    client = new MongoClient(process.env.MONGODB_URI, { useUnifiedTopology: true });
    await client.connect();
    db = client.db('logancss');
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('cards').createIndex({ cardNumber: 1 }, { unique: true });
    console.log('Conectado ao MongoDB');
    return db;
  } catch (error) {
    console.error('Erro ao conectar ao MongoDB:', error);
    throw error;
  }
}

function encryptCardData(cardData, secret) {
  const cipher = crypto.createCipher('aes-256-cbc', secret);
  let encrypted = cipher.update(JSON.stringify(cardData), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decryptCardData(encryptedData, secret) {
  const decipher = crypto.createDecipher('aes-256-cbc', secret);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

exports.handler = async (event, context) => {
  const { httpMethod, path, body, headers, queryStringParameters } = event;
  const secret = process.env.JWT_SECRET;
  const encryptionSecret = process.env.ENCRYPTION_SECRET;

  try {
    await connectToMongo();

    // Verificar conexão com MongoDB e listar coleções
    if (path === '/api/app-function/check-db' && httpMethod === 'GET') {
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(col => col.name);
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: 'Conectado ao MongoDB',
          collections: collectionNames
        })
      };
    }

    // Login
    if (path === '/api/app-function/login' && httpMethod === 'POST') {
      const data = JSON.parse(body);
      const { error } = schemas.login.validate(data);
      if (error) return { statusCode: 400, body: JSON.stringify({ error: error.details[0].message }) };

      const { username, password } = data;
      const user = await db.collection('users').findOne({ username });
      if (!user || !await bcrypt.compare(password, user.password)) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Credenciais inválidas' }) };
      }
      const token = jwt.sign({ username, isAdmin: user.isAdmin }, secret, { expiresIn: '1h' });
      return {
        statusCode: 200,
        body: JSON.stringify({ token, isAdmin: user.isAdmin })
      };
    }

    // Registro
    if (path === '/api/app-function/register' && httpMethod === 'POST') {
      const data = JSON.parse(body);
      const { error } = schemas.register.validate(data);
      if (error) return { statusCode: 400, body: JSON.stringify({ error: error.details[0].message }) };

      const { username, password } = data;
      const existingUser = await db.collection('users').findOne({ username });
      if (existingUser) return { statusCode: 400, body: JSON.stringify({ error: 'Usuário já existe' }) };

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = { username, password: hashedPassword, isAdmin: false }; // Sempre false
      await db.collection('users').insertOne(user);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Registro bem-sucedido' })
      };
    }

    // Listar usuários (apenas admin)
    if (path === '/api/app-function/users' && httpMethod === 'GET') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Token não fornecido' }) };

      let decoded;
      try {
        decoded = jwt.verify(token, secret);
      } catch (error) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido' }) };
      }

      if (!decoded.isAdmin) return { statusCode: 403, body: JSON.stringify({ error: 'Acesso negado' }) };

      const users = await db.collection('users').find({}, { projection: { password: 0 } }).toArray();
      return { statusCode: 200, body: JSON.stringify(users) };
    }

    // Adicionar cartão
    if (path === '/api/app-function/cards' && httpMethod === 'POST') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Token não fornecido' }) };

      let decoded;
      try {
        decoded = jwt.verify(token, secret);
      } catch (error) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido' }) };
      }

      const data = JSON.parse(body);
      const { error } = schemas.card.validate(data);
      if (error) return { statusCode: 400, body: JSON.stringify({ error: error.details[0].message }) };

      const { cardNumber, cardHolder, expiry, cvv } = data;
      const encryptedCard = encryptCardData({ cardNumber, cardHolder, expiry, cvv }, encryptionSecret);
      const card = {
        user: decoded.username,
        encryptedCard,
        createdAt: new Date()
      };
      await db.collection('cards').insertOne(card);
      return { statusCode: 200, body: JSON.stringify({ message: 'Cartão adicionado com sucesso' }) };
    }

    // Listar cartões do usuário
    if (path === '/api/app-function/cards' && httpMethod === 'GET') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Token não fornecido' }) };

      let decoded;
      try {
        decoded = jwt.verify(token, secret);
      } catch (error) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido' }) };
      }

      const cards = await db.collection('cards').find({ user: decoded.username }).toArray();
      const decryptedCards = cards.map(card => ({
        ...card,
        cardData: decryptCardData(card.encryptedCard, encryptionSecret)
      }));
      return { statusCode: 200, body: JSON.stringify(decryptedCards) };
    }

    // Processar compra
    if (path === '/api/app-function/purchases' && httpMethod === 'POST') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Token não fornecido' }) };

      let decoded;
      try {
        decoded = jwt.verify(token, secret);
      } catch (error) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido' }) };
      }

      const data = JSON.parse(body);
      const { error } = schemas.purchase.validate(data);
      if (error) return { statusCode: 400, body: JSON.stringify({ error: error.details[0].message }) };

      const { cardId, amount } = data;
      const card = await db.collection('cards').findOne({ _id: require('mongodb').ObjectId(cardId), user: decoded.username });
      if (!card) return { statusCode: 404, body: JSON.stringify({ error: 'Cartão não encontrado' }) };

      const purchase = {
        user: decoded.username,
        cardId,
        amount,
        createdAt: new Date(),
        status: 'completed'
      };
      await db.collection('purchases').insertOne(purchase);
      return { statusCode: 200, body: JSON.stringify({ message: 'Compra processada com sucesso' }) };
    }

    // Listar compras do usuário
    if (path === '/api/app-function/purchases' && httpMethod === 'GET') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Token não fornecido' }) };

      let decoded;
      try {
        decoded = jwt.verify(token, secret);
      } catch (error) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido' }) };
      }

      const purchases = await db.collection('purchases').find({ user: decoded.username }).toArray();
      return { statusCode: 200, body: JSON.stringify(purchases) };
    }

    return { statusCode: 404, body: JSON.stringify({ error: 'Rota não encontrada' }) };
  } catch (error) {
    console.error('Erro no servidor:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno do servidor' }) };
  }
};
