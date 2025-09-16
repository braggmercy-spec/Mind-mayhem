// modules/gameLogic.js

const { rooms } = require("./roomManager");

function startTimer(io, roomId, phase, duration, onEnd) {
  const room = rooms[roomId];
  if (!room) return;

  room.phase = phase;
  room.lastActive = Date.now();

  io.to(roomId).emit("phase_change", { newPhase: phase, timer: duration });
  io.to(roomId).emit("phase_transition", { phase, animate: true });

  setTimeout(onEnd, duration * 1000);
}

function startRound(io, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.round += 1;
  room.rounds.push({ clues: [], imposterWord: null });
  room.votes = {};
  room.peacekeeperData = {};

  startTimer(io, roomId, "clue_submission", 30, () => {
    startTimer(io, roomId, "peacekeeper_query", 15, () => {
      startTimer(io, roomId, "mayhem_decision", 10, () => {
        startTimer(io, roomId, "voting", 20, () => {
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
    alive: p.isAlive
  }));

  io.to(roomId).emit("game_summary", summary);
}

function handleVoteResult(io, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const tally = {};
  Object.values(room.votes).forEach(v => {
    tally[v] = (tally[v] || 0) + 1;
  });

  io.to(roomId).emit("vote_summary", tally);

  const maxVotes = Math.max(...Object.values(tally));
  const tied = Object.entries(tally).filter(([_, count]) => count === maxVotes);

  let ejectedId = null;
  if (tied.length === 1) {
    ejectedId = tied[0][0];
  } else {
    io.to(roomId).emit("announcement", "⚖️ Tie vote! No one ejected.");
    io.to(roomId).emit("phase_change", { newPhase: "imposter_guess", timer: 15 });
    return;
  }

  const ejected = room.players.find(p => p.id === ejectedId);
  if (ejected) ejected.isAlive = false;

  if (ejected?.role === "fibber") {
    io.to(roomId).emit("game_over", {
      winners: ["fibber"],
      reason: "Fibber was voted out and wins!"
    });
    emitRoleSummary(io, roomId);
    return;
  }

  const imposterAlive = room.players.some(p => p.role ===