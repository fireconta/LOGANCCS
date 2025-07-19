const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Joi = require('joi');

let client;
let db;

async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI, { useUnifiedTopology: true });
    await client.connect();
    db = client.db('loganccs');
    // Criar índices para otimização
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('cards').createIndex({ cardNumber: 1 }, { unique: true });
    await db.collection('purchases').createIndex({ user: 1, purchasedAt: -1 });
  }
  return db;
}

const schemas = {
  register: Joi.object({
    username: Joi.string().alphanum().min(3).required(),
    password: Joi.string().min(6).pattern(/[A-Z]/).pattern(/[0-9]/).required(),
    isAdmin: Joi.boolean().default(false),
    adminPassword: Joi.string().allow('').optional()
  }),
  login: Joi.object({
    username: Joi.string().alphanum().min(3).required(),
    password: Joi.string().min(6).required()
  }),
  card: Joi.object({
    cardNumber: Joi.string().length(16).pattern(/^\d+$/).required(),
    bank: Joi.string().min(1).required(),
    brand: Joi.string().valid('Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard').required(),
    level: Joi.string().min(1).required(),
    expiryMonth: Joi.number().integer().min(1).max(12).required(),
    expiryYear: Joi.number().integer().min(2025).required(),
    cvv: Joi.string().pattern(/^\d+$/).min(3).max(4).required()
  }),
  price: Joi.object({
    nivel: Joi.string().min(1).required(),
    price: Joi.number().positive().required(),
    paymentLink: Joi.string().uri().required()
  }),
  purchase: Joi.object({
    cardNumber: Joi.string().length(16).pattern(/^\d+$/).required(),
    level: Joi.string().min(1).required()
  }),
  deleteUser: Joi.object({
    username: Joi.string().alphanum().min(3).required()
  })
};

function encryptCardData(data, secret) {
  const cipher = crypto.createCipher('aes-256-cbc', secret);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decryptCardData(encrypted, secret) {
  try {
    const decipher = crypto.createDecipher('aes-256-cbc', secret);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    throw new Error('Erro ao descriptografar dados');
  }
}

function luhnCheck(cardNumber) {
  let sum = 0;
  let isEven = false;
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cardNumber[i]);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
}

exports.handler = async (event, context) => {
  const { httpMethod, path, body, headers, queryStringParameters } = event;
  const secret = process.env.JWT_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const encryptionSecret = process.env.ENCRYPTION_SECRET;

  try {
    await connectToMongo();

    if (path === '/.netlify/functions/register' && httpMethod === 'POST') {
      const data = JSON.parse(body);
      const { error } = schemas.register.validate(data);
      if (error) return { statusCode: 400, body: JSON.stringify({ error: error.details[0].message }) };

      const { username, password, isAdmin, adminPassword: providedAdminPassword } = data;
      const existingUser = await db.collection('users').findOne({ username });
      if (existingUser) return { statusCode: 400, body: JSON.stringify({ error: '❌ Usuário já existe' }) };

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = { username, password: hashedPassword, isAdmin: isAdmin && providedAdminPassword === adminPassword };
      await db.collection('users').insertOne(user);
      const token = jwt.sign({ username, isAdmin: user.isAdmin }, secret, { expiresIn: '1h' });
      return {
        statusCode: 200,
        headers: { 'Set-Cookie': `token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict` },
        body: JSON.stringify({ token, isAdmin: user.isAdmin })
      };
    }

    if (path === '/.netlify/functions/login' && httpMethod === 'POST') {
      const data = JSON.parse(body);
      const { error } = schemas.login.validate(data);
      if (error) return { statusCode: 400, body: JSON.stringify({ error: error.details[0].message }) };

      const { username, password } = data;
      const user = await db.collection('users').findOne({ username });
      if (!user || !await bcrypt.compare(password, user.password)) {
        return { statusCode: 401, body: JSON.stringify({ error: '❌ Credenciais inválidas' }) };
      }
      const token = jwt.sign({ username, isAdmin: user.isAdmin }, secret, { expiresIn: '1h' });
      return {
        statusCode: 200,
        headers: { 'Set-Cookie': `token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict` },
        body: JSON.stringify({ token, isAdmin: user.isAdmin })
      };
    }

    if (path === '/.netlify/functions/users' && httpMethod === 'GET') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      const decoded = jwt.verify(token, secret);
      if (!decoded.isAdmin) return { statusCode: 403, body: JSON.stringify({ error: '❌ Acesso negado' }) };
      const users = await db.collection('users').find({}, { projection: { password: 0 } }).toArray();
      return { statusCode: 200, body: JSON.stringify(users) };
    }

    if (path === '/.netlify/functions/delete-user' && httpMethod === 'POST') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      const decoded = jwt.verify(token, secret);
      if (!decoded.isAdmin) return { statusCode: 403, body: JSON.stringify({ error: '❌ Acesso negado' }) };
      const data = JSON.parse(body);
      const { error } = schemas.deleteUser.validate(data);
      if (error) return { statusCode: 400, body: JSON.stringify({ error: error.details[0].message }) };
      const { username } = data;
      const result = await db.collection('users').deleteOne({ username });
      if (result.deletedCount === 0) return { statusCode: 404, body: JSON.stringify({ error: '❌ Usuário não encontrado' }) };
      return { statusCode: 200, body: JSON.stringify({ message: '✅ Usuário deletado' }) };
    }

    if (path === '/.netlify/functions/banks' && httpMethod === 'GET') {
      const banks = await db.collection('banks').find({}).toArray();
      return { statusCode: 200, body: JSON.stringify(banks) };
    }

    if (path === '/.netlify/functions/cards' && httpMethod === 'GET') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      jwt.verify(token, secret);
      const page = parseInt(queryStringParameters?.page) || 1;
      const limit = parseInt(queryStringParameters?.limit) || 10;
      const skip = (page - 1) * limit;
      const cards = await db.collection('cards').find({}).skip(skip).limit(limit).toArray();
      const decryptedCards = cards.map(card => ({
        ...card,
        cardNumber: decryptCardData(card.cardNumber, encryptionSecret),
        cvv: decryptCardData(card.cvv, encryptionSecret)
      }));
      return { statusCode: 200, body: JSON.stringify(decryptedCards) };
    }

    if (path === '/.netlify/functions/cards' && httpMethod === 'POST') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      const decoded = jwt.verify(token, secret);
      if (!decoded.isAdmin) return { statusCode: 403, body: JSON.stringify({ error: '❌ Acesso negado' }) };
      const data = JSON.parse(body);
      const { error } = schemas.card.validate(data);
      if (error) return { statusCode: 400, body: JSON.stringify({ error: error.details[0].message }) };
      if (!luhnCheck(data.cardNumber)) return { statusCode: 400, body: JSON.stringify({ error: '❌ Número de cartão inválido (Luhn)' }) };
      const card = {
        ...data,
        cardNumber: encryptCardData(data.cardNumber, encryptionSecret),
        cvv: encryptCardData(data.cvv, encryptionSecret)
      };
      await db.collection('cards').insertOne(card);
      return { statusCode: 200, body: JSON.stringify({ message: '✅ Cartão adicionado' }) };
    }

    if (path === '/.netlify/functions/cardprices' && httpMethod === 'GET') {
      const page = parseInt(queryStringParameters?.page) || 1;
      const limit = parseInt(queryStringParameters?.limit) || 10;
      const skip = (page - 1) * limit;
      const prices = await db.collection('cardprices').find({}).skip(skip).limit(limit).toArray();
      return { statusCode: 200, body: JSON.stringify(prices) };
    }

    if (path === '/.netlify/functions/cardprices' && httpMethod === 'POST') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      const decoded = jwt.verify(token, secret);
      if (!decoded.isAdmin) return { statusCode: 403, body: JSON.stringify({ error: '❌ Acesso negado' }) };
      const data = JSON.parse(body);
      const { error } = schemas.price.validate(data);
      if (error) return { statusCode: 400, body: JSON.stringify({ error: error.details[0].message }) };
      await db.collection('cardprices').insertOne(data);
      return { statusCode: 200, body: JSON.stringify({ message: '✅ Preço adicionado' }) };
    }

    if (path === '/.netlify/functions/purchase' && httpMethod === 'POST') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      const decoded = jwt.verify(token, secret);
      const data = JSON.parse(body);
      const { error } = schemas.purchase.validate(data);
      if (error) return { statusCode: 400, body: JSON.stringify({ error: error.details[0].message }) };
      const { cardNumber, level } = data;
      const card = await db.collection('cards').findOne({ cardNumber: encryptCardData(cardNumber, encryptionSecret) });
      if (!card) return { statusCode: 404, body: JSON.stringify({ error: '❌ Cartão não encontrado' }) };
      const price = await db.collection('cardprices').findOne({ nivel: level });
      if (!price) return { statusCode: 404, body: JSON.stringify({ error: '❌ Preço não encontrado' }) };
      await db.collection('purchases').insertOne({
        user: decoded.username,
        card,
        purchasedAt: new Date(),
      });
      return { statusCode: 200, body: JSON.stringify({ paymentLink: price.paymentLink }) };
    }

    if (path === '/.netlify/functions/purchases' && httpMethod === 'GET') {
      const token = headers.authorization?.split(' ')[1];
      if (!token) return { statusCode: 401, body: JSON.stringify({ error: '❌ Token não fornecido' }) };
      const decoded = jwt.verify(token, secret);
      const page = parseInt(queryStringParameters?.page) || 1;
      const limit = parseInt(queryStringParameters?.limit) || 10;
      const skip = (page - 1) * limit;
      const purchases = await db.collection('purchases').find({ user: decoded.username }).skip(skip).limit(limit).toArray();
      const decryptedPurchases = purchases.map(purchase => ({
        ...purchase,
        card: {
          ...purchase.card,
          cardNumber: decryptCardData(purchase.card.cardNumber, encryptionSecret),
          cvv: decryptCardData(purchase.card.cvv, encryptionSecret)
        }
      }));
      return { statusCode: 200, body: JSON.stringify(decryptedPurchases) };
    }

    return { statusCode: 404, body: JSON.stringify({ error: '❌ Rota não encontrada' }) };
  } catch (error) {
    console.error('Erro no servidor:', error);
    return { statusCode: 500, body: JSON.stringify({ error: '❌ Erro interno do servidor' }) };
  }
};
