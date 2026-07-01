// ════════════════════════════════════════════════════════════════
//  GESTION DES UTILISATEURS — stockage fichier JSON (simple, suffisant
//  pour démarrer ; migrable vers une vraie DB plus tard sans douleur
//  car toute la logique passe par les fonctions de ce module)
// ════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data', 'users.json');

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
}

function loadUsers() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    console.error('Erreur lecture users.json:', e.message);
    return {};
  }
}

let _usersCache = null;
let _saveTimer = null;

function getUsers() {
  if (!_usersCache) _usersCache = loadUsers();
  return _usersCache;
}

function saveUsers() {
  // Debounce les écritures disque pour éviter le martelage si plusieurs
  // évènements arrivent dans la même milliseconde
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(_usersCache, null, 2));
    } catch (e) {
      console.error('Erreur écriture users.json:', e.message);
    }
  }, 200);
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function getUser(id) {
  return getUsers()[id] || null;
}

function createUser(id, name, password) {
  const users = getUsers();
  if (users[id]) return { error: 'Ce pseudonyme est déjà pris.' };
  users[id] = {
    name,
    password: hashPassword(password),
    coins: 200,
    xp: 0,
    wins: 0,
    losses: 0,
    games: 0,
    totalScore: 0,
    winStreak: 0,
    bestStreak: 0,
    gChess: { games: 0, wins: 0, draws: 0 },
    gStb: { games: 0, wins: 0, best: null },
    gLd: { games: 0, wins: 0, best: 0 },
    gameHistory: [],
    weeklyScores: {},
    seasons: {},
    created: Date.now(),
    lastSeen: Date.now(),
  };
  saveUsers();
  return { user: users[id] };
}

function verifyUser(id, password) {
  const user = getUser(id);
  if (!user) return { error: 'Pseudonyme introuvable.' };
  if (user.password !== hashPassword(password)) return { error: 'Mot de passe incorrect.' };
  return { user };
}

function updateUser(id, patch) {
  const users = getUsers();
  if (!users[id]) return null;
  Object.assign(users[id], patch);
  users[id].lastSeen = Date.now();
  saveUsers();
  return users[id];
}

function getSkillScore(ud) {
  if (!ud) return 0;
  const pk = (ud.games && typeof ud.games === 'object' ? ud.games.poker : null) || {};
  const ch = ud.gChess || {};
  const stb = ud.gStb || {};
  const ld = ud.gLd || {};
  const fkW = ud.wins || 0;
  const fkG = typeof ud.games === 'number' ? ud.games : 0;
  const totalW = fkW + (pk.wins || 0) + (ch.wins || 0) + (stb.wins || 0) + (ld.wins || 0);
  const totalG = fkG + (pk.games || 0) + (ch.games || 0) + (stb.games || 0) + (ld.games || 0);
  const wr = totalG > 0 ? totalW / totalG : 0.5;
  const level = getLevelFromXP(ud.xp || 0);
  return Math.round(wr * 500 + level * 30 + totalW * 2);
}

const XP_LEVELS = [0,100,250,500,900,1400,2000,2800,3800,5000,7000,10000];
function getLevelFromXP(xp) {
  let lvl = 1;
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i]) lvl = i + 1;
  }
  return lvl;
}

module.exports = {
  getUsers, getUser, createUser, verifyUser, updateUser,
  getSkillScore, getLevelFromXP, saveUsers,
};
