const express = require('express');
   const mongoose = require('mongoose');
   const serverless = require('serverless-http');
   const debug = require('debug')('app-function') || console.log;
   const bcrypt = require('bcryptjs');
   const { body, validationResult } = require('express-validator');
   const cors = require('cors');

   debug('[INFO] Inicializando função serverless app-function');

   const app = express();

   app.use(cors({ 
     origin: 'https://loganccs.netlify.app', 
     methods: ['GET', 'POST', 'OPTIONS'],
     allowedHeaders: ['Content-Type'],
     exposedHeaders: ['Content-Type']
   }));
   app.use(express.json({ limit: '50kb' }));

   app.use((req, res, next) => {
     debug(`[INFO] Requisição recebida: ${req.method} ${req.originalUrl} - Body: %O`, req.body);
     res.on('finish', () => {
       debug(`[INFO] Resposta enviada: Status ${res.statusCode} - ${req.method} ${req.originalUrl}`);
     });
     next();
   });

   let mongoConnected = false;
   let cachedConnection = null;

   const connectMongoDB = async () => {
     if (cachedConnection && mongoose.connection.readyState === 1) {
       debug('[INFO] Reutilizando conexão MongoDB');
       return;
     }
     try {
       const uri = process.env.MONGODB_URI;
       if (!uri) {
         debug('[ERRO] MONGODB_URI não definido: %s', uri);
         throw new Error('MONGODB_URI não configurado');
       }
       debug('[INFO] Conectando ao MongoDB: %s', uri.replace(/:([^@]+)@/, ':****@'));
       cachedConnection = await mongoose.connect(uri, {
         useNewUrlParser: true,
         useUnifiedTopology: true,
         serverSelectionTimeoutMS: 60000,
         socketTimeoutMS: 180000
       });
       mongoConnected = true;
       debug('[INFO] Conexão MongoDB estabelecida');
     } catch (err) {
       mongoConnected = false;
       debug('[ERRO] Falha na conexão MongoDB: %s - %O', err.message, err);
       throw new Error('Falha na conexão com o banco');
     }
   };

   app.use(async (req, res, next) => {
     try {
       await connectMongoDB();
       next();
     } catch (err) {
       debug('[ERRO] Middleware MongoDB falhou: %s', err.message);
       res.status(500).json({ error: err.message, details: 'Erro no banco' });
     }
   });

   app.use((err, req, res, next) => {
     debug('[ERRO] Erro na requisição %s %s: %s - %O', req.method, req.originalUrl, err.message, err.stack);
     res.status(500).json({ error: 'Erro interno', details: err.message });
   });

   const UserSchema = new mongoose.Schema({
     username: { type: String, required: true, unique: true },
     password: { type: String, required: true },
     isAdmin: { type: Boolean, default: false },
     balance: { type: Number, default: 0 }
   }, { timestamps: true });
   UserSchema.index({ username: 1 });
   const User = mongoose.model('User', UserSchema);

   const CardSchema = new mongoose.Schema({
     numero: { type: String, required: true, unique: true },
     bandeira: { type: String, required: true },
     banco: { type: String, required: true },
     nivel: { type: String, required: true },
     price: { type: Number, required: true },
     userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
   }, { timestamps: true });
   CardSchema.index({ bandeira: 1, banco: 1, nivel: 1 });
   const Card = mongoose.model('Card', CardSchema);

   const TransactionSchema = new mongoose.Schema({
     userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
     cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
     amount: { type: Number, required: true },
     status: { type: String, default: 'completed' }
   }, { timestamps: true });
   const Transaction = mongoose.model('Transaction', TransactionSchema);

   const CardPriceSchema = new mongoose.Schema({
     nivel: { type: String, required: true, unique: true },
     price: { type: Number, required: true }
   }, { timestamps: true });
   const CardPrice = mongoose.model('CardPrice', CardPriceSchema);

   app.get('/api/test', (req, res) => {
     debug('[INFO] Endpoint /api/test');
     res.status(200).json({ message: 'Servidor OK', env: !!process.env.MONGODB_URI, timestamp: new Date().toISOString() });
   });

   app.get('/api/health', (req, res) => {
     debug('[INFO] Endpoint /api/health');
     res.status(200).json({
       mongoConnected,
       mongooseState: mongoose.connection.readyState,
       timestamp: new Date().toISOString()
     });
   });

   app.post('/api/register', [
     body('username').trim().notEmpty().isLength({ min: 3, max: 20 }).withMessage('Usuário: 3-20 caracteres'),
     body('password').notEmpty().isLength({ min: 6 }).withMessage('Senha: mínimo 6 caracteres')
   ], async (req, res) => {
     debug('[INFO] POST /api/register: %O', req.body);
     const errors = validationResult(req);
     if (!errors.isEmpty()) {
       debug('[ERRO] Validação falhou: %O', errors.array());
       return res.status(400).json({ error: errors.array()[0].msg, details: 'Validação inválida' });
     }
     const { username, password } = req.body;
     try {
       const existingUser = await User.findOne({ username });
       if (existingUser) {
         debug('[ERRO] Usuário existente: %s', username);
         return res.status(400).json({ error: 'Usuário já existe', details: 'Nome de usuário registrado' });
       }
       const hashedPassword = await bcrypt.hash(password, 10);
       const user = new User({ username, password: hashedPassword, isAdmin: username === 'LVz' });
       await user.save();
       debug('[INFO] Usuário registrado: %s', username);
       res.status(201).json({ username, message: 'Registro OK' });
     } catch (err) {
       debug('[ERRO] Falha no registro: %s - %O', err.message, err);
       res.status(500).json({ error: 'Erro no servidor', details: err.message });
     }
   });

   app.post('/api/login', [
     body('username').trim().notEmpty().withMessage('Usuário obrigatório'),
     body('password').notEmpty().withMessage('Senha obrigatória')
   ], async (req, res) => {
     debug('[INFO] POST /api/login: %O', req.body);
     const errors = validationResult(req);
     if (!errors.isEmpty()) {
       debug('[ERRO] Validação falhou: %O', errors.array());
       return res.status(400).json({ error: errors.array()[0].msg, details: 'Validação inválida' });
     }
     const { username, password } = req.body;
     try {
       const user = await User.findOne({ username });
       if (!user) {
         debug('[ERRO] Usuário não encontrado: %s', username);
         return res.status(404).json({ error: 'Usuário não encontrado', details: 'Usuário inexistente' });
       }
       const isMatch = await bcrypt.compare(password, user.password);
       if (!isMatch) {
         debug('[ERRO] Senha incorreta: %s', username);
         return res.status(401).json({ error: 'Senha incorreta', details: 'Senha não corresponde' });
       }
       debug('[INFO] Login OK: %s', username);
       res.status(200).json({ 
         userId: user._id.toString(), 
         username: user.username, 
         is_admin: user.isAdmin,
         message: 'Login OK'
       });
     } catch (err) {
       debug('[ERRO] Falha no login: %s - %O', err.message, err);
       res.status(500).json({ error: 'Erro no servidor', details: err.message });
     }
   });

   app.get('/api/user', async (req, res) => {
     debug('[INFO] GET /api/user: %s', req.query.userId);
     try {
       const user = await User.findById(req.query.userId).select('-password');
       if (!user) {
         debug('[ERRO] Usuário não encontrado: %s', req.query.userId);
         return res.status(404).json({ error: 'Usuário não encontrado', details: 'ID inválido' });
       }
       res.status(200).json(user);
     } catch (err) {
       debug('[ERRO] Falha na busca: %s - %O', err.message, err);
       res.status(500).json({ error: 'Erro no servidor', details: err.message });
     }
   });

   app.get('/api/users', async (req, res) => {
     debug('[INFO] GET /api/users: %s', req.query.userId);
     try {
       const user = await User.findById(req.query.userId);
       if (!user || !user.isAdmin) {
         debug('[ERRO] Acesso negado: %s', req.query.userId);
         return res.status(403).json({ error: 'Acesso negado', details: 'Apenas admin' });
       }
       const users = await User.find().select('-password');
       res.status(200).json(users);
     } catch (err) {
       debug('[ERRO] Falha na lista: %s - %O', err.message, err);
       res.status(500).json({ error: 'Erro no servidor', details: err.message });
     }
   });

   app.get('/api/cards', async (req, res) => {
     debug('[INFO] GET /api/cards');
     try {
       const cards = await Card.find({ userId: null });
       res.status(200).json(cards);
     } catch (err) {
       debug('[ERRO] Falha na lista: %s - %O', err.message, err);
       res.status(500).json({ error: 'Erro no servidor', details: err.message });
     }
   });

   app.post('/api/buy-card', async (req, res) => {
     debug('[INFO] POST /api/buy-card: %O', req.body);
     const { userId, cardId, price } = req.body;
     const session = await mongoose.startSession();
     try {
       session.startTransaction();
       const user = await User.findById(userId).session(session);
       if (!user) {
         debug('[ERRO] Usuário não encontrado: %s', userId);
         throw new Error('Usuário não encontrado');
       }
       if (user.balance < price) {
         debug('[ERRO] Saldo insuficiente: %s', userId);
         throw new Error('Saldo insuficiente');
       }
       const card = await Card.findById(cardId).session(session);
       if (!card || card.userId) {
         debug('[ERRO] Cartão inválido: %s', cardId);
         throw new Error('Cartão inválido ou comprado');
       }
       user.balance -= price;
       card.userId = userId;
       const transaction = new Transaction({ userId, cardId, amount: price });
       await Promise.all([
         user.save({ session }),
         card.save({ session }),
         transaction.save({ session })
       ]);
       await session.commitTransaction();
       debug('[INFO] Compra OK: cartão %s por %s', cardId, userId);
       res.status(200).json({ message: 'Compra OK' });
     } catch (err) {
       await session.abortTransaction();
       debug('[ERRO] Falha na compra: %s - %O', err.message, err);
       res.status(400).json({ error: err.message, details: 'Erro na compra' });
     } finally {
       session.endSession();
     }
   });

   app.post('/api/set-card-prices', [
     body('prices').isArray().notEmpty(),
     body('prices.*.nivel').isIn(['Classic', 'Gold', 'Platinum', 'Black']),
     body('prices.*.price').isFloat({ min: 0 })
   ], async (req, res) => {
     debug('[INFO] POST /api/set-card-prices: %O', req.body);
     const errors = validationResult(req);
     if (!errors.isEmpty()) {
       debug('[ERRO] Validação falhou: %O', errors.array());
       return res.status(400).json({ error: errors.array()[0].msg, details: 'Validação inválida' });
     }
     const { prices } = req.body;
     const userId = req.query.userId;
     try {
       const user = await User.findById(userId);
       if (!user || !user.isAdmin) {
         debug('[ERRO] Acesso negado: %s', userId);
         return res.status(403).json({ error: 'Acesso negado', details: 'Apenas admin' });
       }
       const session = await mongoose.startSession();
       session.startTransaction();
       try {
         for (const { nivel, price } of prices) {
           await CardPrice.findOneAndUpdate(
             { nivel },
             { price, updatedAt: new Date() },
             { upsert: true, session }
           );
           await Card.updateMany(
             { nivel, userId: null },
             { price, updatedAt: new Date() },
             { session }
           );
         }
         await session.commitTransaction();
         debug('[INFO] Preços atualizados: %s', userId);
         res.status(200).json({ message: 'Preços OK' });
       } catch (err) {
         await session.abortTransaction();
         debug('[ERRO] Falha nos preços: %s - %O', err.message, err);
         throw err;
       } finally {
         session.endSession();
       }
     } catch (err) {
       debug('[ERRO] Falha geral: %s - %O', err.message, err);
       res.status(500).json({ error: 'Erro no servidor', details: err.message });
     }
   });

   app.get('/api/get-card-prices', async (req, res) => {
     debug('[INFO] GET /api/get-card-prices: %s', req.query.userId);
     try {
       const user = await User.findById(req.query.userId);
       if (!user || !user.isAdmin) {
         debug('[ERRO] Acesso negado: %s', req.query.userId);
         return res.status(403).json({ error: 'Acesso negado', details: 'Apenas admin' });
       }
       const prices = await CardPrice.find();
       res.status(200).json(prices);
     } catch (err) {
       debug('[ERRO] Falha na lista: %s - %O', err.message, err);
       res.status(500).json({ error: 'Erro no servidor', details: err.message });
     }
   });

   app.post('/api/logout', (req, res) => {
     debug('[INFO] POST /api/logout');
     res.status(200).json({ message: 'Logout OK' });
   });

   module.exports.handler = serverless(app, {
     binary: ['application/json']
   });
