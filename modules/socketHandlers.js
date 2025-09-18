const { rooms } = require('./roomManager');
const { wordBank } = require('./constants');

function startTimer(io, roomId, phase, duration, onEnd) {
  const room = rooms[roomId];
  if (!room) return;

  room.phase = phase;
  room.lastActive = Date.now();

  io.to(roomId).emit('phase_change', { newPhase: phase, timer: duration });
  io.to(roomId).emit('phase_transition', { phase, animate: true });

  setTimeout(onEnd, duration * 1000);
}

function startRound(io, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.round += 1;
  room.rounds.push({ clues: [], imposterWord: null });
  room.votes = {};
  room.peacekeeperData = {};
  room.clues = [];
  room.usedClues = room.usedClues || [];
  room.usedWords = room.usedWords || [];
  room.mayhemUsed = false; // ✅ Reset Mayhem ability at start of game

  const categories = Object.keys(wordBank);
  const category = categories[Math.floor(Math.random() * categories.length)];
  const wordList = wordBank[category];

  const availableWords = wordList.filter(w => !room.usedWords.includes(w.toLowerCase()));
  if (availableWords.length === 0) {
    io.to(roomId).emit('announcement', `⚠️ No unused words left in category "${category}".`);
    return;
  }

  const word = availableWords[Math.floor(Math.random() * availableWords.length)];
  room.word = word;
  room.category = category;
  room.usedWords.push(word.toLowerCase());

  room.players.forEach(p => {
    io.to(p.id).emit('role_assignment', {
      role: p.role,
      word: p.role === 'imposter' ? null : word,
      category,
    });
  });

  startTimer(io, roomId, 'clue_submission', 60, () => {
    io.to(roomId).emit('clue_update', { clues: room.clues });
    startTimer(io, roomId, 'peacekeeper_query', 15, () => {
      startTimer(io, roomId, 'mayhem_decision', 10, () => {
        startTimer(io, roomId, 'voting', 20, () => {
          handleVoteResult(io, roomId);
        });
      });
    });
  });
}

function emitRoleSummary(io, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const summary = room.players.map(p => ({
    name: p.name,
    role: p.role,
    alive: p.isAlive,
  }));

  io.to(roomId).emit('game_summary', summary);
}

function handleVoteResult(io, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const tally = {};
  Object.values(room.votes).forEach(v => {
    tally[v] = (tally[v] || 0) + 1;
  });

  io.to(roomId).emit('vote_summary', tally);

  const maxVotes = Math.max(...Object.values(tally));
  const tied = Object.entries(tally).filter(([_, count]) => count === maxVotes);

  let ejectedId = null;
  if (tied.length === 1) {
    ejectedId = tied[0][0];
  } else {
    io.to(roomId).emit('announcement', '⚖️ Tie vote! No one ejected.');
    io.to(roomId).emit('phase_change', { newPhase: 'imposter_guess', timer: 15 });
    return;
  }

  const ejected = room.players.find(p => p.id === ejectedId);
  if (ejected) ejected.isAlive = false;

  if (ejected?.role === 'fibber') {
    io.to(roomId).emit('game_over', {
      winners: ['fibber'],
      reason: 'Fibber was voted out and wins!',
    });
    emitRoleSummary(io, roomId);
    room.usedWords = []; // ✅ Reset for next game
    return;
  }

  const imposterAlive = room.players.some(p => p.role === 'fibber' && p.isAlive);
  if (!imposterAlive) {
    io.to(roomId).emit('game_over', {
      winners: ['detectives'],
      reason: 'Fibber was eliminated. Detectives win!',
    });
    emitRoleSummary(io, roomId);
    room.usedWords = []; // ✅ Reset for next game
    return;
  }

  io.to(roomId).emit('phase_change', { newPhase: 'imposter_guess', timer: 15 });
}

// 🧠 Clue submission
function registerClueHandlers(io, socket) {
  socket.on('submit_clue', ({ roomId, clue }) => {
    const room = rooms[roomId];
    if (!room || room.phase !== 'clue_submission') return;

    const lowerClue = clue.trim().toLowerCase();
    const alreadyUsed = room.clues.some(c => c.clue.toLowerCase() === lowerClue) ||
                        room.usedClues.some(c => c.toLowerCase() === lowerClue);

    if (alreadyUsed) {
      socket.emit('clue_error', { message: 'Clue already used in this game!' });
      return;
    }

    room.clues.push({ playerId: socket.id, clue });
    room.usedClues.push(lowerClue);

    io.to(roomId).emit('clue_update', { clues: room.clues });

    const alivePlayers = room.players.filter(p => p.isAlive);
    if (room.clues.length >= alivePlayers.length) {
      io.to(roomId).emit('clue_update', { clues: room.clues });
      startTimer(io, roomId, 'peacekeeper_query', 15, () => {
        startTimer(io, roomId, 'mayhem_decision', 10, () => {
          startTimer(io, roomId, 'voting', 20, () => {
            handleVoteResult(io, roomId);
          });
        });
      });
    }
  });
}

// 🧨 Mayhem activation
function registerMayhemHandler(io, socket) {
  socket.on('activate_mayhem', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.phase !== 'mayhem_decision') return;

    const mayhemPlayer = room.players.find(p => p.id === socket.id && p.role === 'mayhem');
    if (!mayhemPlayer || room.mayhemUsed) {
      socket.emit('mayhem_error', { message: 'Mayhem ability already used or invalid.' });
      return;
    }

    const wordList = wordBank[room.category];
    const availableWords = wordList.filter(w => !room.usedWords.includes(w.toLowerCase()));
    if (availableWords.length === 0) {
      socket.emit('mayhem_error', { message: 'No unused words left in this category.' });
      return;
    }

    const newWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    room.word = newWord;
    room.usedWords.push(newWord.toLowerCase());
    room.mayhemUsed = true; // ✅ Lock Mayhem ability

    io.to(roomId).emit('mayhem_word_changed', { category: room.category });

    room.players.forEach(p => {
      const shouldReceiveWord = p.role !== 'imposter';
      io.to(p.id).emit('role_assignment', {
        role: p.role,
        word: shouldReceiveWord ? newWord : null,
        category: room.category,
      });
    });

    room.clues = [];
    room.usedClues = [];

    startTimer(io, roomId, 'clue_submission', 45, () => {
      io.to(roomId).emit('clue_update', { clues: room.clues });
      startTimer(io, roomId, 'peacekeeper_query', 15, () => {
        startTimer(io, roomId, 'voting', 20, () => {
          handleVoteResult(io, roomId);
        });
      });
    });
  });
}

// 🔌 Register all socket events
function registerSocketEvents(io, socket) {
  socket.on('start_round', ({ roomId }) => {
    const room = rooms[roomId];
    if (room) room.mayhemUsed = false; // ✅ Reset on new game
    startRound(io, roomId);
  });

  registerClueHandlers(io, socket);
  registerMayhemHandler(io, socket);
}

module.exports = {
  registerSocketEvents,
};