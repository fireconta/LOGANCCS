const { MongoClient } = require('mongodb');

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
    const client = new MongoClient(process.env.MONGODB_URI, { useUnifiedTopology: true });
    try {
        await client.connect();
        const db = client.db('logancss');
        return { client, db };
    } catch (err) {
        console.error('Erro ao conectar ao MongoDB:', err);
        throw new Error('Falha na conexão com o banco de dados');
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

        const path = event.path;
        const query = event.queryStringParameters || {};
        const body = event.body ? JSON.parse(event.body) : {};

        // Verificação de ambiente
        if (path === '/api/check-env') {
            const collections = await db.listCollections().toArray();
            const collectionNames = collections.map(c => c.name);
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
            return sendResponse(401, { error: 'Usuário não autenticado' });
        }

        // Login
        if (path === '/api/login') {
            const { username, password } = body;
            if (!username || !password) {
                return sendResponse(400, { error: 'Usuário e senha são obrigatórios' });
            }
            const user = await usersCollection.findOne({ username: sanitizeInput(username), password });
            if (!user) {
                return sendResponse(401, { error: 'Credenciais inválidas' });
            }
            return sendResponse(200, { userId: user._id.toString(), isAdmin: user.isAdmin });
        }

        // Registro
        if (path === '/api/register') {
            const { username, password } = body;
            if (!username || !password) {
                return sendResponse(400, { error: 'Usuário e senha são obrigatórios' });
            }
            if (!/^[a-zA-Z0-9]{3,20}$/.test(username)) {
                return sendResponse(400, { error: 'Usuário deve ter 3-20 caracteres alfanuméricos' });
            }
            if (password.length < 6) {
                return sendResponse(400, { error: 'Senha deve ter pelo menos 6 caracteres' });
            }
            const existingUser = await usersCollection.findOne({ username: sanitizeInput(username) });
            if (existingUser) {
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
            return sendResponse(200, { userId: result.insertedId.toString() });
        }

        // Verificação do usuário autenticado
        const user = await usersCollection.findOne({ _id: require('mongodb').ObjectId(query.userId) });
        if (!user && path !== '/api/login' && path !== '/api/register') {
            return sendResponse(404, { error: 'Usuário não encontrado' });
        }

        // Informações do usuário
        if (path === '/api/user') {
            return sendResponse(200, { username: user.username, isAdmin: user.isAdmin, balance: user.balance });
        }

        // Lista de usuários (somente admin)
        if (path === '/api/users') {
            if (!user.isAdmin) {
                return sendResponse(403, { error: 'Acesso negado' });
            }
            const users = await usersCollection.find().toArray();
            return sendResponse(200, users.length > 0 ? users : { message: 'Nenhum usuário encontrado' });
        }

        // Exclusão de usuário (somente admin)
        if (path === '/api/delete-user') {
            if (!user.isAdmin) {
                return sendResponse(403, { error: 'Acesso negado' });
            }
            const targetId = query.targetId;
            if (!targetId) {
                return sendResponse(400, { error: 'ID do usuário alvo é obrigatório' });
            }
            if (targetId === user._id.toString()) {
                return sendResponse(400, { error: 'Não é possível excluir a si mesmo' });
            }
            const result = await usersCollection.deleteOne({ _id: require('mongodb').ObjectId(targetId) });
            if (result.deletedCount === 0) {
                return sendResponse(404, { error: 'Usuário não encontrado' });
            }
            return sendResponse(200, { message: 'Usuário excluído' });
        }

        // Lista de cartões
        if (path === '/api/get-cards') {
            const cards = await cardsCollection.find().toArray();
            return sendResponse(200, cards.length > 0 ? cards : []);
        }

        // Lista de preços
        if (path === '/api/get-card-prices') {
            const prices = await pricesCollection.find().toArray();
            return sendResponse(200, prices.length > 0 ? prices : []);
        }

        // Compra de cartão
        if (path === '/api/buy-card') {
            const { nivel } = body;
            if (!nivel) {
                return sendResponse(400, { error: 'Nível do cartão é obrigatório' });
            }
            const cardPrice = await pricesCollection.findOne({ nivel: sanitizeInput(nivel) });
            if (!cardPrice) {
                return sendResponse(404, { error: 'Cartão não encontrado' });
            }
            if (user.balance < cardPrice.price) {
                return sendResponse(400, { error: 'Saldo insuficiente' });
            }
            await usersCollection.updateOne(
                { _id: require('mongodb').ObjectId(user._id) },
                { $set: { balance: user.balance - cardPrice.price } }
            );
            return sendResponse(200, { newBalance: user.balance - cardPrice.price });
        }

        // Adicionar cartão (somente admin)
        if (path === '/api/add-card') {
            if (!user.isAdmin) {
                return sendResponse(403, { error: 'Acesso negado' });
            }
            const validationError = validateCardData(body);
            if (validationError) {
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
            return sendResponse(200, { message: 'Cartão adicionado' });
        }

        // Excluir cartão (somente admin)
        if (path === '/api/delete-card') {
            if (!user.isAdmin) {
                return sendResponse(403, { error: 'Acesso negado' });
            }
            const { numero } = body;
            if (!numero) {
                return sendResponse(400, { error: 'Número do cartão é obrigatório' });
            }
            const result = await cardsCollection.deleteOne({ numero: sanitizeInput(numero) });
            if (result.deletedCount === 0) {
                return sendResponse(404, { error: 'Cartão não encontrado' });
            }
            return sendResponse(200, { message: 'Cartão excluído' });
        }

        // Atualizar preços (somente admin)
        if (path === '/api/update-prices') {
            if (!user.isAdmin) {
                return sendResponse(403, { error: 'Acesso negado' });
            }
            const prices = body;
            if (!Array.isArray(prices)) {
                return sendResponse(400, { error: 'Lista de preços inválida' });
            }
            for (const price of prices) {
                if (!price.nivel || !price.price || isNaN(price.price) || price.price <= 0) {
                    return sendResponse(400, { error: `Preço inválido para ${sanitizeInput(price.nivel)}` });
                }
                await pricesCollection.updateOne(
                    { nivel: sanitizeInput(price.nivel) },
                    { $set: { price: parseFloat(price.price) } },
                    { upsert: true }
                );
            }
            return sendResponse(200, { message: 'Preços atualizados' });
        }

        // Adicionar preço (somente admin)
        if (path === '/api/add-price') {
            if (!user.isAdmin) {
                return sendResponse(403, { error: 'Acesso negado' });
            }
            const { nivel, price } = body;
            if (!nivel || !price || isNaN(price) || price <= 0) {
                return sendResponse(400, { error: 'Nível ou preço inválido' });
            }
            const existingPrice = await pricesCollection.findOne({ nivel: sanitizeInput(nivel) });
            if (existingPrice) {
                return sendResponse(400, { error: 'Preço para este cartão já existe' });
            }
            await pricesCollection.insertOne({ nivel: sanitizeInput(nivel), price: parseFloat(price) });
            return sendResponse(200, { message: 'Preço adicionado' });
        }

        return sendResponse(404, { error: 'Rota não encontrada' });
    } catch (err) {
        console.error(`Erro no handler [${event.path}]:`, err);
        return sendResponse(500, { error: 'Erro interno do servidor: ' + err.message });
    } finally {
        if (client) {
            await client.close();
        }
    }
};
