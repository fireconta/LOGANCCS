/**
 * firebase-init.js - Inicialização do Firebase e Firestore
 */
window.addLog('firebase-init.js carregado', 'log');

window.firebaseConfig = {
    apiKey: "AIzaSyDM3k33LjBRZmm9nXzLsABlxef_zaOmAKU",
    authDomain: "loganccs-b030c.firebaseapp.com",
    projectId: "loganccs-b030c",
    storageBucket: "loganccs-b030c.firebasestorage.app",
    messagingSenderId: "1022430732687",
    appId: "1:1022430732687:web:40bd56c677f7f95e6d6bfa",
    measurementId: "G-GPY8ET904E"
};

window.utils = window.utils || {};
window.utils.initializeDatabase = async function(db, ui) {
    window.addLog('Iniciando Firestore...');
    try {
        const usersRef = db.collection('users');
        const usersSnapshot = await usersRef.get();
        if (usersSnapshot.empty) {
            const user = {
                username: "LVz",
                password: "123456",
                balance: 1000.00,
                is_admin: true,
                created_at: new Date().toISOString()
            };
            const docRef = await usersRef.add(user);
            window.addLog(`Usuário LVz criado, ID: ${docRef.id}`);
            ui.showNotification('Usuário LVz criado!', 'success');
        } else {
            window.addLog('Coleção users já existe');
        }

        const cardsRef = db.collection('cards');
        const cardsSnapshot = await cardsRef.get();
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
            const docRef = await cardsRef.add(card);
            window.addLog(`Cartão 0366 criado, ID: ${docRef.id}`);
            ui.showNotification('Cartão 0366 criado!', 'success');
        } else {
            window.addLog('Coleção cards já existe');
        }

        window.addLog('Firestore configurado');
        ui.showNotification('Firestore OK!', 'success');
    } catch (err) {
        window.addLog(`Erro Firestore: ${err.message}`, 'error');
        ui.showNotification(`Erro Firestore: ${err.message}`, 'error');
        alert(`Erro Firestore: ${err.message}`);
    }
};
