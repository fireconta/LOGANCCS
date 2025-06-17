if (typeof window === 'undefined') {
  const { MongoClient } = require('mongodb');
  const bcrypt = require('bcryptjs');

  const mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb+srv://loganccs_admin:V8JCm5teHVQEGFxw@loganccs-cluster.hlc6mov.mongodb.net/Loganccs?retryWrites=true&w=majority');

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
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
          const registerBody = JSON.parse(body || '{}');
          console.log('Tentando registro:', { username: registerBody.username });
          if (!registerBody.username || !registerBody.password) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Username e senha são obrigatórios' }) };
          }
          if (!registerBody.username.match(/^[a-zA-Z0-9]{3,}$/)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Username deve ter pelo menos 3 caracteres alfanuméricos' }) };
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
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
          const loginBody = JSON.parse(body || '{}');
          console.log('Tentando login:', { username: loginBody.username });
          if (!loginBody.username || !loginBody.password) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Username e senha são obrigatórios' }) };
          }
          const user = await users.findOne({ username: loginBody.username.toLowerCase() });
          if (!user || !(await bcrypt.compare(loginBody.password, user.password))) {
            console.warn('Login falhou:', loginBody.username);
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Usuário ou senha incorretos' }) };
          }
          console.log('Login bem-sucedido:', user._id);
          return { statusCode: 200, headers, body: JSON.stringify({ userId: user._id, username: user.username, is_admin: user.is_admin }) };

        case '/api/users':
          if (httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Método não permitido' };
          console.log('Consultando usuário:', queryStringParameters.userId);
          if (!queryStringParameters.userId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'UserId é obrigatório' }) };
          }
          const userInfo = await users.findOne({ _id: queryStringParameters.userId });
          if (!userInfo) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
          return { statusCode: 200, headers, body: JSON.stringify({ balance: userInfo.balance, is_admin: userInfo.is_admin, username: userInfo.username }) };

        case '/api/cards':
          if (httpMethod === 'GET') {
            console.log('Listando cartões disponíveis:', queryStringParameters);
            let query = { acquired: false };
            if (queryStringParameters.bandeira) query.bandeira = queryStringParameters.bandeira;
            if (queryStringParameters.banco) query.banco = queryStringParameters.banco;
            if (queryStringParameters.nivel) query.nivel = queryStringParameters.nivel;
            const availableCards = await cards.find(query).toArray();
            const levelPrices = await levels.find().toArray();
            const levelPriceMap = levelPrices.reduce((map, level) => {
              map[level.level] = level.price;
              return map;
            }, {});
            const enrichedCards = availableCards.map(card => ({
              ...card,
              price: levelPriceMap[card.nivel] || card.price
            }));
            return { statusCode: 200, headers, body: JSON.stringify(enrichedCards) };
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
            const levelPrice = await levels.findOne({ level: cardBody.nivel });
            if (!levelPrice) {
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
              price: levelPrice.price,
              bin: cardBody.numero.substr(0, 6),
              acquired: false,
              user_id: null,
              created_at: new Date()
            };
            await cards.insertOne(newCard);
            console.log('Cartão adicionado:', newCard._id);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          }
          return { statusCode: 405, headers, body: 'Método não permitido' };

        case '/api/buy':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
          const buyBody = JSON.parse(body || '{}');
          console.log('Tentando compra:', { userId: buyBody.userId, cardId: buyBody.cardId });
          if (!buyBody.userId || !buyBody.cardId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'UserId e CardId são obrigatórios' }) };
          }
          const session = mongoClient.startSession();
          try {
            let result;
            await session.withTransaction(async () => {
              const buyUser = await users.findOne({ _id: buyBody.userId }, { session });
              if (!buyUser) throw new Error('Usuário não encontrado');
              const card = await cards.findOne({ _id: buyBody.cardId }, { session });
              if (!card || card.acquired) throw new Error('Cartão indisponível');
              const levelPrice = await levels.findOne({ level: card.nivel }, { session });
              if (!levelPrice) throw new Error('Nível inválido');
              if (buyUser.balance < levelPrice.price) throw new Error('Saldo insuficiente');
              await users.updateOne({ _id: buyBody.userId }, { $inc: { balance: -levelPrice.price } }, { session });
              await cards.updateOne({ _id: buyBody.cardId }, { $set: { acquired: true, user_id: buyBody.userId } }, { session });
              const transactionId = generateId();
              await transactions.insertOne({
                _id: transactionId,
                user_id: buyBody.userId,
                type: 'purchase',
                amount: -levelPrice.price,
                description: `Compra de cartão ${buyBody.cardId.slice(-4)}`,
                timestamp: new Date()
              }, { session });
              result = await users.findOne({ _id: buyBody.userId }, { session });
            });
            console.log('Compra concluída:', { userId: buyBody.userId, newBalance: result.balance });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, newBalance: result.balance }) };
          } catch (err) {
            console.error('Erro na compra:', err.message);
            return { statusCode: 400, headers, body: JSON.stringify({ error: err.message }) };
          } finally {
            await session.endSession();
          }

        case '/api/deposit':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
          const depositBody = JSON.parse(body || '{}');
          console.log('Tentando depósito:', { userId: depositBody.userId, amount: depositBody.amount });
          if (!depositBody.userId || !depositBody.amount || depositBody.amount <= 0) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'UserId e valor válido são obrigatórios' }) };
          }
          const depositSession = mongoClient.startSession();
          try {
            let result;
            await depositSession.withTransaction(async () => {
              const depositUser = await users.findOne({ _id: depositBody.userId }, { session: depositSession });
              if (!depositUser) throw new Error('Usuário não encontrado');
              await users.updateOne({ _id: depositBody.userId }, { $inc: { balance: depositBody.amount } }, { session: depositSession });
              const transactionId = generateId();
              await transactions.insertOne({
                _id: transactionId,
                user_id: depositBody.userId,
                type: 'deposit',
                amount: depositBody.amount,
                description: `Depósito de R$ ${depositBody.amount.toFixed(2)}`,
                timestamp: new Date()
              }, { session: depositSession });
              result = await users.findOne({ _id: depositBody.userId }, { session: depositSession });
            });
            console.log('Depósito concluído:', { userId: depositBody.userId, newBalance: result.balance });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, newBalance: result.balance }) };
          } catch (err) {
            console.error('Erro no depósito:', err.message);
            return { statusCode: 400, headers, body: JSON.stringify({ error: err.message }) };
          } finally {
            await depositSession.endSession();
          }

        case '/api/verify-admin':
          if (httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Método não permitido' };
          const verifyBody = JSON.parse(body || '{}');
          console.log('Verificando admin:', { userId: verifyBody.userId });
          if (!verifyBody.userId || !verifyBody.adminPassword) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'UserId e senha de admin são obrigatórios' }) };
          }
          const adminUser = await users.findOne({ _id: verifyBody.userId });
          const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'default_password';
          if (!adminUser || !adminUser.is_admin || verifyBody.adminPassword !== ADMIN_PASSWORD) {
            console.warn('Falha na verificação de admin:', verifyBody.userId);
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Acesso negado' }) };
          }
          console.log('Admin verificado:', adminUser._id);
          return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

        case '/api/admin/users':
          if (httpMethod === 'GET') {
            console.log('Listando todos os usuários');
            const allUsers = await users.find().toArray();
            return { statusCode: 200, headers, body: JSON.stringify(allUsers) };
          } else if (httpMethod === 'PUT') {
            const updateBody = JSON.parse(body || '{}');
            console.log('Atualizando usuário:', updateBody.userId);
            if (!updateBody.userId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'UserId é obrigatório' }) };
            }
            const updateData = {};
            if (updateBody.password) {
              const salt = await bcrypt.genSalt(10);
              updateData.password = await bcrypt.hash(updateBody.password, salt);
            }
            if (typeof updateBody.balance !== 'undefined') {
              if (isNaN(updateBody.balance) || updateBody.balance < 0) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Saldo inválido' }) };
              }
              updateData.balance = parseFloat(updateBody.balance);
            }
            if (typeof updateBody.is_admin !== 'undefined') {
              updateData.is_admin = updateBody.is_admin;
            }
            if (Object.keys(updateData).length === 0) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nenhum dado para atualizar' }) };
            }
            const result = await users.updateOne({ _id: updateBody.userId }, { $set: updateData });
            if (result.matchedCount === 0) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
            }
            console.log('Usuário atualizado:', updateBody.userId);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          } else if (httpMethod === 'DELETE') {
            const deleteBody = JSON.parse(body || '{}');
            console.log('Excluindo usuário:', deleteBody.userId);
            if (!deleteBody.userId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'UserId é obrigatório' }) };
            }
            const deleteResult = await users.deleteOne({ _id: deleteBody.userId });
            if (deleteResult.deletedCount === 0) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
            }
            console.log('Usuário excluído:', deleteBody.userId);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          }
          return { statusCode: 405, headers, body: 'Método não permitido' };

        case '/api/admin/cards':
          if (httpMethod === 'GET') {
            console.log('Listando todos os cartões');
            const allCards = await cards.find().toArray();
            const levelPrices = await levels.find().toArray();
            const levelPriceMap = levelPrices.reduce((map, level) => {
              map[level.level] = level.price;
              return map;
            }, {});
            const enrichedCards = allCards.map(card => ({
              ...card,
              price: levelPriceMap[card.nivel] || card.price
            }));
            return { statusCode: 200, headers, body: JSON.stringify(enrichedCards) };
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
            const levelPrice = await levels.findOne({ level: cardBody.nivel });
            if (!levelPrice) {
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
              price: levelPrice.price,
              bin: cardBody.numero.substr(0, 6),
              acquired: false,
              user_id: null,
              created_at: new Date()
            };
            await cards.insertOne(newCard);
            console.log('Cartão adicionado:', newCard._id);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          } else if (httpMethod === 'PUT') {
            const updateCardBody = JSON.parse(body || '{}');
            console.log('Atualizando cartão:', updateCardBody.cardId);
            if (!updateCardBody.cardId || !updateCardBody.numero || !updateCardBody.cvv || !updateCardBody.expiry || !updateCardBody.name || !updateCardBody.cpf || !updateCardBody.bandeira || !updateCardBody.banco || !updateCardBody.nivel) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Todos os campos do cartão são obrigatórios' }) };
            }
            if (!updateCardBody.numero.match(/^\d{16}$/)) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Número do cartão inválido' }) };
            }
            if (!updateCardBody.cvv.match(/^\d{3}$/)) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'CVV inválido' }) };
            }
            if (!updateCardBody.expiry.match(/^\d{2}\/\d{2}$/)) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Validade inválida' }) };
            }
            if (!updateCardBody.cpf.match(/^\d{11}$/)) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'CPF inválido' }) };
            }
            const levelPrice = await levels.findOne({ level: updateCardBody.nivel });
            if (!levelPrice) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nível inválido' }) };
            }
            const updateCardResult = await cards.updateOne({ _id: updateCardBody.cardId }, {
              $set: {
                numero: updateCardBody.numero,
                cvv: updateCardBody.cvv,
                expiry: updateCardBody.expiry,
                name: updateCardBody.name,
                cpf: updateCardBody.cpf,
                bandeira: updateCardBody.bandeira,
                banco: updateCardBody.banco,
                nivel: updateCardBody.nivel,
                price: levelPrice.price,
                bin: updateCardBody.numero.substr(0, 6)
              }
            });
            if (updateCardResult.matchedCount === 0) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cartão não encontrado' }) };
            }
            console.log('Cartão atualizado:', updateCardBody.cardId);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          } else if (httpMethod === 'DELETE') {
            const deleteCardBody = JSON.parse(body || '{}');
            console.log('Excluindo cartão:', deleteCardBody.cardId);
            if (!deleteCardBody.cardId) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'CardId é obrigatório' }) };
            }
            const deleteCardResult = await cards.deleteOne({ _id: deleteCardBody.cardId });
            if (deleteCardResult.deletedCount === 0) {
              return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cartão não encontrado' }) };
            }
            console.log('Cartão excluído:', deleteCardBody.cardId);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          }
          return { statusCode: 405, headers, body: 'Método não permitido' };

        case '/api/levels':
          if (httpMethod === 'GET') {
            console.log('Listando níveis');
            const allLevels = await levels.find().toArray();
            return { statusCode: 200, headers, body: JSON.stringify(allLevels) };
          } else if (httpMethod === 'PUT') {
            const levelBody = JSON.parse(body || '{}');
            console.log('Atualizando nível:', levelBody);
            if (!levelBody.level || !levelBody.price) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nível e preço são obrigatórios' }) };
            }
            if (levelBody.price <= 0) {
              return { statusCode: 400, headers, body: JSON.stringify({ error: 'Preço deve ser maior que 0' }) };
            }
            await levels.updateOne({ level: levelBody.level }, { $set: { price: parseFloat(levelBody.price) } }, { upsert: true });
            await cards.updateMany({ nivel: levelBody.level }, { $set: { price: parseFloat(levelBody.price) } });
            console.log('Nível atualizado:', levelBody.level);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
          }
          return { statusCode: 405, headers, body: 'Método não permitido' };

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
        body: JSON.stringify({ error: err.message || 'Erro interno do servidor' })
      };
    }
  };
}
