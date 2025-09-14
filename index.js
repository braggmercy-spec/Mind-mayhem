const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { wordBank } = require("./constants");

const app = express();
app.get("/", (req, res) => {
  res.send("Mind Mayhem server is live 🚀");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let rooms = {};

function startTimer(roomId, phase, duration, onEnd) {
  const room = rooms[roomId];
  if (!room) return;
  room.phase = phase;
  io.to(roomId).emit("phase_change", { newPhase: phase, timer: duration });
  setTimeout(onEnd, duration * 1000);
}

function startRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.round += 1;
  room.rounds.push({ clues: [], imposterWord: null });
  room.votes = {};
  room.peacekeeperData = {};

  startTimer(roomId, "clue_submission", 30, () => {
    startTimer(roomId, "peacekeeper_query", 15, () => {
      startTimer(roomId, "voting", 20, () => handleVoteResult(roomId));
    });
  });
}

function checkWinConditions(room) {
  const imposterAlive = room.players.some(p => p.role === "imposter" && p.isAlive);
  const fibberAlive = room.players.some(p => p.role === "fibber" && p.isAlive);
  if (!imposterAlive) return { winners: ["normals", "peacekeeper"], reason: "Imposter eliminated!" };
  if (!fibberAlive) return { winners: ["fibber"], reason: "Fibber eliminated!" };
  return null;
}

function handleVoteResult(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const tally = {};
  Object.values(room.votes).forEach(v => {
    tally[v] = (tally[v] || 0) + 1;
  });

  let ejectedId = null, maxVotes = 0;
  for (const [playerId, count] of Object.entries(tally)) {
    if (count > maxVotes) {
      ejectedId = playerId;
      maxVotes = count;
    }
  }

  const ejected = room.players.find(p => p.id === ejectedId);
  if (ejected) ejected.isAlive = false;

  const winCheck = checkWinConditions(room);
  if (winCheck) {
    io.to(roomId).emit("game_over", winCheck);
  } else {
    startRound(roomId);
  }
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("create_room", ({ roomId, name }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        hostId: socket.id,
        players: [],
        round: 0,
        state: "waiting",
        realWord: null,
        fakeWord: null,
        rounds: [],
        votes: {},
        peacekeeperData: {},
        mayhemUsed: false,
        settings: {}
      };
    }

    const alreadyInRoom = rooms[roomId].players.some(p => p.id === socket.id);
    if (!alreadyInRoom) {
      rooms[roomId].players.push({ id: socket.id, name, role: "host", isAlive: true });
      socket.join(roomId);
    }

    io.to(roomId).emit("room_update", rooms[roomId]);
  });

  socket.on("join_room", ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) return;

    const alreadyInRoom = room.players.some(p => p.id === socket.id);
    if (!alreadyInRoom) {
      room.players.push({ id: socket.id, name, role: "normal", isAlive: true });
      socket.join(roomId);
    }

    io.to(roomId).emit("room_update", room);
  });

  socket.on("start_game", ({ roomId, category, roles }) => {
    const room = rooms[roomId];
    if (!room) return;

    const words = wordBank[category] || wordBank.food;
    const realWord = words[Math.floor(Math.random() * words.length)];
    let fakeWord = realWord;
    while (fakeWord === realWord) {
      fakeWord = words[Math.floor(Math.random() * words.length)];
    }

    room.realWord = realWord;
    room.fakeWord = fakeWord;
    room.state = "playing";
    room.round = 0;
    room.rounds = [];
    room.votes = {};
    room.peacekeeperData = {};
    room.mayhemUsed = false;

    const shuffled = [...room.players].sort(() => Math.random() - 0.5);
    let rolePool = [];

    if (roles?.imposter !== false) rolePool.push("imposter");
    if (roles?.peacekeeper) rolePool.push("peacekeeper");
    if (roles?.mayhem) rolePool.push("mayhem");
    if (roles?.fibber) rolePool.push("fibber");

    shuffled.forEach((p, i) => {
      p.role = rolePool[i] || "normal";
      p.isAlive = true;
      const word = p.role === "imposter" ? fakeWord : realWord;
      io.to(p.id).emit("role_assignment", { role: p.role, word });
    });

    io.to(roomId).emit("game_started", { message: `Game started with category: ${category}` });
    startRound(roomId);
  });

  socket.on("submit_cl