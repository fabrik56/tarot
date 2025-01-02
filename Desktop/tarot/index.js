const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Servir les fichiers statiques pour l'interface utilisateur
app.use(express.static('public'));

// Liste des joueurs connectés
let players = [];
let hands = []; // Les mains des joueurs
let chien = []; // Les cartes du chien
let currentTurn = 0; // Index du joueur qui doit jouer
let playedCards = []; // Cartes jouées dans le pli actuel

// Création du paquet de cartes
const createDeck = () => {
  const suits = ['Cœur', 'Carreau', 'Trèfle', 'Pique'];
  const deck = [];

  // Cartes classiques
  suits.forEach((suit) => {
    for (let i = 1; i <= 10; i++) {
      deck.push(`${i} de ${suit}`);
    }
    deck.push(`Valet de ${suit}`);
    deck.push(`Cavalier de ${suit}`);
    deck.push(`Dame de ${suit}`);
    deck.push(`Roi de ${suit}`);
  });

  // Atouts et Excuse
  for (let i = 1; i <= 21; i++) {
    deck.push(`${i} d'Atout`);
  }
  deck.push('Excuse');
  return deck;
};

// Mélanger le paquet
const shuffle = (deck) => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

// Distribuer les cartes aux joueurs et créer le chien
const distribuerCartes = (deck) => {
  const playersHands = [[], [], [], [], []];
  for (let i = 0; i < 15; i++) {
    playersHands.forEach((hand) => {
      hand.push(deck.pop());
    });
  }
  const chien = deck.slice(-6); // Les 6 dernières cartes forment le chien
  return { playersHands, chien };
};

// Gestion des connexions des joueurs
io.on('connection', (socket) => {
  console.log(`Joueur connecté : ${socket.id}`);

  // Ajouter le joueur
  if (players.length < 5) {
    players.push(socket.id);
    socket.emit('welcome', `Bienvenue joueur ${players.length}`);
    io.emit('updatePlayers', players);

    // Démarrer la partie lorsque 5 joueurs sont connectés
    if (players.length === 5) {
      const deck = shuffle(createDeck());
      const { playersHands, chien: distributedChien } = distribuerCartes(deck);
      hands = playersHands;
      chien = distributedChien;

      players.forEach((playerId, index) => {
        io.to(playerId).emit('cards', hands[index]); // Envoie les cartes à chaque joueur
      });

      io.emit('startGame', 'La partie commence ! Les cartes ont été distribuées.');
      io.emit('chien', `Le chien contient : ${chien.join(', ')}`);
    }
  } else {
    socket.emit('error', 'Le jeu est complet.');
    socket.disconnect();
  }

  // Jouer une carte
  socket.on('playCard', (card) => {
    const playerIndex = players.indexOf(socket.id);
    if (playerIndex !== currentTurn) {
      socket.emit('error', 'Ce n’est pas votre tour !');
      return;
    }

    // Vérifier si le joueur possède la carte
    if (!hands[playerIndex].includes(card)) {
      socket.emit('error', 'Vous ne possédez pas cette carte !');
      return;
    }

    // Retirer la carte de la main du joueur et l’ajouter aux cartes jouées
    hands[playerIndex] = hands[playerIndex].filter((c) => c !== card);
    playedCards.push({ playerId: socket.id, card });

    io.emit('cardPlayed', { playerId: socket.id, card });

    // Passer au joueur suivant
    currentTurn = (currentTurn + 1) % players.length;

    if (playedCards.length === players.length) {
      // Pli terminé, afficher les cartes jouées
      io.emit('endOfRound', `Les cartes jouées : ${playedCards.map((c) => c.card).join(', ')}`);
      playedCards = []; // Réinitialiser pour le prochain pli
    } else {
      io.emit('nextTurn', `C’est au joueur ${currentTurn + 1} de jouer.`);
    }
  });

  // Gestion de la déconnexion
  socket.on('disconnect', () => {
    console.log(`Joueur déconnecté : ${socket.id}`);
    players = players.filter((player) => player !== socket.id);
    io.emit('updatePlayers', players);
  });
});

// Lancer le serveur
server.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
