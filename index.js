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

let rooms = {}; // holds game state

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // Catch-all listener for debugging
  socket.onAny((event, ...args) => {
    console.log(`🛰️ Received event: ${event}`, args);
  });

  socket.on("create_room", ({ roomId, name }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { players: [] };
    }

    const alreadyInRoom = rooms[roomId].players.some(p => p.id === socket.id);
    if (!alreadyInRoom) {
      rooms[roomId].players.push({ id: socket.id, name });
      socket.join(roomId);
    }

    io.to(roomId).emit("room_update", rooms[roomId]);
  });

  socket.on("join_room", ({ roomId, name }) => {
    if (!rooms[roomId]) return;

    const alreadyInRoom = rooms[roomId].players.some(p => p.id === socket.id);
    if (!alreadyInRoom) {
      rooms[roomId].players.push({ id: socket.id, name });
      socket.join(roomId);
    }

    io.to(roomId).emit("room_update", rooms[roomId]);
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      io.to(roomId).emit("room_update", rooms[roomId]);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Mind Mayhem server running on port ${PORT}`);
});
