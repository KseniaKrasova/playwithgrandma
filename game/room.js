const { v4: uuidv4 } = require('uuid');

const rooms = new Map();

function createRoom() {
  const roomId = uuidv4().slice(0, 8);
  const room = {
    id: roomId,
    players: [],       // [{ socketId, token, index }]
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
  if (room.players.length >= 2) {
    return { error: 'Комната заполнена' };
  }

  const token = uuidv4();
  const playerIndex = room.players.length;
  room.players.push({ socketId, token, index: playerIndex });
  return { room, token, playerIndex };
}

function reconnect(roomId, token, newSocketId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const player = room.players.find(p => p.token === token);
  if (!player) return null;

  player.socketId = newSocketId;
  return { room, playerIndex: player.index };
}

function getPlayerBySocket(room, socketId) {
  return room.players.find(p => p.socketId === socketId) || null;
}

function deleteRoom(roomId) {
  rooms.delete(roomId);
}

module.exports = { createRoom, getRoom, joinRoom, reconnect, getPlayerBySocket, deleteRoom };
