// ════════════════════════════════════════════════════════════════
//  MATCHMAKING & SALONS — file d'attente réelle par jeu, élargissement
//  progressif de la tolérance de skill, salons privés avec code à 5
//  caractères pour inviter un ami précis.
// ════════════════════════════════════════════════════════════════
const { getUser, getSkillScore } = require('./users');

const GAMES = ['farkle', 'poker', 'chess', 'stb', 'liars'];

// File d'attente : { gameType: [ {socketId, userId, skill, joinedAt} ] }
const queues = {};
GAMES.forEach(g => queues[g] = []);

// Salons privés : { code: { gameType, hostSocketId, hostUserId, guestSocketId, guestUserId, createdAt } }
const privateRooms = {};

// Parties en cours : { roomId: { gameType, players: [socketId,socketId], state: {...} } }
const activeRooms = {};

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (privateRooms[code]);
  return code;
}

function genRoomId() {
  return 'room_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ── File d'attente (matchmaking public) ──────────────────────────
function enqueue(gameType, socketId, userId) {
  if (!GAMES.includes(gameType)) return { error: 'Jeu invalide' };
  const user = getUser(userId);
  const skill = getSkillScore(user);
  // Retirer toute entrée existante pour ce socket (évite les doublons)
  dequeue(socketId);
  queues[gameType].push({ socketId, userId, skill, joinedAt: Date.now() });
  return { queued: true };
}

function dequeue(socketId) {
  GAMES.forEach(g => {
    queues[g] = queues[g].filter(e => e.socketId !== socketId);
  });
}

// Tentative de matching : élargit la tolérance avec le temps d'attente
function tryMatch(gameType) {
  const q = queues[gameType];
  if (q.length < 2) return null;

  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const waitMs = Date.now() - a.joinedAt;
    // Tolérance : commence à 50, +80 toutes les 700ms, plafonnée à 600
    const tolerance = Math.min(600, 50 + Math.floor(waitMs / 700) * 80);

    for (let j = 0; j < q.length; j++) {
      if (i === j) continue;
      const b = q[j];
      if (Math.abs(a.skill - b.skill) <= tolerance) {
        // Match trouvé : retirer les deux de la file
        queues[gameType] = q.filter(e => e !== a && e !== b);
        return { playerA: a, playerB: b };
      }
    }
  }
  return null;
}

// ── Salons privés ─────────────────────────────────────────────────
function createPrivateRoom(gameType, hostSocketId, hostUserId) {
  const code = genRoomCode();
  privateRooms[code] = {
    code, gameType, hostSocketId, hostUserId,
    guestSocketId: null, guestUserId: null,
    createdAt: Date.now(),
  };
  return code;
}

function joinPrivateRoom(code, guestSocketId, guestUserId) {
  const room = privateRooms[code];
  if (!room) return { error: 'Code de salon introuvable.' };
  if (room.guestSocketId) return { error: 'Ce salon est déjà complet.' };
  if (room.hostUserId === guestUserId) return { error: 'Vous ne pouvez pas rejoindre votre propre salon.' };
  room.guestSocketId = guestSocketId;
  room.guestUserId = guestUserId;
  return { room };
}

function cancelPrivateRoom(code) {
  delete privateRooms[code];
}

function getPrivateRoom(code) {
  return privateRooms[code] || null;
}

// ── Parties actives ───────────────────────────────────────────────
function createActiveRoom(gameType, socketIdA, userIdA, socketIdB, userIdB) {
  const roomId = genRoomId();
  activeRooms[roomId] = {
    roomId,
    gameType,
    players: [
      { socketId: socketIdA, userId: userIdA },
      { socketId: socketIdB, userId: userIdB },
    ],
    state: null, // état spécifique au jeu, géré par le module du jeu concerné
    createdAt: Date.now(),
  };
  return activeRooms[roomId];
}

function getActiveRoom(roomId) {
  return activeRooms[roomId] || null;
}

function endActiveRoom(roomId) {
  delete activeRooms[roomId];
}

function findActiveRoomBySocket(socketId) {
  return Object.values(activeRooms).find(r =>
    r.players.some(p => p.socketId === socketId)
  ) || null;
}

// Nettoyage : retirer un socket déconnecté de la file et des salons en attente
function cleanupSocket(socketId) {
  dequeue(socketId);
  // Annuler les salons privés où ce socket était hôte sans invité
  Object.keys(privateRooms).forEach(code => {
    const r = privateRooms[code];
    if (r.hostSocketId === socketId && !r.guestSocketId) {
      delete privateRooms[code];
    }
  });
}

module.exports = {
  GAMES, queues, enqueue, dequeue, tryMatch,
  createPrivateRoom, joinPrivateRoom, cancelPrivateRoom, getPrivateRoom,
  createActiveRoom, getActiveRoom, endActiveRoom, findActiveRoomBySocket,
  cleanupSocket,
};
