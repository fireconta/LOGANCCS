/**
 * script.js - Configurações para LOGAN CC's
 */
window.addLog('script.js carregado com sucesso', 'log');

window.firebaseConfig = {
    apiKey: "AIzaSyDM3k33LjBRZmm9nXzLsABlxef_zaOmAKU",
    authDomain: "loganccs-b030c.firebaseapp.com",
    projectId: "loganccs-b030c",
    storageBucket: "loganccs-b030c.firebasestorage.app",
    messagingSenderId: "1022430732687",
    appId: "1:1022430732687:web:40bd56c677f7f95e6d6bfa",
    measurementId: "G-GPY8ET904E"
};

window.state = {
    logs: []
};

window.addLog = function(message, type = 'log') {
    const timestamp = new Date().toLocaleTimeString();
    window.state.logs.push({ message, type, timestamp });
    console[type === 'error' ? 'error' : 'log'](`[${timestamp}] ${message}`);
    const debugDiv = document.getElementById('debug');
    if (debugDiv) {
        debugDiv.innerHTML += `<div class="${type}">[${timestamp}] ${message}</div>`;
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
};

window.utils = {
    async initializeDatabase(db, ui) {
        try {
            window.addLog('Iniciando configuração do Firestore...');
            // Criar coleção users
            const usersSnapshot = await db.collection('users').get();
            if (usersSnapshot.empty) {
                const user = {
                    username: "LVz",
                    password: "123456",
                    balance: 1000.00,
                    is_admin: true,
                    created_at: new Date().toISOString()
                };
                const docRef = await db.collection('users').add(user);
                window.addLog(`Usuário ${user.username} criado com ID ${docRef.id}`);
                ui.showNotification(`Usuário ${user.username} criado!`, 'success');
            } else {
                window.addLog('Coleção users já existe');
            }

            // Criar coleção cards
            const cardsSnapshot = await db.collection('cards').get();
            if (cardsSnapshot.empty) {
                const card = {
                    numero: "4532015112830366",
                    cvv: "123",
                    expiry: "12/27",
                    name: "João Silva",
                    cpf: "12345678901",
                    bandeira: "Visa",
                    banco: "Nubank",
                    nivel: "Platinum",
                    price: 25.00,
                    bin: "453201",
                    acquired: false,
                    user_id: null,
                    created_at: new Date().toISOString()
                };
                const docRef = await db.collection('cards').add(card);
                window.addLog(`Cartão ${card.numero.slice(-4)} criado com ID ${docRef.id}`);
                ui.showNotification(`Cartão ${card.numero.slice(-4)} criado!`, 'success');
            } else {
                window.addLog('Coleção cards já existe');
            }

            window.addLog('Firestore configurado com sucesso');
            ui.showNotification('Firestore configurado!', 'success');
        } catch (err) {
            window.addLog(`Erro ao configurar Firestore: ${err.message}`, 'error');
            ui.showNotification(`Erro Firestore: ${err.message}`, 'error');
        }
    }
};
