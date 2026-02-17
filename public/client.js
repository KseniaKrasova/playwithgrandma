const socket = io();

let myRoomId = null;
let myToken = null;
let myPlayerIndex = null;
let currentState = null;
let hintTimer = null;
let previousState = null;
let isAnimating = false;

// ── Animation: State diffing ──
function diffStates(oldState, newState) {
  if (!oldState) return null;

  const oldHandIds = new Set(oldState.hand.map(c => String(c.id)));
  const newHandIds = new Set(newState.hand.map(c => String(c.id)));

  const oldTableCardIds = new Set();
  oldState.table.forEach(pair => {
    oldTableCardIds.add(String(pair.attack.id));
    if (pair.defense) oldTableCardIds.add(String(pair.defense.id));
  });

  const newTableCardIds = new Set();
  newState.table.forEach(pair => {
    newTableCardIds.add(String(pair.attack.id));
    if (pair.defense) newTableCardIds.add(String(pair.defense.id));
  });

  // Cards that left our hand and appeared on table
  const handToTable = [];
  oldHandIds.forEach(id => {
    if (!newHandIds.has(id) && newTableCardIds.has(id)) {
      handToTable.push(id);
    }
  });

  // Cards that appeared in our hand (drawn from deck)
  const deckToHand = [];
  newHandIds.forEach(id => {
    if (!oldHandIds.has(id) && !oldTableCardIds.has(id)) {
      deckToHand.push(id);
    }
  });

  // Cards on table that came from opponent (not from our hand, not previously on table)
  const opponentToTable = [];
  newTableCardIds.forEach(id => {
    if (!oldTableCardIds.has(id) && !oldHandIds.has(id)) {
      opponentToTable.push(id);
    }
  });

  // Table was non-empty and is now empty
  const tableCleared = oldState.table.length > 0 && newState.table.length === 0;

  // How many cards opponent drew
  const opponentDrew = Math.max(0, newState.opponentCardCount - oldState.opponentCardCount);

  return { handToTable, deckToHand, opponentToTable, tableCleared, opponentDrew };
}

// ── Animation: Position snapshot helpers ──
function snapshotCardPositions() {
  const positions = {};
  document.querySelectorAll('[data-card-id]').forEach(el => {
    positions[el.dataset.cardId] = el.getBoundingClientRect();
  });
  return positions;
}

function getCenter(el) {
  if (!el) return { x: window.innerWidth / 2, y: 0 };
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function getDeckOrigin() {
  const deckEl = document.getElementById('deckArea');
  return getCenter(deckEl);
}

function getOpponentOrigin() {
  const oppEl = document.getElementById('opponentHand');
  return getCenter(oppEl);
}

// ── Animation: FLIP engine ──
function flipAnimate(el, fromRect, duration) {
  duration = duration || 350;
  const toRect = el.getBoundingClientRect();
  const dx = fromRect.left - toRect.left + (fromRect.width - toRect.width) / 2;
  const dy = fromRect.top - toRect.top + (fromRect.height - toRect.height) / 2;

  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null;

  el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
  el.style.transition = 'none';

  // Force reflow
  void el.offsetHeight;

  el.classList.add('flip-animating');
  el.style.transform = '';
  el.style.transition = '';

  return new Promise(function(resolve) {
    setTimeout(function() {
      el.classList.remove('flip-animating');
      resolve();
    }, duration);
  });
}

function flipAnimateFromPoint(el, origin, duration) {
  duration = duration || 350;
  const toRect = el.getBoundingClientRect();
  const dx = origin.x - (toRect.left + toRect.width / 2);
  const dy = origin.y - (toRect.top + toRect.height / 2);

  el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
  el.style.transition = 'none';

  void el.offsetHeight;

  el.classList.add('flip-animating');
  el.style.transform = '';
  el.style.transition = '';

  return new Promise(function(resolve) {
    setTimeout(function() {
      el.classList.remove('flip-animating');
      resolve();
    }, duration);
  });
}

function animateCardMovements(oldPositions, diff) {
  if (!diff) return;

  var promises = [];
  var deckOrigin = getDeckOrigin();
  var oppOrigin = getOpponentOrigin();

  // Hand → Table: use real old position from snapshot
  diff.handToTable.forEach(function(cardId) {
    var el = document.querySelector('[data-card-id="' + cardId + '"]');
    var oldRect = oldPositions[cardId];
    if (el && oldRect) {
      promises.push(flipAnimate(el, oldRect));
    }
  });

  // Deck → Hand: animate from deck area center
  diff.deckToHand.forEach(function(cardId) {
    var el = document.querySelector('[data-card-id="' + cardId + '"]');
    if (el) {
      promises.push(flipAnimateFromPoint(el, deckOrigin));
    }
  });

  // Opponent → Table: animate from opponent hand center
  diff.opponentToTable.forEach(function(cardId) {
    var el = document.querySelector('[data-card-id="' + cardId + '"]');
    if (el) {
      promises.push(flipAnimateFromPoint(el, oppOrigin));
    }
  });

  // Deck → Opponent: animate last N card-backs from deck origin
  if (diff.opponentDrew > 0) {
    var cardBacks = opponentHand.querySelectorAll('.card-back');
    var startIdx = Math.max(0, cardBacks.length - diff.opponentDrew);
    for (var i = startIdx; i < cardBacks.length; i++) {
      promises.push(flipAnimateFromPoint(cardBacks[i], deckOrigin));
    }
  }

  // Hand reflow: animate remaining hand cards that shifted position
  playerHand.querySelectorAll('[data-card-id]').forEach(function(el) {
    var cardId = el.dataset.cardId;
    var oldRect = oldPositions[cardId];
    if (oldRect && !diff.deckToHand.includes(cardId)) {
      promises.push(flipAnimate(el, oldRect));
    }
  });

  return Promise.all(promises);
}

function animateTableClear(direction, callback) {
  var tableCards = tableEl.querySelectorAll('.card');
  if (tableCards.length === 0) {
    if (callback) callback();
    return;
  }

  var yTarget = direction === 'up' ? -300 : 300;

  tableCards.forEach(function(card) {
    card.style.transition = 'none';
    card.style.transform = '';
    void card.offsetHeight;

    card.classList.add('table-clear-anim');
    card.style.transform = 'translateY(' + yTarget + 'px)';
  });

  setTimeout(function() {
    if (callback) callback();
  }, 400);
}

// ── DOM refs ──
const lobbyEl = document.getElementById('lobby');
const gameEl = document.getElementById('game');
const btnCreate = document.getElementById('btnCreate');
const linkBox = document.getElementById('linkBox');
const shareLink = document.getElementById('shareLink');
const btnCopy = document.getElementById('btnCopy');
const lobbyError = document.getElementById('lobbyError');
const statusBar = document.getElementById('statusBar');
const opponentHand = document.getElementById('opponentHand');
const trumpDisplay = document.getElementById('trumpDisplay');
const deckCount = document.getElementById('deckCount');
const tableEl = document.getElementById('table');
const playerHand = document.getElementById('playerHand');
const btnBeaten = document.getElementById('btnBeaten');
const btnTake = document.getElementById('btnTake');
const btnDoneThrow = document.getElementById('btnDoneThrow');
const gameOverEl = document.getElementById('gameOver');
const gameOverText = document.getElementById('gameOverText');
const btnRematch = document.getElementById('btnRematch');

// ── Auto-join from URL ──
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) {
  const savedToken = sessionStorage.getItem('durak_token_' + roomFromUrl);
  socket.emit('joinRoom', { roomId: roomFromUrl, token: savedToken }, (res) => {
    if (res.error) {
      showLobbyError(res.error);
      return;
    }
    myRoomId = res.roomId;
    myToken = res.token || savedToken;
    myPlayerIndex = res.playerIndex;
    sessionStorage.setItem('durak_token_' + myRoomId, myToken);
    // Game state will come via 'gameState' event when both joined
    if (!res.reconnected) {
      // Waiting for game to start
    }
  });
}

// ── Lobby events ──
btnCreate.addEventListener('click', () => {
  socket.emit('createRoom', (res) => {
    if (res.error) {
      showLobbyError(res.error);
      return;
    }
    myRoomId = res.roomId;
    myToken = res.token;
    myPlayerIndex = res.playerIndex;
    sessionStorage.setItem('durak_token_' + myRoomId, myToken);

    const link = window.location.origin + '/?room=' + myRoomId;
    shareLink.value = link;
    linkBox.classList.remove('hidden');
  });
});

btnCopy.addEventListener('click', () => {
  shareLink.select();
  navigator.clipboard.writeText(shareLink.value).then(() => {
    btnCopy.textContent = 'Скопировано!';
    setTimeout(() => btnCopy.textContent = 'Копировать', 2000);
  });
});

function showLobbyError(msg) {
  lobbyError.textContent = msg;
  lobbyError.classList.remove('hidden');
}

// ── Game state handler (animation-aware) ──
socket.on('gameState', (state) => {
  lobbyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');

  var oldState = previousState;
  previousState = state;
  currentState = state;

  // First render — no animation
  if (!oldState) {
    render(state);
    return;
  }

  // If already animating, render immediately without animation
  if (isAnimating) {
    render(state);
    return;
  }

  var diff = diffStates(oldState, state);
  if (!diff) {
    render(state);
    return;
  }

  isAnimating = true;

  if (diff.tableCleared) {
    // Determine clear direction: 'up' = beaten (cards discarded), 'down' = taken (toward defender)
    // If opponent card count grew by table card count, they took; otherwise beaten
    var oldTableCount = 0;
    oldState.table.forEach(function(p) { oldTableCount += p.defense ? 2 : 1; });
    var oppGrew = state.opponentCardCount > oldState.opponentCardCount;
    var weGrew = state.hand.length > oldState.hand.length;
    var direction = (oppGrew || weGrew) ? 'down' : 'up';

    animateTableClear(direction, function() {
      // After table cards animate out, snapshot, render, and animate draws
      var positions = snapshotCardPositions();
      render(state);
      var drawDiff = {
        handToTable: [],
        deckToHand: diff.deckToHand,
        opponentToTable: [],
        tableCleared: false,
        opponentDrew: diff.opponentDrew
      };
      animateCardMovements(positions, drawDiff);
      setTimeout(function() { isAnimating = false; }, 400);
    });
  } else {
    // Normal path: snapshot → render → animate
    var positions = snapshotCardPositions();
    render(state);
    animateCardMovements(positions, diff);
    setTimeout(function() { isAnimating = false; }, 400);
  }
});

// ── Render ──
function render(state) {
  renderStatus(state);
  renderOpponent(state);
  renderDeck(state);
  renderTable(state);
  renderPlayerHand(state);
  renderControls(state);
  renderGameOver(state);
}

function renderStatus(state) {
  const phaseLabels = {
    ATTACKING: state.isAttacker ? 'Ваш ход — атакуйте!' : 'Противник атакует...',
    DEFENDING: state.isDefender ? 'Защищайтесь!' : 'Противник отбивается...',
    THROWING_IN: state.isAttacker ? 'Подкидывайте карты или нажмите «Хватит»' : 'Противник подкидывает...',
    GAME_OVER: 'Игра окончена!',
  };
  const trumpLabel = state.trumpSuit;
  statusBar.textContent = (phaseLabels[state.phase] || '') + '  |  Козырь: ' + trumpLabel;
}

function renderOpponent(state) {
  opponentHand.innerHTML = '';
  for (let i = 0; i < state.opponentCardCount; i++) {
    const div = document.createElement('div');
    div.className = 'card-back';
    div.innerHTML = '<img src="cards/back.png" alt="card back" draggable="false">';
    opponentHand.appendChild(div);
  }
}

function renderDeck(state) {
  trumpDisplay.innerHTML = '';
  if (state.trumpCard) {
    trumpDisplay.appendChild(createCardEl(state.trumpCard));
  }
  deckCount.textContent = state.deckCount > 0 ? ('В колоде: ' + state.deckCount) : 'Колода пуста';
}

function renderTable(state) {
  tableEl.innerHTML = '';
  state.table.forEach((pair, idx) => {
    const pairDiv = document.createElement('div');
    pairDiv.className = 'table-pair';

    const attackEl = createCardEl(pair.attack, false);
    if (!pair.defense) attackEl.classList.add('unbeaten');
    pairDiv.appendChild(attackEl);

    if (pair.defense) {
      pairDiv.appendChild(createCardEl(pair.defense, false));
    }
    tableEl.appendChild(pairDiv);
  });
}

function renderPlayerHand(state) {
  playerHand.innerHTML = '';
  clearTimeout(hintTimer);

  const sorted = [...state.hand].sort((a, b) => {
    const suitOrder = ['♣', '♦', '♥', '♠'];
    const rankValues = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'В': 11, 'Д': 12, 'К': 13, 'Т': 14 };
    const aIsTrump = a.suit === state.trumpSuit ? 1 : 0;
    const bIsTrump = b.suit === state.trumpSuit ? 1 : 0;
    if (aIsTrump !== bIsTrump) return aIsTrump - bIsTrump;
    const si = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    if (si !== 0) return si;
    return rankValues[a.rank] - rankValues[b.rank];
  });

  sorted.forEach(card => {
    const el = createCardEl(card, false);
    if (state.playableCardIds.includes(card.id)) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => onCardClick(card));
    }
    playerHand.appendChild(el);
  });

  hintTimer = setTimeout(() => {
    state.playableCardIds.forEach(id => {
      const el = playerHand.querySelector('[data-card-id="' + id + '"]');
      if (el) el.classList.add('playable');
    });
  }, 15000);
}

const RANK_TO_FILE = { '6': '6', '7': '7', '8': '8', '9': '9', '10': '10', 'В': 'J', 'Д': 'Q', 'К': 'K', 'Т': 'A' };
const SUIT_TO_FILE = { '♣': 'clubs', '♦': 'diamonds', '♥': 'hearts', '♠': 'spades' };

function cardImageSrc(card) {
  return 'cards/' + RANK_TO_FILE[card.rank] + '-' + SUIT_TO_FILE[card.suit] + '.png';
}

function createCardEl(card, playable) {
  const div = document.createElement('div');
  div.className = 'card' + (playable ? ' playable' : '');
  div.innerHTML = '<img src="' + cardImageSrc(card) + '" alt="' + card.rank + card.suit + '" draggable="false">';
  div.dataset.cardId = card.id;
  return div;
}

function renderControls(state) {
  btnBeaten.classList.add('hidden');
  btnTake.classList.add('hidden');
  btnDoneThrow.classList.add('hidden');

  if (state.phase === 'GAME_OVER') return;

  // "Бита" — attacker can say when all cards on table are covered and there's at least one pair
  if (state.isAttacker && state.phase === 'ATTACKING' && state.table.length > 0) {
    const allCovered = state.table.every(p => p.defense);
    if (allCovered) {
      btnBeaten.classList.remove('hidden');
    }
  }

  // "Беру" — defender can say during defense
  if (state.isDefender && (state.phase === 'DEFENDING' || state.phase === 'THROWING_IN')) {
    if (!state.defenderTakes) {
      btnTake.classList.remove('hidden');
    }
  }

  // "Хватит" — attacker done throwing in
  if (state.isAttacker && state.phase === 'THROWING_IN') {
    btnDoneThrow.classList.remove('hidden');
  }
}

function renderGameOver(state) {
  if (state.phase !== 'GAME_OVER') {
    gameOverEl.classList.add('hidden');
    return;
  }
  gameOverEl.classList.remove('hidden');
  if (state.winner === -1) {
    gameOverText.textContent = 'Ничья!';
  } else if (state.winner === state.playerIndex) {
    gameOverText.textContent = 'Вы победили! Противник — дурак!';
  } else {
    gameOverText.textContent = 'Вы проиграли... Вы — дурак!';
  }
}

// ── Actions ──
function onCardClick(card) {
  if (!currentState) return;

  // If defending and there are multiple uncovered cards, find first uncovered
  const targetPairIndex = currentState.phase === 'DEFENDING'
    ? currentState.table.findIndex(p => !p.defense)
    : undefined;

  socket.emit('playCard', {
    roomId: myRoomId,
    cardId: card.id,
    targetPairIndex,
  }, (res) => {
    if (res.error) {
      console.log('Ошибка:', res.error);
    }
  });
}

btnBeaten.addEventListener('click', () => {
  socket.emit('beaten', { roomId: myRoomId }, (res) => {
    if (res.error) console.log('Ошибка:', res.error);
  });
});

btnTake.addEventListener('click', () => {
  socket.emit('take', { roomId: myRoomId }, (res) => {
    if (res.error) console.log('Ошибка:', res.error);
  });
});

btnDoneThrow.addEventListener('click', () => {
  socket.emit('finishThrowIn', { roomId: myRoomId }, (res) => {
    if (res.error) console.log('Ошибка:', res.error);
  });
});

btnRematch.addEventListener('click', () => {
  previousState = null;
  isAnimating = false;
  socket.emit('rematch', { roomId: myRoomId }, (res) => {
    if (res.error) console.log('Ошибка:', res.error);
  });
});
