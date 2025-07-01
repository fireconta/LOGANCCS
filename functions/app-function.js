const users = [];
const cards = [];
const cardPrices = [];

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

exports.handler = async function(event, context) {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return sendResponse(200, {});
        }

        const path = event.path;
        const query = event.queryStringParameters || {};
        const body = event.body ? JSON.parse(event.body) : {};

        // Verificação de ambiente
        if (path === '/api/check-env') {
            // Substituir por verificação real do MongoDB
            return sendResponse(200, {
                mongodbConnected: true, // Atualizar com conexão real
                collections: { users: { exists: true }, cards: { exists: true }, cardPrices: { exists: true } },
                environment: { MONGODB_URI: { exists: true }, JWT_SECRET: { exists: true } }
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
            // Substituir por consulta ao banco de dados
            const user = users.find(u => u.username === sanitizeInput(username) && u.password === password);
            if (!user) {
                return sendResponse(401, { error: 'Credenciais inválidas' });
            }
            return sendResponse(200, { userId: user._id, isAdmin: user.isAdmin });
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
            if (users.some(u => u.username === sanitizeInput(username))) {
                return sendResponse(400, { error: 'Usuário já existe' });
            }
            // Substituir por inserção no banco de dados
            const newUser = { _id: `${users.length + 1}`, username: sanitizeInput(username), password, isAdmin: false, balance: 0, createdAt: new Date().toISOString() };
            users.push(newUser);
            return sendResponse(200, { userId: newUser._id });
        }

        // Verificação do usuário autenticado
        // Substituir por consulta ao banco de dados
        const user = users.find(u => u._id === query.userId);
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
            // Substituir por consulta ao banco de dados
            return sendResponse(200, users);
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
            if (targetId === user._id) {
                return sendResponse(400, { error: 'Não é possível excluir a si mesmo' });
            }
            // Substituir por exclusão no banco de dados
            const index = users.findIndex(u => u._id === targetId);
            if (index === -1) {
                return sendResponse(404, { error: 'Usuário não encontrado' });
            }
            users.splice(index, 1);
            return sendResponse(200, { message: 'Usuário excluído' });
        }

        // Lista de cartões
        if (path === '/api/get-cards') {
            // Substituir por consulta ao banco de dados
            return sendResponse(200, cards);
        }

        // Lista de preços
        if (path === '/api/get-card-prices') {
            // Substituir por consulta ao banco de dados
            return sendResponse(200, cardPrices);
        }

        // Compra de cartão
        if (path === '/api/buy-card') {
            const { nivel } = body;
            if (!nivel) {
                return sendResponse(400, { error: 'Nível do cartão é obrigatório' });
            }
            // Substituir por consulta ao banco de dados
            const cardPrice = cardPrices.find(p => p.nivel === sanitizeInput(nivel));
            if (!cardPrice) {
                return sendResponse(404, { error: 'Cartão não encontrado' });
            }
            if (user.balance < cardPrice.price) {
                return sendResponse(400, { error: 'Saldo insuficiente' });
            }
            // Substituir por atualização no banco de dados
            user.balance -= cardPrice.price;
            return sendResponse(200, { newBalance: user.balance });
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
            // Substituir por inserção no banco de dados
            const sanitizedCard = {
                nivel: sanitizeInput(body.nivel),
                numero: sanitizeInput(body.numero),
                dataValidade: sanitizeInput(body.dataValidade),
                cvv: sanitizeInput(body.cvv),
                bin: sanitizeInput(body.bin),
                bandeira: sanitizeInput(body.bandeira),
                banco: sanitizeInput(body.banco)
            };
            cards.push(sanitizedCard);
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
            // Substituir por exclusão no banco de dados
            const index = cards.findIndex(c => c.numero === sanitizeInput(numero));
            if (index === -1) {
                return sendResponse(404, { error: 'Cartão não encontrado' });
            }
            cards.splice(index, 1);
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
                // Substituir por atualização no banco de dados
                const index = cardPrices.findIndex(p => p.nivel === sanitizeInput(price.nivel));
                if (index !== -1) {
                    cardPrices[index].price = parseFloat(price.price);
                } else {
                    cardPrices.push({ nivel: sanitizeInput(price.nivel), price: parseFloat(price.price) });
                }
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
            if (cardPrices.some(p => p.nivel === sanitizeInput(nivel))) {
                return sendResponse(400, { error: 'Preço para este cartão já existe' });
            }
            // Substituir por inserção no banco de dados
            cardPrices.push({ nivel: sanitizeInput(nivel), price: parseFloat(price) });
            return sendResponse(200, { message: 'Preço adicionado' });
        }

        return sendResponse(404, { error: 'Rota não encontrada' });
    } catch (err) {
        console.error(`Erro no handler [${event.path}]:`, err);
        return sendResponse(500, { error: 'Erro interno do servidor' });
    }
};
