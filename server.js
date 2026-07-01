const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const users = require('./users');
const mm = require('./matchmaking');
const liars = require('./games/liars');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
cors: { origin: '*', methods: ['GET', 'POST'] },
});

// API REST
app.use(express.static(__dirname));

app.get('/', (req, res) => {
res.sendFile(__dirname + '/index.html');
});


function sanitizeUser(u) {
const { password, ...rest } = u;
return rest;
}

app.post('/api/register', (req, res) => {
const { id, name, password } = req.body;

if (!id || !name || !password) {
return res.status(400).json({ error: 'Champs manquants.' });
}

const result = users.createUser(
id.toLowerCase().trim(),
name.trim(),
password
);

if (result.error) {
return res.status(409).json({ error: result.error });
}

res.json({ user: sanitizeUser(result.user) });
});

app.post('/api/login', (req, res) => {
const { id, password } = req.body;

if (!id || !password) {
return res.status(400).json({ error: 'Champs manquants.' });
}

const result = users.verifyUser(
id.toLowerCase().trim(),
password
);

if (result.error) {
return res.status(401).json({ error: result.error });
}

res.json({ user: sanitizeUser(result.user) });
});

app.get('/api/user/:id', (req, res) => {
const user = users.getUser(req.params.id.toLowerCase());

if (!user) {
return res.status(404).json({ error: 'Introuvable.' });
}

res.json({ user: sanitizeUser(user) });
});

// SOCKET.IO
const socketToUser = {};

io.on('connection', (socket) => {
console.log('Connexion:', socket.id);

socket.on('identify', ({ userId }) => {
if (!userId) return;
socketToUser[socket.id] = userId;
users.updateUser(userId, {});
});

socket.on('queue:join', ({ gameType, userId }) => {
socketToUser[socket.id] = userId;

```
const result = mm.enqueue(gameType, socket.id, userId);

if (result.error) {
  socket.emit('queue:error', result.error);
  return;
}

socket.emit('queue:joined', { gameType });
attemptMatch(gameType);
```

});

socket.on('queue:leave', () => {
mm.dequeue(socket.id);
socket.emit('queue:left');
});

socket.on('room:create', ({ gameType, userId }) => {
socketToUser[socket.id] = userId;

```
const code = mm.createPrivateRoom(gameType, socket.id, userId);

socket.join('lobby_' + code);

socket.emit('room:created', {
  code,
  gameType
});
```

});

socket.on('room:join', ({ code, userId }) => {
socketToUser[socket.id] = userId;

```
const result = mm.joinPrivateRoom(
  code.toUpperCase(),
  socket.id,
  userId
);

if (result.error) {
  socket.emit('room:error', result.error);
  return;
}

const room = result.room;

socket.join('lobby_' + code);

startMatch(
  room.gameType,
  room.hostSocketId,
  room.hostUserId,
  socket.id,
  userId
);

mm.cancelPrivateRoom(code);
```

});

socket.on('liars:bid', ({ roomId, qty, face }) => {
const room = mm.getActiveRoom(roomId);

```
if (!room || room.gameType !== 'liars') return;

const userId = socketToUser[socket.id];
const result = liars.makeBid(room.state, userId, qty, face);

broadcastLiarsState(room);
```

});

socket.on('liars:challenge', ({ roomId }) => {
const room = mm.getActiveRoom(roomId);

```
if (!room || room.gameType !== 'liars') return;

const userId = socketToUser[socket.id];
const result = liars.challenge(room.state, userId);

broadcastLiarsState(room);

if (result.gameOver) {
  handleGameEnd(room, result.winner);
} else if (result.ok) {
  setTimeout(() => {
    liars.nextRound(room.state);
    broadcastLiarsState(room);
  }, 2500);
}
```

});

socket.on('disconnect', () => {
console.log('Déconnexion:', socket.id);

```
mm.cleanupSocket(socket.id);

const room = mm.findActiveRoomBySocket(socket.id);

if (room) {
  const opponent = room.players.find(
    p => p.socketId !== socket.id
  );

  if (opponent) {
    io.to(opponent.socketId).emit(
      'opponent:disconnected'
    );
  }
}

delete socketToUser[socket.id];
```

});
});

// Matchmaking auto
setInterval(() => {
mm.GAMES.forEach(gameType => attemptMatch(gameType));
}, 700);

function attemptMatch(gameType) {
const match = mm.tryMatch(gameType);

if (!match) return;

startMatch(
gameType,
match.playerA.socketId,
match.playerA.userId,
match.playerB.socketId,
match.playerB.userId
);
}

function startMatch(gameType, socketA, userIdA, socketB, userIdB) {
const room = mm.createActiveRoom(
gameType,
socketA,
userIdA,
socketB,
userIdB
);

if (gameType === 'liars') {
room.state = liars.newGameState([
userIdA,
userIdB
]);
}

const socketObjA = io.sockets.sockets.get(socketA);
const socketObjB = io.sockets.sockets.get(socketB);

if (socketObjA) socketObjA.join(room.roomId);
if (socketObjB) socketObjB.join(room.roomId);

io.to(room.roomId).emit('match:found', {
roomId: room.roomId,
gameType
});

broadcastLiarsState(room);
}

function broadcastLiarsState(room) {
room.players.forEach(player => {
const view = liars.getPlayerView(
room.state,
player.userId
);

```
io.to(player.socketId).emit(
  'liars:state',
  view
);
```

});
}

function handleGameEnd(room, winnerUserId) {
room.players.forEach(player => {
const won = player.userId === winnerUserId;

```
io.to(player.socketId).emit('game:over', {
  won
});
```

});

mm.endActiveRoom(room.roomId);
}

server.listen(PORT, () => {
console.log(
`Serveur La Taverne des Jeux démarré sur le port ${PORT}`
);
});
