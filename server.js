const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

let users, mm, liars;

// Debug des imports
try {
users = require('./users');
console.log('✅ users.js chargé');
} catch (e) {
console.error('❌ Erreur users.js:', e);
}

try {
mm = require('./matchmaking');
console.log('✅ matchmaking.js chargé');
} catch (e) {
console.error('❌ Erreur matchmaking.js:', e);
}

try {
liars = require('./games/liars');
console.log('✅ games/liars.js chargé');
} catch (e) {
console.error('❌ Erreur games/liars.js:', e);
}

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.get('/', (req, res) => {
res.json({
status: 'ok',
message: 'Serveur La Taverne des Jeux actif.'
});
});

function sanitizeUser(u) {
if (!u) return null;
const { password, ...rest } = u;
return rest;
}

// API Auth
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

// Socket.io
io.on('connection', (socket) => {
console.log('Connexion:', socket.id);

socket.on('disconnect', () => {
console.log('Déconnexion:', socket.id);
});
});

// Vérifie que tout est bien chargé avant de lancer
if (!users || !mm || !liars) {
console.error('❌ Un ou plusieurs modules sont cassés.');
process.exit(1);
}

server.listen(PORT, () => {
console.log(`✅ Serveur lancé sur le port ${PORT}`);
});
