const { RANK_VALUES, HAND_SIZE, PHASES } = require('./constants');
const { createDeck, shuffle } = require('./deck');

function createGame() {
  const deck = shuffle(createDeck());
  const trumpCard = deck[0]; // bottom card is trump
  const trumpSuit = trumpCard.suit;

  const hands = [[], []];
  // Deal 6 cards to each player
  for (let i = 0; i < HAND_SIZE; i++) {
    hands[0].push(deck.pop());
    hands[1].push(deck.pop());
  }

  // Determine who attacks first: player with lowest trump card
  const firstAttacker = pickFirstAttacker(hands, trumpSuit);

  return {
    deck,
    trumpCard,
    trumpSuit,
    hands,
    table: [],          // [{ attack: card, defense: card|null }]
    phase: PHASES.ATTACKING,
    attacker: firstAttacker,
    defender: 1 - firstAttacker,
    defenderTakes: false,
    winner: null,
  };
}

function pickFirstAttacker(hands, trumpSuit) {
  let lowestTrump = null;
  let lowestPlayer = 0;

  for (let p = 0; p < 2; p++) {
    for (const card of hands[p]) {
      if (card.suit === trumpSuit) {
        const val = RANK_VALUES[card.rank];
        if (lowestTrump === null || val < lowestTrump) {
          lowestTrump = val;
          lowestPlayer = p;
        }
      }
    }
  }
  return lowestPlayer;
}

function getTableRanks(table) {
  const ranks = new Set();
  for (const pair of table) {
    ranks.add(pair.attack.rank);
    if (pair.defense) ranks.add(pair.defense.rank);
  }
  return ranks;
}

function canBeat(attackCard, defenseCard, trumpSuit) {
  if (defenseCard.suit === attackCard.suit) {
    return RANK_VALUES[defenseCard.rank] > RANK_VALUES[attackCard.rank];
  }
  if (defenseCard.suit === trumpSuit && attackCard.suit !== trumpSuit) {
    return true;
  }
  return false;
}

function getPlayableCards(game, playerIndex) {
  const hand = game.hands[playerIndex];

  if (game.phase === PHASES.ATTACKING) {
    if (playerIndex !== game.attacker) return [];
    if (game.table.length === 0) {
      return hand.map(c => c.id); // can play any card as first attack
    }
    // Subsequent attacks: only ranks already on the table
    const ranks = getTableRanks(game.table);
    const maxCards = Math.min(6, game.hands[game.defender].length);
    const uncovered = game.table.filter(p => !p.defense).length;
    if (uncovered > 0) return []; // must wait for defense or take
    if (game.table.length >= maxCards) return [];
    return hand.filter(c => ranks.has(c.rank)).map(c => c.id);
  }

  if (game.phase === PHASES.DEFENDING) {
    if (playerIndex !== game.defender) return [];
    const uncovered = game.table.find(p => !p.defense);
    if (!uncovered) return [];
    return hand
      .filter(c => canBeat(uncovered.attack, c, game.trumpSuit))
      .map(c => c.id);
  }

  if (game.phase === PHASES.THROWING_IN) {
    if (playerIndex === game.defender) return [];
    // Attacker can throw in cards with matching ranks, up to 6 total on table
    const ranks = getTableRanks(game.table);
    if (game.table.length >= 6) return [];
    return hand.filter(c => ranks.has(c.rank)).map(c => c.id);
  }

  return [];
}

function playCard(game, playerIndex, cardId, targetPairIndex) {
  const hand = game.hands[playerIndex];
  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return { error: 'Карта не найдена в руке' };

  const playable = getPlayableCards(game, playerIndex);
  if (!playable.includes(cardId)) return { error: 'Нельзя сыграть эту карту' };

  const card = hand[cardIndex];

  if (game.phase === PHASES.ATTACKING) {
    hand.splice(cardIndex, 1);
    game.table.push({ attack: card, defense: null });
    game.phase = PHASES.DEFENDING;
    return { ok: true };
  }

  if (game.phase === PHASES.DEFENDING) {
    // Find the uncovered attack card to defend against
    const pairIdx = targetPairIndex != null
      ? targetPairIndex
      : game.table.findIndex(p => !p.defense);
    if (pairIdx === -1 || pairIdx >= game.table.length) return { error: 'Нечего отбивать' };
    const pair = game.table[pairIdx];
    if (pair.defense) return { error: 'Эта карта уже отбита' };
    if (!canBeat(pair.attack, card, game.trumpSuit)) return { error: 'Нельзя побить этой картой' };

    hand.splice(cardIndex, 1);
    pair.defense = card;

    // Check if all attacks are covered
    const allCovered = game.table.every(p => p.defense);
    if (allCovered) {
      game.phase = PHASES.ATTACKING;
      // Attacker can continue or say "бита"
    }
    return { ok: true };
  }

  if (game.phase === PHASES.THROWING_IN) {
    hand.splice(cardIndex, 1);
    game.table.push({ attack: card, defense: null });
    return { ok: true };
  }

  return { error: 'Сейчас нельзя ходить' };
}

function declareBeaten(game, playerIndex) {
  // Attacker says "Бита" — round is done, discard table
  if (playerIndex !== game.attacker) return { error: 'Только атакующий может сказать «Бита»' };
  if (game.phase !== PHASES.ATTACKING) return { error: 'Сейчас нельзя сказать «Бита»' };
  if (game.table.length === 0) return { error: 'Нет карт на столе' };
  const allCovered = game.table.every(p => p.defense);
  if (!allCovered) return { error: 'Не все карты отбиты' };

  game.table = [];
  drawCards(game);

  // Check win condition
  const over = checkGameOver(game);
  if (over) return { ok: true };

  // Roles swap: defender becomes attacker
  const newAttacker = game.defender;
  game.attacker = newAttacker;
  game.defender = 1 - newAttacker;
  game.phase = PHASES.ATTACKING;
  return { ok: true };
}

function declareTake(game, playerIndex) {
  // Defender says "Беру"
  if (playerIndex !== game.defender) return { error: 'Только защищающийся может сказать «Беру»' };
  if (game.phase !== PHASES.DEFENDING && game.phase !== PHASES.THROWING_IN) {
    return { error: 'Сейчас нельзя сказать «Беру»' };
  }

  game.defenderTakes = true;
  game.phase = PHASES.THROWING_IN;
  return { ok: true };
}

function finishThrowingIn(game, playerIndex) {
  // Attacker is done throwing in
  if (playerIndex !== game.attacker) return { error: 'Только атакующий может завершить подкидывание' };
  if (game.phase !== PHASES.THROWING_IN) return { error: 'Сейчас нельзя завершить' };

  // Defender picks up all table cards
  const defenderHand = game.hands[game.defender];
  for (const pair of game.table) {
    defenderHand.push(pair.attack);
    if (pair.defense) defenderHand.push(pair.defense);
  }
  game.table = [];
  game.defenderTakes = false;

  drawCards(game);

  const over = checkGameOver(game);
  if (over) return { ok: true };

  // Attacker keeps attacking (defender took, so attacker stays the same)
  game.phase = PHASES.ATTACKING;
  return { ok: true };
}

function drawCards(game) {
  // Attacker draws first, then defender
  const order = [game.attacker, game.defender];
  for (const p of order) {
    while (game.hands[p].length < HAND_SIZE && game.deck.length > 0) {
      game.hands[p].push(game.deck.pop());
    }
  }
}

function checkGameOver(game) {
  if (game.deck.length > 0) return false;

  const empty = [game.hands[0].length === 0, game.hands[1].length === 0];
  if (empty[0] && empty[1]) {
    // Draw
    game.phase = PHASES.GAME_OVER;
    game.winner = -1; // draw
    return true;
  }
  if (empty[0]) {
    game.phase = PHASES.GAME_OVER;
    game.winner = 0;
    return true;
  }
  if (empty[1]) {
    game.phase = PHASES.GAME_OVER;
    game.winner = 1;
    return true;
  }
  return false;
}

function getStateForPlayer(game, playerIndex) {
  return {
    hand: game.hands[playerIndex],
    opponentCardCount: game.hands[1 - playerIndex].length,
    table: game.table,
    trumpCard: game.deck.length > 0 ? game.trumpCard : null,
    trumpSuit: game.trumpSuit,
    deckCount: game.deck.length,
    phase: game.phase,
    attacker: game.attacker,
    defender: game.defender,
    isAttacker: playerIndex === game.attacker,
    isDefender: playerIndex === game.defender,
    defenderTakes: game.defenderTakes,
    playableCardIds: getPlayableCards(game, playerIndex),
    winner: game.winner,
    playerIndex,
  };
}

module.exports = {
  createGame,
  playCard,
  declareBeaten,
  declareTake,
  finishThrowingIn,
  getStateForPlayer,
  getPlayableCards,
};
