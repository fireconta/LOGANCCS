LOGAN CC's - Sistema de Compra de Cartões
Descrição
LOGAN CC's é um sistema web para compra de cartões, com autenticação de usuários e um painel administrativo. Os cartões podem ter níveis personalizados (ex.: Classic, Gold, Platinum, Black, Business, Infinite), com preços definidos pelo administrador. O projeto utiliza HTML, CSS, JavaScript, Tailwind CSS, e um backend serverless com Node.js, Express, e MongoDB, hospedado no Netlify.
Estrutura do Projeto
LOGANCCS-main/
│
├── README.md
├── dashboard.html
├── debug.js
├── index.html
├── netlify.toml
├── package.json
├── shop.html
├── utils.js
└── functions/
    └── app-function.js


index.html: Página de login e registro com debug visível por padrão.
shop.html: Loja para exibir e comprar cartões, com debug de ambiente.
dashboard.html: Painel admin para gerenciar preços, adicionar novos níveis de cartões, e gerenciar usuários (acessível apenas por LVz).
utils.js: Funções utilitárias (fetch, formatação, notificações).
debug.js: Ferramenta de depuração com logs coloridos.
functions/app-function.js: Backend serverless com APIs, incluindo verificação de ambiente.
netlify.toml: Configuração do Netlify.
package.json: Dependências do projeto.

Funcionalidades

Login e Registro: Usuários podem se registrar (username alfanumérico, senha ≥ 6 caracteres) e logar. O usuário LVz com ADMIN_PASSWORD é administrador.
Loja: Exibe todos os níveis de cartões disponíveis (definidos na coleção CardPrice) com preços dinâmicos e permite compras com validação de saldo.
Painel Admin:
Gerencia preços de cartões existentes (mínimo 0.01).
Permite adicionar novos níveis de cartões (nome alfanumérico de 3-20 caracteres, preço ≥ 0.01).
Lista e exclui usuários (exceto LVz).


Debug: Painel visível em index.html, shop.html, e dashboard.html, mostrando:
Status da conexão com MongoDB.
Acessibilidade das coleções (User, CardPrice, Purchase).
Status das variáveis de ambiente (MONGODB_URI, ADMIN_PASSWORD, NODE_VERSION).
Ações como adição de novos níveis (ex.: Nível Diamond adicionado com preço 1200).


Segurança: Senhas criptografadas com bcrypt. Autenticação via localStorage (considere JWT para produção).

Configuração

Pré-requisitos:

Conta no Netlify.
Conta no MongoDB Atlas com banco loganccs.
Node.js para testes locais (opcional).


Deploy no Netlify:

Crie um repositório com os arquivos do projeto.
Conecte o repositório ao Netlify.
Configure as variáveis de ambiente no Netlify:
MONGODB_URI: URI do MongoDB Atlas (ex.: mongodb+srv://<user>:<password>@cluster0.mongodb.net/loganccs).
ADMIN_PASSWORD: Senha para o usuário admin LVz.
NODE_VERSION: Versão do Node.js (ex.: 18).


Adicione o IP 0.0.0.0/0 à lista de IPs permitidos no MongoDB Atlas.


Testes Locais:
npm install
export MONGODB_URI=<sua-uri>
export ADMIN_PASSWORD=<sua-senha>
export NODE_VERSION=18
npm run dev


Acesse http://localhost:8888.



Endpoints da API

GET /api/check-env: Verifica conexão com MongoDB, coleções, e variáveis de ambiente.
POST /api/register: Registra um usuário (username, password).
POST /api/login: Autentica um usuário, retorna userId e is_admin.
GET /api/user: Retorna dados do usuário (username, balance, isAdmin).
GET /api/users: Lista todos os usuários (apenas admin).
DELETE /api/delete-user: Exclui um usuário (apenas admin).
GET /api/get-card-prices: Retorna preços dos cartões (todos os níveis definidos).
POST /api/set-card-prices: Atualiza ou cria preços de cartões (apenas admin, aceita qualquer nível alfanumérico).
POST /api/buy-card: Compra um cartão, deduz saldo (aceita qualquer nível existente).

Depuração

Painel de Debug: Visível por padrão em todas as páginas (index.html, shop.html, dashboard.html). Clique em "Esconder Debug" para ocultar.
Mensagens de Debug:
Conexão com MongoDB (Sim ou Não).
Status das coleções (User, CardPrice, Purchase: Acessível ou Inacessível).
Variáveis de ambiente (MONGODB_URI, ADMIN_PASSWORD, NODE_VERSION: Configurada ou Não configurada).
Ações no painel admin (ex.: Nível Diamond adicionado com preço 1200).


Verifique logs no Netlify (Functions Logs) e no MongoDB Atlas para erros adicionais.

Problemas Comuns

Erro na loja:
Verifique o painel de debug em shop.html para mensagens como Dados inválidos recebidos do endpoint /api/get-card-prices.
Confirme que a coleção CardPrice contém os níveis corretos.


Erro ao adicionar nível:
Verifique o painel de debug em dashboard.html para mensagens como Nome do nível deve ter 3-20 caracteres alfanuméricos.
Confirme que a coleção CardPrice foi atualizada no MongoDB Atlas.


Erro de login/registro:
Verifique o painel de debug em index.html para mensagens de erro.
Confirme que MONGODB_URI está correta e aponta para o banco loganccs.
Assegure que ADMIN_PASSWORD e NODE_VERSION estão definidas no Netlify.


Erro de conexão com MongoDB:
Adicione o IP 0.0.0.0/0 no MongoDB Atlas.
Verifique logs do Netlify para erros de conexão.


Compra falha:
Verifique se o nível existe na coleção CardPrice e se o usuário tem saldo suficiente.



Contato
Para suporte, contate o desenvolvedor em fireconta@example.com.
