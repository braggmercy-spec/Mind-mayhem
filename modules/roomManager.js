// modules/roomManager.js

let rooms = {};
let publicRooms = [];

function createRoom(roomId, hostId, isPublic = false) {
  rooms[roomId] = {
    id: roomId,
    hostId,
    players: [],
    round: 0,
    state: "waiting",
    word: null,               // ✅ Word for current round
    category: null,           // ✅ Category for current round
    clues: [],                // ✅ Clues submitted this round
    usedClues: [],            // ✅ All clues used across rounds
    usedWords: [],            // ✅ All prompt words used across rounds
    mayhemUsed: false,        // ✅ Tracks if Mayhem ability was used
    realWord: null,           // Optional legacy field
    fakeWord: null,           // Optional legacy field
    rounds: [],               // ✅ Round history
    votes: {},                // ✅ Voting data
    peacekeeperData: {},      // ✅ Secret question/answer tracking
    settings: { debug_mode: false },
    isPublic,
    lastActive: Date.now()
  };

  if (isPublic) {
    publicRooms.push(roomId);
  }
}

function getRoom(roomId) {
  return rooms[roomId];
}

function addPlayer(roomId, playerId, name, role = "normal") {
  const room = rooms[roomId];
  if (!room) return;

  const alreadyJoined = room.players.some(p => p.id === playerId);
  if (!alreadyJoined) {
    room.players.push({ id: playerId, name, role, isAlive: true });
  }

  room.lastActive = Date.now();
}

function removePlayer(roomId, playerId) {
  const room = rooms[roomId];
  if (!room) return;

  room.players = room.players.filter(p => p.id !== playerId);
  room.lastActive = Date.now();
}

function expireInactiveRooms(io, expiryMs) {
  const now = Date.now();
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room && now - room.lastActive > expiryMs) {
      io.to(roomId).emit("announcement", "Room expired due to inactivity.");
      delete rooms[roomId];
    }
  }
}

function deleteRoom(roomId) {
  delete rooms[roomId];
  publicRooms = publicRooms.filter(id => id !== roomId);
}

function getPublicRoom() {
  return publicRooms.find(id => {
    const room = rooms[id];
    return room && room.players.length < 8 && room.state === "waiting";
  });
}

module.exports = {
  rooms,
  publicRooms,
  createRoom,
  getRoom,
  addPlayer,
  removePlayer,
  deleteRoom,
  expireInactiveRooms,
  getPublicRoom
};