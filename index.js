const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { registerSocketEvents } = require("./modules/socketHandlers");
const { expireInactiveRooms } = require("./modules/roomManager");

const app = express();
app.get("/", (req, res) => {
  res.send("Mind Mayhem server is live 🚀");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);
  registerSocketEvents(io, socket);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

setInterval(() => {
  expireInactiveRooms(io, 1000 * 60 * 60); // 1 hour
}, 1000 * 60 * 10);