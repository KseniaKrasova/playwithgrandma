const { SUITS, RANKS } = require('./constants');

function createDeck() {
  const deck = [];
  let id = 0;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: id++, suit, rank });
    }
  }
  return deck;
}

function shuffle(deck) {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { createDeck, shuffle };
