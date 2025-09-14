Absolutely, Mercy! Here's your fully rewritten `server/index.js` that includes everything your **Mind Mayhem** game needs:

- ✅ Room creation and joining  
- ✅ Category-based word selection  
- ✅ Random role assignment per player  
- ✅ Real/fake word distribution  
- ✅ Phase-based round progression with timers  
- ✅ Clue submission and imposter guess  
- ✅ Peacekeeper query and reveal  
- ✅ Mayhem word swap  
- ✅ Voting and win condition checks  
- ✅ Game over logic

---

### 🧠 Copy-Paste Ready `index.js`

```js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

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

const wordBank = {
  food: ['banana', 'apple', 'carrot', 'pizza', 'grape'],
  animals: ['lion', 'zebra', 'penguin', 'koala', 'elephant'],
  objects: ['chair', 'phone', 'book', 'lamp', 'mirror']
};

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

  socket.onAny((event, ...args) => {
    console.log(`🛰️ Received event: ${event}`, args);
  });

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

  socket.on("start_game", ({ roomId, category }) => {
    const room = rooms[roomId];
    if (!room) return;

    const words = wordBank[category] || wordBank.food;
    const realWord = words[Math.floor(Math.random() * words.length)];
    const fakeWord = words[Math.floor(Math.random() * words.length)];

    room.realWord = realWord;
    room.fakeWord = fakeWord;
    room.state = "playing";
    room.round = 0;
    room.rounds = [];
    room.votes = {};
    room.peacekeeperData = {};
    room.mayhemUsed = false;

    const shuffled = [...room.players].sort(() => Math.random() - 0.5);
    shuffled.forEach((p, i) => {
      p.role = i === 0 ? 'imposter'
             : i === 1 ? 'peacekeeper'
             : i === 2 ? 'mayhem'
             : i === 3 ? 'fibber'
             : 'normal';
      p.isAlive = true;
      const word = p.role === 'imposter' ? fakeWord : realWord;
      io.to(p.id).emit('role_assignment', { role: p.role, word });
    });

    io.to(roomId).emit("game_started", { message: `Game started with category: ${category}` });
    startRound(roomId);
  });

  socket.on("submit_clue", ({ roomId, clue }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.rounds[room.round - 1].clues.push({ playerId: socket.id, clue });
    io.to(roomId).emit("round_update", room.rounds[room.round - 1]);
  });

  socket.on("submit_imposter_word", ({ roomId, word }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.rounds[room.round - 1].imposterWord = word;

    if (word.toLowerCase() === room.realWord.toLowerCase()) {
      io.to(roomId).emit("game_over", { winners: ["imposter"], reason: "Imposter guessed the word!" });
    } else {
      io.to(roomId).emit("round_update", room.rounds[room.round - 1]);
    }
  });

  socket.on("peacekeeper_query", ({ roomId, targetId, question }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.peacekeeperData = { question, answer: null, asker: socket.id, revealed: false };
    io.to(targetId).emit("peacekeeper_prompt", { question });
  });

  socket.on("peacekeeper_response", ({ roomId, answer }) => {
    const room = rooms[roomId];
    if (!room || !room.peacekeeperData) return;
    room.peacekeeperData.answer = answer;
    io.to(room.peacekeeperData.asker).emit("peacekeeper_received", { answer });
  });

  socket.on("peacekeeper_reveal", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.peacekeeperData) return;
    room.peacekeeperData.revealed = true;
    io.to(roomId).emit("peacekeeper_reveal", {
      question: room.peacekeeperData.question,
      answer: room.peacekeeperData.answer
    });
  });

  socket.on("mayhem_activate", ({ roomId, newWord }) => {
    const room = rooms[roomId];
    if (!room || room.mayhemUsed) return;
    room.mayhemUsed = true;
    room.realWord = newWord;
    io.to(roomId).emit("word_swapped", { newWord });
    io.to(roomId).emit("announcement", "Mayhem has swapped the word!");
  });

  socket.on("vote", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.votes[socket.id] = targetId;
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      io.to(roomId).emit("room_update", rooms[roomId]);
    }
  });
});

const PORT = process.env
