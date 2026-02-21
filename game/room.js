const { v4: uuidv4 } = require('uuid');

const rooms = new Map();
const disconnectTimers = new Map(); // token -> timeout id

const DISCONNECT_TIMEOUT = 30000; // 30 seconds to reconnect

function createRoom() {
  const roomId = uuidv4().slice(0, 8);
  const room = {
    id: roomId,
    players: [],       // [{ socketId, token, index, connected }]
    game: null,
  };
  rooms.set(roomId, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function joinRoom(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Комната не найдена' };

  // If room is full, check if any player is disconnected and replace them
  if (room.players.length >= 2) {
    const disconnected = room.players.find(p => !p.connected);
    if (disconnected) {
      // Clear any pending cleanup timer
      const oldTimer = disconnectTimers.get(disconnected.token);
      if (oldTimer) {
        clearTimeout(oldTimer);
        disconnectTimers.delete(disconnected.token);
      }
      // Replace disconnected player
      const token = uuidv4();
      disconnected.socketId = socketId;
      disconnected.token = token;
      disconnected.connected = true;
      return { room, token, playerIndex: disconnected.index };
    }
    return { error: 'Комната заполнена' };
  }

  const token = uuidv4();
  const playerIndex = room.players.length;
  room.players.push({ socketId, token, index: playerIndex, connected: true });
  return { room, token, playerIndex };
}

function reconnect(roomId, token, newSocketId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const player = room.players.find(p => p.token === token);
  if (!player) return null;

  // Clear any pending cleanup timer
  const timer = disconnectTimers.get(token);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(token);
  }

  player.socketId = newSocketId;
  player.connected = true;
  return { room, playerIndex: player.index };
}

function disconnectPlayer(socketId) {
  for (const [roomId, room] of rooms) {
    const player = room.players.find(p => p.socketId === socketId);
    if (player) {
      player.connected = false;
      // Start cleanup timer — remove player after timeout
      const timer = setTimeout(() => {
        disconnectTimers.delete(player.token);
        // If game hasn't started yet, remove the player entirely
        if (!room.game) {
          room.players = room.players.filter(p => p.token !== player.token);
          // If room is empty, delete it
          if (room.players.length === 0) {
            rooms.delete(roomId);
          }
        }
        // If game is in progress, just leave them as disconnected
        // so they can still reconnect with token
      }, DISCONNECT_TIMEOUT);
      disconnectTimers.set(player.token, timer);
      return { room, player };
    }
  }
  return null;
}

function getPlayerBySocket(room, socketId) {
  return room.players.find(p => p.socketId === socketId) || null;
}

function deleteRoom(roomId) {
  rooms.delete(roomId);
}

module.exports = { createRoom, getRoom, joinRoom, reconnect, disconnectPlayer, getPlayerBySocket, deleteRoom };
