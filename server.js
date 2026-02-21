const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createRoom, getRoom, joinRoom, reconnect, disconnectPlayer, getPlayerBySocket } = require('./game/room');
const { createGame, playCard, declareBeaten, declareTake, finishThrowingIn, getStateForPlayer } = require('./game/gameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// REST endpoint for Telegram bot to create rooms
app.post('/api/create-room', (req, res) => {
  const room = createRoom();
  res.json({ roomId: room.id });
});

function broadcastState(room) {
  for (const player of room.players) {
    const state = getStateForPlayer(room.game, player.index);
    io.to(player.socketId).emit('gameState', state);
  }
}

io.on('connection', (socket) => {
  socket.on('createRoom', (cb) => {
    const room = createRoom();
    const result = joinRoom(room.id, socket.id);
    if (result.error) return cb({ error: result.error });
    socket.join(room.id);
    cb({ roomId: room.id, token: result.token, playerIndex: result.playerIndex });
  });

  socket.on('joinRoom', ({ roomId, token }, cb) => {
    // Try reconnect first
    if (token) {
      const rec = reconnect(roomId, token, socket.id);
      if (rec) {
        socket.join(roomId);
        if (rec.room.game) {
          broadcastState(rec.room);
        }
        return cb({ roomId, token, playerIndex: rec.playerIndex, reconnected: true });
      }
    }

    const result = joinRoom(roomId, socket.id);
    if (result.error) return cb({ error: result.error });
    socket.join(roomId);

    // If 2 players, start the game
    if (result.room.players.length === 2) {
      result.room.game = createGame();
      broadcastState(result.room);
    }

    cb({ roomId, token: result.token, playerIndex: result.playerIndex });
  });

  socket.on('playCard', ({ roomId, cardId, targetPairIndex }, cb) => {
    const room = getRoom(roomId);
    if (!room || !room.game) return cb({ error: 'Игра не найдена' });
    const player = getPlayerBySocket(room, socket.id);
    if (!player) return cb({ error: 'Игрок не найден' });

    const result = playCard(room.game, player.index, cardId, targetPairIndex);
    if (result.error) return cb(result);

    broadcastState(room);
    cb({ ok: true });
  });

  socket.on('beaten', ({ roomId }, cb) => {
    const room = getRoom(roomId);
    if (!room || !room.game) return cb({ error: 'Игра не найдена' });
    const player = getPlayerBySocket(room, socket.id);
    if (!player) return cb({ error: 'Игрок не найден' });

    const result = declareBeaten(room.game, player.index);
    if (result.error) return cb(result);

    broadcastState(room);
    cb({ ok: true });
  });

  socket.on('take', ({ roomId }, cb) => {
    const room = getRoom(roomId);
    if (!room || !room.game) return cb({ error: 'Игра не найдена' });
    const player = getPlayerBySocket(room, socket.id);
    if (!player) return cb({ error: 'Игрок не найден' });

    const result = declareTake(room.game, player.index);
    if (result.error) return cb(result);

    broadcastState(room);
    cb({ ok: true });
  });

  socket.on('finishThrowIn', ({ roomId }, cb) => {
    const room = getRoom(roomId);
    if (!room || !room.game) return cb({ error: 'Игра не найдена' });
    const player = getPlayerBySocket(room, socket.id);
    if (!player) return cb({ error: 'Игрок не найден' });

    const result = finishThrowingIn(room.game, player.index);
    if (result.error) return cb(result);

    broadcastState(room);
    cb({ ok: true });
  });

  socket.on('disconnect', () => {
    disconnectPlayer(socket.id);
  });

  socket.on('rematch', ({ roomId }, cb) => {
    const room = getRoom(roomId);
    if (!room) return cb({ error: 'Комната не найдена' });

    const prevGame = room.game;
    let firstAttacker = null;
    if (prevGame && prevGame.winner != null && prevGame.winner !== -1) {
      firstAttacker = 1 - prevGame.winner; // loser starts
    }

    room.game = createGame(firstAttacker);
    broadcastState(room);
    cb({ ok: true });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Дурак запущен: http://localhost:${PORT}`);
});
