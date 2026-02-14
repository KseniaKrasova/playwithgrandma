const socket = io();

let myRoomId = null;
let myToken = null;
let myPlayerIndex = null;
let currentState = null;

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

// ── Game state handler ──
socket.on('gameState', (state) => {
  currentState = state;
  lobbyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  render(state);
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
  const sorted = [...state.hand].sort((a, b) => {
    // Sort by suit then by rank value
    const suitOrder = ['♣', '♦', '♥', '♠'];
    const rankValues = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'В': 11, 'Д': 12, 'К': 13, 'Т': 14 };
    // Trump suit always last
    const aIsTrump = a.suit === state.trumpSuit ? 1 : 0;
    const bIsTrump = b.suit === state.trumpSuit ? 1 : 0;
    if (aIsTrump !== bIsTrump) return aIsTrump - bIsTrump;
    const si = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    if (si !== 0) return si;
    return rankValues[a.rank] - rankValues[b.rank];
  });

  sorted.forEach(card => {
    const el = createCardEl(card, state.playableCardIds.includes(card.id));
    if (state.playableCardIds.includes(card.id)) {
      el.addEventListener('click', () => onCardClick(card));
    }
    playerHand.appendChild(el);
  });
}

function createCardEl(card, playable) {
  const div = document.createElement('div');
  const color = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
  div.className = 'card ' + color + (playable ? ' playable' : '');
  div.innerHTML = '<span class="rank">' + card.rank + '</span><span class="suit">' + card.suit + '</span>';
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
  socket.emit('rematch', { roomId: myRoomId }, (res) => {
    if (res.error) console.log('Ошибка:', res.error);
  });
});
