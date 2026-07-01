// ════════════════════════════════════════════════════════════════
//  MENTEUR AUX DÉS — logique serveur autoritaire (2 joueurs réels)
//  Le serveur est seul juge : il lance les dés, valide les enchères,
//  révèle la vérité au moment du défi. Aucun client ne peut tricher
//  puisqu'il ne voit jamais les dés de l'adversaire avant la révélation.
// ════════════════════════════════════════════════════════════════

function rollDice(n) {
  return Array.from({ length: n }, () => Math.ceil(Math.random() * 6));
}

function newGameState(playerIds) {
  return {
    dice: {
      [playerIds[0]]: rollDice(5),
      [playerIds[1]]: rollDice(5),
    },
    lives: {
      [playerIds[0]]: 3,
      [playerIds[1]]: 3,
    },
    currentBid: null,       // { qty, face, owner }
    turn: playerIds[0],     // commence toujours par le créateur du salon
    round: 1,
    players: playerIds,
    phase: 'bid',           // 'bid' | 'reveal' | 'over'
    winner: null,
    log: [],
  };
}

function otherPlayer(state, playerId) {
  return state.players.find(p => p !== playerId);
}

function makeBid(state, playerId, qty, face) {
  if (state.phase !== 'bid') return { error: 'Phase invalide.' };
  if (state.turn !== playerId) return { error: "Ce n'est pas votre tour." };
  if (qty < 1 || qty > 10 || face < 1 || face > 6) return { error: 'Enchère hors limites.' };

  if (state.currentBid) {
    const b = state.currentBid;
    const higher = qty > b.qty || (qty === b.qty && face > b.face);
    if (!higher) return { error: 'Votre enchère doit être strictement plus haute.' };
  }

  state.currentBid = { qty, face, owner: playerId };
  state.turn = otherPlayer(state, playerId);
  state.log.push({ type: 'bid', playerId, qty, face, at: Date.now() });
  return { ok: true, state };
}

function challenge(state, playerId) {
  if (state.phase !== 'bid') return { error: 'Phase invalide.' };
  if (state.turn !== playerId) return { error: "Ce n'est pas votre tour." };
  if (!state.currentBid) return { error: 'Aucune enchère à contester.' };

  const { qty, face, owner } = state.currentBid;
  const allDice = [...state.dice[state.players[0]], ...state.dice[state.players[1]]];
  const actual = allDice.filter(d => d === face).length;
  const bidWasTrue = actual >= qty;

  let loserId;
  if (bidWasTrue) {
    // L'enchère était vraie → le challenger (celui qui a crié "Menteur") perd une vie
    loserId = playerId;
  } else {
    // L'enchère était un bluff → celui qui a fait l'enchère perd une vie
    loserId = owner;
  }
  state.lives[loserId]--;
  state.phase = 'reveal';
  state.log.push({
    type: 'challenge', playerId, qty, face, actual, bidWasTrue, loserId, at: Date.now(),
  });

  const result = { ok: true, state, actual, bidWasTrue, loserId };

  // Vérifier fin de partie
  const [p1, p2] = state.players;
  if (state.lives[p1] <= 0 || state.lives[p2] <= 0) {
    state.phase = 'over';
    state.winner = state.lives[p1] <= 0 ? p2 : p1;
    result.gameOver = true;
    result.winner = state.winner;
  }

  return result;
}

function nextRound(state) {
  if (state.phase === 'over') return { error: 'La partie est terminée.' };
  state.round++;
  state.dice[state.players[0]] = rollDice(5);
  state.dice[state.players[1]] = rollDice(5);
  state.currentBid = null;
  state.phase = 'bid';
  // Le perdant de la manche précédente commence (règle classique du Menteur)
  const lastChallenge = [...state.log].reverse().find(e => e.type === 'challenge');
  state.turn = lastChallenge ? lastChallenge.loserId : state.players[0];
  return { ok: true, state };
}

// Vue filtrée envoyée à un joueur : il ne voit JAMAIS les dés adverses,
// sauf pendant la phase 'reveal' où tout est dévoilé.
function getPlayerView(state, playerId) {
  const opponent = otherPlayer(state, playerId);
  return {
    myDice: state.dice[playerId],
    opponentDice: state.phase === 'reveal' || state.phase === 'over' ? state.dice[opponent] : null,
    myLives: state.lives[playerId],
    opponentLives: state.lives[opponent],
    currentBid: state.currentBid,
    turn: state.turn,
    isMyTurn: state.turn === playerId,
    round: state.round,
    phase: state.phase,
    winner: state.winner,
    iWon: state.winner === playerId,
  };
}

module.exports = {
  newGameState, makeBid, challenge, nextRound, getPlayerView, otherPlayer,
};
