LoganCCS
LoganCCS é uma aplicação web para gerenciamento e compra de cartões de crédito, com interface moderna, navegação fluida e design responsivo. O sistema inclui autenticação de usuários, gerenciamento administrativo de cartões e níveis/preços, e uma loja para compra de cartões com filtros e carteira de compras.
Funcionalidades

Autenticação:
Login e registro de usuários com validação no frontend (usuário: mín. 3 caracteres alfanuméricos; senha: mín. 6 caracteres).
Armazenamento de token JWT em localStorage para autenticação.


Loja (shop.html):
Alternância entre seções "Loja" (🛒) e "Carteira" (💼) via botões.
Filtros responsivos por bandeira, banco e nível.
Modal de confirmação de compra com redirecionamento para link de pagamento.
Exibição de compras na carteira com formatação de BIN e data.


Dashboard (dashboard.html):
Gerenciamento administrativo (exclusivo para admins) com abas para:
👥 Gerenciar Usuários (listar, editar, excluir).
💳 Gerenciar Cartões (adicionar cartões com validação de número, CVV, validade).
💰 Gerenciar Níveis e Preços (adicionar níveis com preço e link de pagamento).


Painel de depuração visível para logs de ações.


Design:
Tema vibrante com fundo gradiente, botões animados, e emojis (🛒, 💼, 💳, 🏦, 🏷️, ⭐, 🔢, 📅, 💰, ✅, ❌, ⏳).
Layout responsivo usando Tailwind CSS.
Acessibilidade com atributos ARIA e alto contraste.


Feedback:
Mensagens visuais com emojis para carregamento (⏳), sucesso (✅) e erro (❌) em todas as páginas.



Estrutura do Projeto
/root
├── index.html          # Página de login e registro
├── dashboard.html      # Dashboard administrativo
├── shop.html           # Loja e carteira de cartões
├── utils.js            # Funções de validação e formatação
├── debug.js            # Funções de depuração (usado apenas em dashboard.html)
├── functions/
│   └── app-function.js # Backend (Netlify Functions)
├── netlify.toml        # Configuração do Netlify

Páginas

index.html: Interface de autenticação com abas para Login (🔐) e Registro (📝). Redireciona para /dashboard após login.
dashboard.html: Painel administrativo com abas para gerenciamento de usuários, cartões e níveis/preços. Inclui painel de depuração.
shop.html: Loja de cartões com botões para alternar entre Loja (🛒) e Carteira (💼). Não exibe painel de depuração.

Arquivos de Suporte

utils.js: Contém funções para validação (ex.: validateCardNumber, validateCvv, validateExpiry) e formatação (ex.: formatBin, formatExpiry).
debug.js: Funções de depuração (debug.init, debug.log, debug.error) usadas apenas em dashboard.html.
app-function.js: Backend com rotas da API:
/api/register: Registro de usuário.
/api/login: Login de usuário.
/api/users: Listar usuários (admin).
/api/delete-user: Excluir usuário (admin).
/api/banks: Listar bancos.
/api/cards: Listar/adicionar cartões.
/api/cardprices: Listar/adicionar níveis e preços.
/api/purchase: Processar compra de cartão.
/api/purchases: Listar compras do usuário.



Configuração
Pré-requisitos

Node.js: Para rodar o backend localmente (opcional, já que o Netlify Functions gerencia o backend).
Netlify CLI: Para desenvolvimento local e deploy.
MongoDB Atlas: Banco de dados para armazenar usuários, cartões, compras, bancos e preços.

Dependências

Frontend:
Tailwind CSS (via CDN): Estilização.
Axios (via CDN): Requisições HTTP.
Heroicons (via CDN): Ícones.


Backend:
jsonwebtoken: Geração de tokens JWT.
mongodb: Conexão com MongoDB Atlas.
axios: Requisições HTTP no backend.



Configuração do Ambiente

MongoDB Atlas:
Crie um cluster no MongoDB Atlas.
Configure as coleções: users, cards, purchases, banks, cardprices.
Obtenha a URI de conexão (MONGODB_URI).


Netlify:
Crie um projeto no Netlify e conecte ao repositório do projeto.
Adicione as variáveis de ambiente no painel do Netlify:
MONGODB_URI: URI do MongoDB Atlas.
JWT_SECRET: Chave secreta para tokens JWT.
ADMIN_PASSWORD: Senha padrão para usuários admin.




Estrutura de Diretórios:
Coloque index.html, dashboard.html, shop.html, utils.js, e debug.js no diretório raiz.
Coloque app-function.js em /functions.



Instalação

Clone o repositório:git clone <URL_DO_REPOSITORIO>
cd loganccs


Instale as dependências do backend:npm install


Configure o netlify.toml:[build]
  publish = "."
  functions = "functions"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/app-function/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/dashboard"
  to = "/dashboard.html"
  status = 200

[[redirects]]
  from = "/shop"
  to = "/shop.html"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200


Inicie o servidor local (opcional):netlify dev


Faça o deploy no Netlify:netlify deploy --prod



Uso

Acesse a Aplicação:
Abra <URL_DO_SEU_SITE> (ex.: https://seu-site.netlify.app).
Faça login ou registre-se em index.html.


Loja:
Navegue até /shop.
Use os botões 🛒 Loja e 💼 Carteira para alternar seções.
Aplique filtros (bandeira, banco, nível) para listar cartões.
Clique em "Comprar" para abrir o modal de confirmação e redirecionar ao link de pagamento.


Dashboard (Admin):
Acesse /dashboard (requer login como admin).
Use as abas (👥 Usuários, 💳 Cartões, 💰 Preços) para gerenciar dados.
Visualize logs no painel de depuração.


Feedback:
Mensagens com emojis (⏳, ✅, ❌) aparecem para ações e erros.



Notas

Painel de Depuração:
Presente apenas em dashboard.html para logs administrativos.
Removido de shop.html para melhorar a experiência do usuário final.


Segurança:
Números de cartão e CVVs devem ser criptografados no MongoDB.
Valide números de cartão com o algoritmo Luhn (futuro utils.js).


Acessibilidade:
Atributos ARIA e alto contraste garantem compatibilidade com leitores de tela.


Melhorias Futuras:
Adicionar "Esqueceu a senha?" em index.html.
Implementar validação de força de senha no registro.
Adicionar paginação em /api/cards e /api/purchases.
Incluir botão para alternar visibilidade do painel de depuração em dashboard.html.



Contribuição

Faça um fork do repositório.
Crie uma branch para sua feature:git checkout -b minha-feature


Commit suas alterações:git commit -m "Adiciona minha feature"


Envie para o repositório remoto:git push origin minha-feature


Abra um Pull Request.

Licença
© 2025 LoganCCS. Todos os direitos reservados.
