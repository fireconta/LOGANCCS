function debugLog(message) {
  const debug = document.getElementById('debug');
  if (debug) {
    const timestamp = new Date().toLocaleTimeString();
    debug.innerHTML += `[${timestamp}] ${message}<br>`;
    debug.scrollTop = debug.scrollHeight;
  }
  console.log(`[${timestamp}] ${message}`);
}

function formatCurrency(value) {
  return `R$ ${value.toFixed(2)}`;
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => screen.style.display = 'none');
  document.getElementById(screenId).style.display = 'block';
  debugLog(`Exibindo tela: ${screenId}`);
}

async function loadBalance() {
  try {
    const res = await fetch(`/api/balance?userId=${localStorage.getItem('userId')}`);
    const data = await res.json();
    if (res.status !== 200) throw new Error(data.error);
    document.getElementById('balance').textContent = formatCurrency(data.balance);
    document.getElementById('balance-dashboard').textContent = formatCurrency(data.balance);
    debugLog('Saldo carregado: ' + formatCurrency(data.balance));
  } catch (err) {
    debugLog('Erro ao carregar saldo: ' + err.message);
  }
}

async function loadCards() {
  try {
    const res = await fetch('/api/cards');
    const cards = await res.json();
    if (res.status !== 200) throw new Error(cards.error);
    const cardsDiv = document.getElementById('cards');
    cardsDiv.innerHTML = '';
    cards.forEach(card => {
      const cardDiv = document.createElement('div');
      cardDiv.className = 'card';
      cardDiv.innerHTML = `
        <p>Cartão ${card.bandeira} ${card.nivel} - ${formatCurrency(card.price)}</p>
        <p>Banco: ${card.banco}</p>
        <button onclick="buyCard('${card._id}', ${card.price})">Comprar</button>
      `;
      cardsDiv.appendChild(cardDiv);
    });
    debugLog('Cartões carregados: ' + cards.length);
  } catch (err) {
    debugLog('Erro ao carregar cartões: ' + err.message);
  }
}

async function buyCard(cardId, price) {
  try {
    debugLog('Comprando cartão ' + cardId);
    const res = await fetch('/api/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: localStorage.getItem('userId'), cardId, price })
    });
    const data = await res.json();
    if (res.status !== 200) throw new Error(data.error);
    debugLog(`Cartão ${cardId} comprado. Novo saldo: ${formatCurrency(data.newBalance)}`);
    await loadBalance();
    await loadCards();
  } catch (err) {
    debugLog('Erro ao comprar: ' + err.message);
  }
}

async function loadTransactions() {
  try {
    const res = await fetch(`/api/transactions?userId=${localStorage.getItem('userId')}`);
    const transactions = await res.json();
    if (res.status !== 200) throw new Error(transactions.error);
    const transactionsDiv = document.getElementById('transactions');
    transactionsDiv.innerHTML = '';
    transactions.forEach(tx => {
      const txDiv = document.createElement('div');
      txDiv.className = 'transaction';
      txDiv.innerHTML = `
        <p>${tx.description} - ${formatCurrency(tx.amount)}</p>
        <p>${new Date(tx.timestamp).toLocaleString()}</p>
      `;
      transactionsDiv.appendChild(txDiv);
    });
    debugLog('Transações carregadas: ' + transactions.length);
  } catch (err) {
    debugLog('Erro ao carregar transações: ' + err.message);
  }
}

async function deposit() {
  const amount = parseFloat(document.getElementById('depositAmount').value);
  if (!amount || amount <= 0) {
    debugLog('Valor de depósito inválido');
    return;
  }
  try {
    debugLog('Depositando ' + formatCurrency(amount));
    const res = await fetch('/api/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: localStorage.getItem('userId'), amount })
    });
    const data = await res.json();
    if (res.status !== 200) throw new Error(data.error);
    debugLog(`Depósito de ${formatCurrency(amount)} realizado. Novo saldo: ${formatCurrency(data.newBalance)}`);
    await loadBalance();
    await loadTransactions();
  } catch (err) {
    debugLog('Erro ao depositar: ' + err.message);
  }
}

debugLog('script.js carregado com sucesso');
