const { MongoClient, ObjectId } = require('mongodb');

function sendResponse(statusCode, body, headers = {}) {
    return {
        statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json',
            ...headers
        },
        body: JSON.stringify(body)
    };
}

function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.replace(/[<>]/g, '').trim();
}

function validateCardData({ nivel, numero, dataValidade, cvv, bin, bandeira, banco }) {
    if (!nivel || !numero || !dataValidade || !cvv || !bin || !bandeira || !banco) {
        return 'Todos os campos são obrigatórios';
    }
    if (!/^[a-zA-Z0-9]{3,20}$/.test(nivel)) {
        return 'Nível inválido';
    }
    if (!/^\d{16}$/.test(numero)) {
        return 'Número do cartão inválido';
    }
    if (!/^\d{2}\/\d{2}$/.test(dataValidade)) {
        return 'Data de validade inválida (MM/AA)';
    }
    if (!/^\d{3,4}$/.test(cvv)) {
        return 'CVV inválido';
    }
    if (!/^\d{6}$/.test(bin)) {
        return 'BIN inválido';
    }
    if (!/^[a-zA-Z\s]{1,50}$/.test(bandeira) || !/^[a-zA-Z\s]{1,50}$/.test(banco)) {
        return 'Bandeira ou banco inválido';
    }
    return null;
}

async function connectToMongo() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI não configurada');
        throw new Error('Variável de ambiente MONGODB_URI não encontrada');
    }
    const client = new MongoClient(uri, { useUnifiedTopology: true });
    try {
        await client.connect();
        console.log('Conectado ao MongoDB com sucesso');
        const db = client.db('logancss');
        return { client, db };
    } catch (err) {
        console.error('Erro ao conectar ao MongoDB:', err);
        throw new Error('Falha na conexão com o banco de dados: ' + err.message);
    }
}

exports.handler = async function(event, context) {
    let client;
    try {
        if (event.httpMethod === 'OPTIONS') {
            return sendResponse(200, {});
        }

        const { client: mongoClient, db } = await connectToMongo();
        client = mongoClient;
        const usersCollection = db.collection('users');
        const cardsCollection = db.collection('cards');
        const pricesCollection = db.collection('cardPrices');

        // Criar índices para melhorar performance
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        await cardsCollection.createIndex({ numero: 1 }, { unique: true });
        await pricesCollection.createIndex({ nivel: 1 }, { unique: true });

        const path = event.path;
        const query = event.queryStringParameters || {};
        const body = event.body ? JSON.parse(event.body) : {};

        // Verificação de ambiente
        if (path === '/api/check-env') {
            const collections = await db.listCollections().toArray();
            const collectionNames = collections.map(c => c.name);
            console.log('Coleções encontradas:', collectionNames);
            return sendResponse(200, {
                mongodbConnected: true,
                collections: {
                    users: { exists: collectionNames.includes('users') },
                    cards: { exists: collectionNames.includes('cards') },
                    cardPrices: { exists: collectionNames.includes('cardPrices') }
                },
                environment: {
                    MONGODB_URI: { exists: !!process.env.MONGODB_URI },
                    JWT_SECRET: { exists: !!process.env.JWT_SECRET }
                }
            });
        }

        // Verificação de autenticação para rotas protegidas
        if (!query.userId && path !== '/api/login' && path !== '/api/register') {
            console.log('Erro: Usuário não autenticado, userId ausente');
            return sendResponse(401, { error: 'Usuário não autenticado' });
        }

        // Login
        if (path === '/api/login') {
            const { username, password } = body;
            if (!username || !password) {
                console.log('Erro: Usuário ou senha não fornecidos');
                return sendResponse(400, { error: 'Usuário e senha são obrigatórios' });
            }
            const sanitizedUsername = sanitizeInput(username);
            const user = await usersCollection.findOne({ username: sanitizedUsername });
            if (!user) {
                console.log(`Usuário ${sanitizedUsername} não encontrado`);
                return sendResponse(401, { error: 'Usuário não encontrado' });
            }
            if (user.password !== password) {
                console.log(`Senha incorreta para usuário ${sanitizedUsername}`);
                return sendResponse(401, { error: 'Senha incorreta' });
            }
            console.log(`Login bem-sucedido para usuário ${sanitizedUsername}`);
            return sendResponse(200, { userId: user._id.toString(), username: user.username, isAdmin: user.isAdmin });
        }

        // Registro
        if (path === '/api/register') {
            const { username, password } = body;
            if (!username || !password) {
                console.log('Erro: Usuário ou senha não fornecidos');
                return sendResponse(400, { error: 'Usuário e senha são obrigatórios' });
            }
            if (!/^[a-zA-Z0-9]{3,20}$/.test(username)) {
                console.log('Erro: Usuário inválido');
                return sendResponse(400, { error: 'Usuário deve ter 3-20 caracteres alfanuméricos' });
            }
            if (password.length < 6) {
                console.log('Erro: Senha muito curta');
                return sendResponse(400, { error: 'Senha deve ter pelo menos 6 caracteres' });
            }
            const existingUser = await usersCollection.findOne({ username: sanitizeInput(username) });
            if (existingUser) {
                console.log(`Erro: Usuário ${username} já existe`);
                return sendResponse(400, { error: 'Usuário já existe' });
            }
            const newUser = {
                username: sanitizeInput(username),
                password,
                isAdmin: false,
                balance: 0,
                createdAt: new Date().toISOString()
            };
            const result = await usersCollection.insertOne(newUser);
            console.log(`Novo usuário registrado: ${username}`);
            return sendResponse(200, { userId: result.insertedId.toString(), username });
        }

        // Verificação do usuário autenticado
        let user;
        try {
            user = await usersCollection.findOne({ _id: new ObjectId(query.userId) });
        } catch (err) {
            console.error('Erro ao validar userId:', err);
            return sendResponse(400, { error: 'ID de usuário inválido' });
        }
        if (!user && path !== '/api/login' && path !== '/api/register') {
            console.log('Erro: Usuário não encontrado para userId:', query.userId);
            return sendResponse(404, { error: 'Usuário não encontrado' });
        }

        // Informações do usuário
        if (path === '/api/user') {
            return sendResponse(200, { username: user.username, isAdmin: user.isAdmin, balance: user.balance });
        }

        // Lista de usuários (somente admin)
        if (path === '/api/users') {
            if (!user.isAdmin) {
                console.log('Erro: Acesso negado para listar usuários, usuário não é admin');
                return sendResponse(403, { error: 'Acesso negado' });
            }
            const users = await usersCollection.find().toArray();
            console.log(`Lista de usuários retornada, total: ${users.length}`);
            return sendResponse(200, users.length > 0 ? users : []);
        }

        // Exclusão de usuário (somente admin)
        if (path === '/api/delete-user') {
            if (!user.isAdmin) {
                console.log('Erro: Acesso negado para excluir usuário, usuário não é admin');
                return sendResponse(403, { error: 'Acesso negado' });
            }
            const targetId = query.targetId;
            if (!targetId) {
                console.log('Erro: ID do usuário alvo não fornecido');
                return sendResponse(400, { error: 'ID do usuário alvo é obrigatório' });
            }
            if (targetId === user._id.toString()) {
                console.log('Erro: Tentativa de excluir a si mesmo');
                return sendResponse(400, { error: 'Não é possível excluir a si mesmo' });
            }
            const result = await usersCollection.deleteOne({ _id: new ObjectId(targetId) });
            if (result.deletedCount === 0) {
                console.log('Erro: Usuário não encontrado para exclusão, targetId:', targetId);
                return sendResponse(404, { error: 'Usuário não encontrado' });
            }
            console.log(`Usuário excluído, targetId: ${targetId}`);
            return sendResponse(200, { message: 'Usuário excluído' });
        }

        // Lista de cartões
        if (path === '/api/get-cards') {
            const cards = await cardsCollection.find().toArray();
            console.log(`Cartões retornados, total: ${cards.length}`);
            return sendResponse(200, cards);
        }

        // Lista de preços
        if (path === '/api/get-card-prices') {
            const prices = await pricesCollection.find().toArray();
            console.log(`Preços retornados, total: ${prices.length}`);
            return sendResponse(200, prices);
        }

        // Compra de cartão
        if (path === '/api/buy-card') {
            const { nivel } = body;
            if (!nivel) {
                console.log('Erro: Nível do cartão não fornecido');
                return sendResponse(400, { error: 'Nível do cartão é obrigatório' });
            }
            const cardPrice = await pricesCollection.findOne({ nivel: sanitizeInput(nivel) });
            if (!cardPrice) {
                console.log(`Erro: Preço não encontrado para cartão ${nivel}`);
                return sendResponse(404, { error: 'Cartão não encontrado' });
            }
            if (user.balance < cardPrice.price) {
                console.log(`Erro: Saldo insuficiente para usuário ${user.username}, saldo: ${user.balance}, preço: ${cardPrice.price}`);
                return sendResponse(400, { error: 'Saldo insuficiente' });
            }
            await usersCollection.updateOne(
                { _id: new ObjectId(user._id) },
                { $set: { balance: user.balance - cardPrice.price } }
            );
            console.log(`Cartão ${nivel} comprado por ${user.username}, novo saldo: ${user.balance - cardPrice.price}`);
            return sendResponse(200, { newBalance: user.balance - cardPrice.price });
        }

        // Adicionar cartão (somente admin)
        if (path === '/api/add-card') {
            if (!user.isAdmin) {
                console.log('Erro: Acesso negado para adicionar cartão, usuário não é admin');
                return sendResponse(403, { error: 'Acesso negado' });
            }
            const validationError = validateCardData(body);
            if (validationError) {
                console.log(`Erro: ${validationError}`);
                return sendResponse(400, { error: validationError });
            }
            const sanitizedCard = {
                nivel: sanitizeInput(body.nivel),
                numero: sanitizeInput(body.numero),
                dataValidade: sanitizeInput(body.dataValidade),
                cvv: sanitizeInput(body.cvv),
                bin: sanitizeInput(body.bin),
                bandeira: sanitizeInput(body.bandeira),
                banco: sanitizeInput(body.banco)
            };
            await cardsCollection.insertOne(sanitizedCard);
            console.log(`Cartão ${sanitizedCard.nivel} adicionado por ${user.username}`);
            return sendResponse(200, { message: 'Cartão adicionado' });
        }

        // Excluir cartão (somente admin)
        if (path === '/api/delete-card') {
            if (!user.isAdmin) {
                console.log('Erro: Acesso negado para excluir cartão, usuário não é admin');
                return sendResponse(403, { error: 'Acesso negado' });
            }
            const { numero } = body;
            if (!numero) {
                console.log('Erro: Número do cartão não fornecido');
                return sendResponse(400, { error: 'Número do cartão é obrigatório' });
            }
            const result = await cardsCollection.deleteOne({ numero: sanitizeInput(numero) });
            if (result.deletedCount === 0) {
                console.log('Erro: Cartão não encontrado para exclusão, número:', numero);
                return sendResponse(404, { error: 'Cartão não encontrado' });
            }
            console.log(`Cartão ${numero} excluído por ${user.username}`);
            return sendResponse(200, { message: 'Cartão excluído' });
        }

        // Atualizar preços (somente admin)
        if (path === '/api/update-prices') {
            if (!user.isAdmin) {
                console.log('Erro: Acesso negado para atualizar preços, usuário não é admin');
                return sendResponse(403, { error: 'Acesso negado' });
            }
            const prices = body;
            if (!Array.isArray(prices)) {
                console.log('Erro: Lista de preços inválida');
                return sendResponse(400, { error: 'Lista de preços inválida' });
            }
            for (const price of prices) {
                if (!price.nivel || !price.price || isNaN(price.price) || price.price <= 0) {
                    console.log(`Erro: Preço inválido para ${price.nivel}`);
                    return sendResponse(400, { error: `Preço inválido para ${sanitizeInput(price.nivel)}` });
                }
                await pricesCollection.updateOne(
                    { nivel: sanitizeInput(price.nivel) },
                    { $set: { price: parseFloat(price.price) } },
                    { upsert: true }
                );
            }
            console.log(`Preços atualizados por ${user.username}`);
            return sendResponse(200, { message: 'Preços atualizados' });
        }

        // Adicionar preço (somente admin)
        if (path === '/api/add-price') {
            if (!user.isAdmin) {
                console.log('Erro: Acesso negado para adicionar preço, usuário não é admin');
                return sendResponse(403, { error: 'Acesso negado' });
            }
            const { nivel, price } = body;
            if (!nivel || !price || isNaN(price) || price <= 0) {
                console.log('Erro: Nível ou preço inválido');
                return sendResponse(400, { error: 'Nível ou preço inválido' });
            }
            const existingPrice = await pricesCollection.findOne({ nivel: sanitizeInput(nivel) });
            if (existingPrice) {
                console.log(`Erro: Preço para ${nivel} já existe`);
                return sendResponse(400, { error: 'Preço para este cartão já existe' });
            }
            await pricesCollection.insertOne({ nivel: sanitizeInput(nivel), price: parseFloat(price) });
            console.log(`Preço para ${nivel} adicionado por ${user.username}`);
            return sendResponse(200, { message: 'Preço adicionado' });
        }

        console.log('Erro: Rota não encontrada:', path);
        return sendResponse(404, { error: 'Rota não encontrada' });
    } catch (err) {
        console.error(`Erro no handler [${event.path}]:`, err);
        return sendResponse(500, { error: 'Erro interno do servidor: ' + err.message });
    } finally {
        if (client) {
            await client.close();
            console.log('Conexão com MongoDB fechada');
        }
    }
};
