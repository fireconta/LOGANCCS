if (typeof window === 'undefined') {
  if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
  }
  const { MongoClient } = require('mongodb');
  const bcrypt = require('bcryptjs');

  const mongoClient = new MongoClient(process.env.MONGODB_URI);

  let db;
  let isInitialized = false;

  async function initializeDatabase() {
    if (isInitialized) return;
    console.log('Inicializando banco de dados...');
    try {
      await mongoClient.connect();
      db = mongoClient.db('Loganccs');
      console.log('Conexão com MongoDB estabelecida ao banco Loganccs');

      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      console.log('Coleções existentes:', collectionNames);

      if (!collectionNames.includes('users')) {
        await db.createCollection('users');
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        await db.collection('users').insertOne({
          _id: '1',
          username: 'LVz',
          password: await bcrypt.hash('123456', 10),
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

      if (!collectionNames.includes('levels')) {
        await db.createCollection('levels');
        await db.collection('levels').createIndex({ level: 1 }, { unique: true });
        await db.collection('levels').insertMany([
          { level: 'Classic', price: 10.00 },
          { level: 'Gold', price: 20.00 },
          { level: 'Platinum', price: 25.00 },
          { level: 'Black', price: 50.00 }
        ]);
        console.log('Coleção levels criada com níveis padrão');
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
      const levels = db.collection('levels');

      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      };

      if (httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
      }

      switch (path) {
        case '/api/register':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
          const registerBody = JSON.parse(body || '{}');
          console.log('Tentando registro:', { username: registerBody.username });
          if (!registerBody.username || !registerBody.password) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Username e senha são obrigatórios' }) };
          }
          if (!registerBody.username.match(/^[a-zA-Z0-9]{3,}$/)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Usuário deve ter pelo menos 3 caracteres alfanuméricos' }) };
          }
          if (registerBody.password.length < 4) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Senha deve ter pelo menos 4 caracteres' }) };
          }
          const existingUser = await users.findOne({ username: registerBody.username.toLowerCase() });
          if (existingUser) {
            console.warn('Username já registrado:', registerBody.username);
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Username já registrado' }) };
          }
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(registerBody.password, salt);
          const newUser = {
            _id: generateId(),
            username: registerBody.username.toLowerCase(),
            password: hashedPassword,
            balance: 0.00,
            is_admin: false,
            created_at: new Date()
          };
          await users.insertOne(newUser);
          console.log('Usuário registrado:', newUser._id);
          return { statusCode: 200, headers, body: JSON.stringify({ userId: newUser._id, username: newUser.username }) };

        case '/api/login':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
          const loginBody = JSON.parse(body || '{}');
          console.log('Login:', loginBody.username);
          const user = await users.findOne({ username: loginBody.username.toLowerCase() });
          if (!user || !(await bcrypt.compare(loginBody.password, user.password))) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Usuário ou senha incorretos' }) };
          }
          console.log('Login bem-sucedido:', user._id);
          return { statusCode: 200, headers, body: JSON.stringify({ userId: user._id, username: user.username, is_admin: user.is_admin }) };

        case '/api/users':
          if (httpMethod === 'GET') {
            if (!queryStringParameters?.userId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId é obrigatório' }) };
            }
            const userInfo = await users.findOne({ _id: queryStringParameters.userId }, { projection: { password: 0 } });
            if (!userInfo) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify(userInfo) };
          } else if (httpMethod === 'PUT') {
            const updateBody = JSON.parse(body || '{}');
            console.log('Atualizando usuário:', updateBody.userId);
            if (!updateBody.userId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId é obrigatório' }) };
            }
            const updateFields = {};
            if (updateBody.balance !== undefined) updateFields.balance = parseFloat(updateBody.balance);
            if (updateBody.is_admin !== undefined) updateFields.is_admin = updateBody.is_admin;
            if (updateBody.password) {
              const salt = await bcrypt.genSalt(10);
              updateFields.password = await bcrypt.hash(updateBody.password, salt);
            }
            const result = await users.updateOne({ _id: updateBody.userId }, { $set: updateFields });
            if (result.matchedCount === 0) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          } else if (httpMethod === 'DELETE') {
            const deleteBody = JSON.parse(body || '{}');
            console.log('Excluindo usuário:', deleteBody.userId);
            if (!deleteBody.userId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId é obrigatório' }) };
            }
            const result = await users.deleteOne({ _id: deleteBody.userId });
            if (result === 0) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          }
          return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

        case '/api/admin/users':
          if (httpMethod === 'GET') {
            console.log('Listando todos os usuários');
            const allUsers = await users.find({}, { projection: { password: 0 } }).toArray();
            return { statusCode: 200, headers, body: JSON.stringify(allUsers) };
          } else if (httpMethod === 'PUT') {
            const updateBody = JSON.parse(body || '{}');
            console.log('Atualizando usuário admin:', updateBody.userId);
            if (!updateBody.userId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId é obrigatório' }) };
            }
            const updateFields = {};
            if (updateBody.balance !== undefined) updateFields.balance = parseFloat(updateBody.balance);
            if (updateBody.is_admin !== undefined) updateFields.is_admin = updateBody.is_admin;
            if (updateBody.password) {
              const salt = await bcrypt.genSalt(10);
              updateFields.password = await bcrypt.hash(updateBody.password, salt);
            }
            const result = await users.updateOne({ _id: updateBody.userId }, { $set: updateFields });
            if (result.matchedCount === 0) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          } else if (httpMethod === 'DELETE') {
            const deleteBody = JSON.parse(body || '{}');
            console.log('Excluindo usuário admin:', deleteBody.userId);
            if (!deleteBody.userId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId é obrigatório' }) };
            }
            const result = await users.deleteOne({ _id: deleteBody.userId });
            if (result.deletedCount === 0) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          }
          return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

        case '/api/cards':
          if (httpMethod === 'GET') {
            console.log('Listando cartões disponíveis');
            let query = { acquired: false };
            if (queryStringParameters?.bandeira) query.bandeira = queryStringParameters.bandeira;
            if (queryStringParameters?.banco) query.banco = queryStringParameters.banco;
            if (queryStringParameters?.nivel) query.nivel = queryStringParameters.nivel;
            if (queryStringParameters?.cardId) query._id = queryStringParameters.cardId;
            const availableCards = await cards.find(query).toArray();
            for (let card of availableCards) {
              const level = await levels.findOne({ level: card.nivel });
              card.price = level ? level.price : 0;
            }
            return { statusCode: 200, headers, body: JSON.stringify(availableCards) };
          } else if (httpMethod === 'POST') {
            const cardBody = JSON.parse(body || '{}');
            console.log('Adicionando cartão:', cardBody);
            if (!cardBody.numero || !cardBody.cvv || !cardBody.expiry || !cardBody.name || !cardBody.cpf || !cardBody.bandeira || !cardBody.banco || !cardBody.nivel) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Todos os campos do cartão são obrigatórios' }) };
            }
            if (!cardBody.numero.match(/^\d{16}$/)) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Número do cartão inválido' }) };
            }
            if (!cardBody.cvv.match(/^\d{3}$/)) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'CVV inválido' }) };
            }
            if (!cardBody.expiry.match(/^\d{2}\/\d{2}$/)) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Validade inválida' }) };
            }
            if (!cardBody.cpf.match(/^\d{11}$/)) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'CPF inválido' }) };
            }
            const level = await levels.findOne({ level: cardBody.nivel });
            if (!level) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nível inválido' }) };
            }
            const newCard = {
              _id: generateId(),
              numero: cardBody.numero,
              cvv: cardBody.cvv,
              expiry: cardBody.expiry,
              name: cardBody.name,
              cpf: cardBody.cpf,
              bandeira: cardBody.bandeira,
              banco: cardBody.banco,
              nivel: cardBody.nivel,
              price: level.price,
              bin: cardBody.numero.substr(0, 6),
              acquired: false,
              user_id: null,
              created_at: new Date()
            };
            await cards.insertOne(newCard);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          } else if (httpMethod === 'PUT') {
            const updateBody = JSON.parse(body || '{}');
            console.log('Atualizando cartão:', updateBody.cardId);
            if (!updateBody.cardId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'cardId é obrigatório' }) };
            }
            const updateFields = {};
            if (updateBody.numero) updateFields.numero = updateBody.numero;
            if (updateBody.cvv) updateFields.cvv = updateBody.cvv;
            if (updateBody.expiry) updateFields.expiry = updateBody.expiry;
            if (updateBody.name) updateFields.name = updateBody.name;
            if (updateBody.cpf) updateFields.cpf = updateBody.cpf;
            if (updateBody.bandeira) updateFields.bandeira = updateBody.bandeira;
            if (updateBody.banco) updateFields.banco = updateBody.banco;
            if (updateBody.nivel) {
              updateFields.nivel = updateBody.nivel;
              const level = await levels.findOne({ level: updateBody.nivel });
              if (!level) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nível inválido' }) };
              }
              updateFields.price = level.price;
            }
            if (updateBody.numero) updateFields.bin = updateBody.numero.substr(0, 6);
            const result = await cards.updateOne({ _id: updateBody.cardId }, { $set: updateFields });
            if (result.matchedCount === 0) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cartão não encontrado' }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          } else if (httpMethod === 'DELETE') {
            const deleteBody = JSON.parse(body || '{}');
            console.log('Excluindo cartão:', deleteBody.cardId);
            if (!deleteBody.cardId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'cardId é obrigatório' }) };
            }
            const result = await cards.deleteOne({ _id: deleteBody.cardId });
            if (result.deletedCount === 0) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cartão não encontrado' }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          }
          return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

        case '/api/admin/cards':
          if (httpMethod === 'GET') {
            console.log('Listando todos os cartões');
            const allCards = await cards.find().toArray();
            for (let card of allCards) {
              const level = await levels.findOne({ level: card.nivel });
              card.price = level ? level.price : 0;
            }
            return { statusCode: 200, headers, body: JSON.stringify(allCards) };
          } else if (httpMethod === 'POST') {
            const cardBody = JSON.parse(body || '{}');
            console.log('Adicionando cartão admin:', cardBody);
            if (!cardBody.numero || !cardBody.cvv || !cardBody.expiry || !cardBody.name || !cardBody.cpf || !cardBody.bandeira || !cardBody.banco || !cardBody.nivel) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Todos os campos do cartão são obrigatórios' }) };
            }
            if (!cardBody.numero.match(/^\d{16}$/)) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Número do cartão inválido' }) };
            }
            if (!cardBody.cvv.match(/^\d{3}$/)) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'CVV inválido' }) };
            }
            if (!cardBody.expiry.match(/^\d{2}\/\d{2}$/)) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Validade inválida' }) };
            }
            if (!cardBody.cpf.match(/^\d{11}$/)) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'CPF inválido' }) };
            }
            const level = await levels.findOne({ level: cardBody.nivel });
            if (!level) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nível inválido' }) };
            }
            const newCard = {
              _id: generateId(),
              numero: cardBody.numero,
              cvv: cardBody.cvv,
              expiry: cardBody.expiry,
              name: cardBody.name,
              cpf: cardBody.cpf,
              bandeira: cardBody.bandeira,
              banco: cardBody.banco,
              nivel: cardBody.nivel,
              price: level.price,
              bin: cardBody.numero.substr(0, 6),
              acquired: false,
              user_id: null,
              created_at: new Date()
            };
            await cards.insertOne(newCard);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          } else if (httpMethod === 'PUT') {
            const updateBody = JSON.parse(body || '{}');
            console.log('Atualizando cartão admin:', updateBody.cardId);
            if (!updateBody.cardId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'cardId é obrigatório' }) };
            }
            const updateFields = {};
            if (updateBody.numero) updateFields.numero = updateBody.numero;
            if (updateBody.cvv) updateFields.cvv = updateBody.cvv;
            if (updateBody.expiry) updateFields.expiry = updateBody.expiry;
            if (updateBody.name) updateFields.name = updateBody.name;
            if (updateBody.cpf) updateFields.cpf = updateBody.cpf;
            if (updateBody.bandeira) updateFields.bandeira = updateBody.bandeira;
            if (updateBody.banco) updateFields.banco = updateBody.banco;
            if (updateBody.nivel) {
              updateFields.nivel = updateBody.nivel;
              const level = await levels.findOne({ level: updateBody.nivel });
              if (!level) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nível inválido' }) };
              }
              updateFields.price = level.price;
            }
            if (updateBody.numero) updateFields.bin = updateBody.numero.substr(0, 6);
            const result = await cards.updateOne({ _id: updateBody.cardId }, { $set: updateFields });
            if (result.matchedCount === 0) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cartão não encontrado' }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          } else if (httpMethod === 'DELETE') {
            const deleteBody = JSON.parse(body || '{}');
            console.log('Excluindo cartão admin:', deleteBody.cardId);
            if (!deleteBody.cardId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'cardId é obrigatório' }) };
            }
            const result = await cards.deleteOne({ _id: deleteBody.cardId });
            if (result.deletedCount === 0) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cartão não encontrado' }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          }
          return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

        case '/api/levels':
          if (httpMethod === 'GET') {
            console.log('Listando níveis');
            const allLevels = await levels.find().toArray();
            return { statusCode: 200, headers, body: JSON.stringify(allLevels) };
          } else if (httpMethod === 'PUT') {
            const levelBody = JSON.parse(body || '{}');
            console.log('Atualizando nível:', levelBody);
            if (!levelBody.level || levelBody.price === undefined) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nível e preço são obrigatórios' }) };
            }
            const price = parseFloat(levelBody.price);
            if (isNaN(price) || price <= 0) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Preço deve ser maior que 0' }) };
            }
            const session = mongoClient.startSession();
            try {
              await session.withTransaction(async () => {
                await levels.updateOne({ level: levelBody.level }, { $set: { price } }, { upsert: true, session });
                await cards.updateMany({ nivel: levelBody.level }, { $set: { price } }, { session });
              });
              console.log('Nível atualizado:', levelBody.level);
              return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
            } finally {
              await session.endSession();
            }
          }
          return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

        case '/api/transactions':
          if (httpMethod === 'POST') {
            const transactionBody = JSON.parse(body || '{}');
            console.log('Processando transação:', { userId: transactionBody.userId, cardId: transactionBody.cardId });
            if (!transactionBody.userId || !transactionBody.cardId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId e cardId são obrigatórios' }) };
            }
            const session = mongoClient.startSession();
            try {
              let newBalance;
              await session.withTransaction(async () => {
                const buyUser = await users.findOne({ _id: transactionBody.userId }, { session });
                if (!buyUser) throw new Error('Usuário não encontrado');
                const card = await cards.findOne({ _id: transactionBody.cardId }, { session });
                if (!card || card.acquired) throw new Error('Cartão indisponível');
                const level = await levels.findOne({ level: card.nivel }, { session });
                if (!level) throw new Error('Nível do cartão inválido');
                if (buyUser.balance < level.price) throw new Error('Saldo insuficiente');
                await users.updateOne({ _id: transactionBody.userId }, { $inc: { balance: -level.price } }, { session });
                await cards.updateOne({ _id: transactionBody.cardId }, { $set: { acquired: true, user_id: transactionBody.userId } }, { session });
                const transactionId = generateId();
                await transactions.insertOne({
                  _id: transactionId,
                  user_id: transactionBody.userId,
                  type: 'purchase',
                  amount: -level.price,
                  description: `Compra de cartão ${card.numero.slice(-4)}`,
                  timestamp: new Date()
                }, { session });
                const updatedUser = await users.findOne({ _id: transactionBody.userId }, { session });
                newBalance = updatedUser.balance;
              });
              console.log('Compra concluída:', { userId: transactionBody.userId, newBalance });
              return { statusCode: 200, headers, body: JSON.stringify({ success: true, newBalance }) };
            } catch (err) {
              console.error('Erro na compra:', err.message);
              return { statusCode: 400, headers, body: JSON.stringify({ error: err.message }) };
            } finally {
              await session.endSession();
            }
          } else if (httpMethod === 'GET') {
            console.log('Listando transações:', queryStringParameters?.userId);
            if (!queryStringParameters?.userId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId é obrigatório' }) };
            }
            const userTransactions = await transactions.find({ user_id: queryStringParameters.userId }).sort({ timestamp: -1 }).toArray();
            return { statusCode: 200, headers, body: JSON.stringify(userTransactions) };
          }
          return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

        case '/api/verify-admin':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
          const verifyBody = JSON.parse(body || '{}');
          console.log('Verificando admin:', { userId: verifyBody.userId });
          if (!verifyBody.userId || !verifyBody.adminPassword) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId e senha de admin são obrigatórios' }) };
          }
          const adminUser = await users.findOne({ _id: verifyBody.userId });
          const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
          if (!adminUser || !adminUser.is_admin || verifyBody.adminPassword !== ADMIN_PASSWORD) {
            console.warn('Falha na verificação de admin:', verifyBody.userId);
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
          }
          console.log('Admin verificado:', adminUser._id);
          return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

        default:
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'Rota não encontrada' }) };
      }
    } catch (err) {
      console.error('Erro no handler:', err);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        },
        body: JSON.stringify({ error: 'Erro interno do servidor', details: err.message })
      };
    }
  };
}
