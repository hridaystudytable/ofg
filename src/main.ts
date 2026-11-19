import { Vector3 } from 'three';
import { createRenderContext } from './renderer';
import { setupInput } from './input';
import { buildOffice } from './office';
import { WeaponSystem } from './weapon';
import { GrenadeSystem } from './grenade';
import { NetworkManager, MatchScoreEntry } from './network';
import { playDeathSound } from './audio';

// DOM Elements
const container = document.getElementById('canvas-container') as HTMLElement;
const blocker = document.getElementById('blocker') as HTMLElement;
const playBtn = document.getElementById('play-btn') as HTMLElement;
const fpsCounter = document.getElementById('fps-counter') as HTMLElement;
const posInfo = document.getElementById('pos-info') as HTMLElement;
const networkBadge = document.getElementById('network-badge') as HTMLElement;
const networkStatusText = document.getElementById('network-status-text') as HTMLElement;
const matchTimerPill = document.getElementById('match-timer-pill') as HTMLElement;
const playerCountPill = document.getElementById('player-count-pill') as HTMLElement;
const playerNameInput = document.getElementById('player-name-input') as HTMLInputElement;
const leaderboardRows = document.getElementById('leaderboard-rows') as HTMLElement;
const healthVal = document.getElementById('health-val') as HTMLElement;
const grenadeVal = document.getElementById('grenade-val') as HTMLElement;
const damageFlash = document.getElementById('damage-flash') as HTMLElement;
const hitIndicator = document.getElementById('hit-indicator') as HTMLElement;
const killFeed = document.getElementById('kill-feed') as HTMLElement;
const deathScreen = document.getElementById('death-screen') as HTMLElement;
const deathReason = document.getElementById('death-reason') as HTMLElement;
const btnInvite = document.getElementById('btn-invite') as HTMLElement;
const btnEndGame = document.getElementById('btn-end-game') as HTMLElement;
const modalBtnInvite = document.getElementById('modal-btn-invite') as HTMLElement;
const modalBtnEnd = document.getElementById('modal-btn-end') as HTMLElement;
const toastNotice = document.getElementById('toast-notice') as HTMLElement;
const matchOverScreen = document.getElementById('match-over-screen') as HTMLElement;
const resultBanner = document.getElementById('result-banner') as HTMLElement;
const matchOverSubtitle = document.getElementById('match-over-subtitle') as HTMLElement;
const finalLeaderboardRows = document.getElementById('final-leaderboard-rows') as HTMLElement;
const btnPlayAgain = document.getElementById('btn-play-again') as HTMLElement;

// Renderer & World setup
const { renderer, scene, camera } = createRenderContext(container);
const office = buildOffice(scene);

function getRandomSpawn() {
  const spawns = [
    { x: 0, z: 16 },
    { x: -14, z: 0 },
    { x: 14, z: 0 },
    { x: 0, z: -16 }
  ];
  return spawns[Math.floor(Math.random() * spawns.length)];
}

const initialSpawn = getRandomSpawn();
camera.position.set(initialSpawn.x, 1.6, initialSpawn.z);

// Saved credentials & Name
const savedName = localStorage.getItem('ofg_player_name') || 'Agent-' + Math.floor(100 + Math.random() * 900);
playerNameInput.value = savedName;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let playerHealth = 100;
let isPlayerDead = false;
let isMatchOver = false;
let currentMatchScores: MatchScoreEntry[] = [];

// 5-Minute Match Timer
const MATCH_DURATION = 300;
let matchRemainingSeconds = MATCH_DURATION;

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(Math.max(0, totalSeconds) / 60);
  const secs = Math.floor(Math.max(0, totalSeconds) % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateTimerDisplay() {
  matchTimerPill.textContent = formatTime(matchRemainingSeconds);
  if (matchRemainingSeconds <= 30) {
    matchTimerPill.classList.add('timer-low');
  } else {
    matchTimerPill.classList.remove('timer-low');
  }
}

function showDamageFlash(attackerPos?: { x: number; z: number }) {
  damageFlash.style.opacity = '1';
  setTimeout(() => {
    damageFlash.style.opacity = '0';
  }, 100);

  // Directional hit indicator: points toward the shooter relative to player's current view
  if (attackerPos) {
    const dx = attackerPos.x - camera.position.x;
    const dz = attackerPos.z - camera.position.z;

    // Angle of incoming bullet in world space
    const incomingAngle = Math.atan2(dx, dz);
    // Player's camera view yaw
    const playerYaw = controls.getYaw();

    // Relative angle offset
    let relAngle = incomingAngle - playerYaw + Math.PI;
    const deg = (relAngle * 180) / Math.PI;

    hitIndicator.style.transform = `rotate(${deg}deg)`;
    hitIndicator.style.opacity = '1';

    setTimeout(() => {
      hitIndicator.style.opacity = '0';
    }, 450);
  }
}

function updateHealthUI() {
  healthVal.textContent = Math.max(0, playerHealth).toString();
  if (playerHealth <= 30) {
    healthVal.classList.add('health-low');
  } else {
    healthVal.classList.remove('health-low');
  }
}

function addKillFeedMessage(killer: string, victim: string) {
  const item = document.createElement('div');
  item.className = 'kill-item';
  item.textContent = `${killer} ➔ ${victim}`;
  killFeed.appendChild(item);
  setTimeout(() => {
    item.remove();
  }, 4000);
}

function updateLeaderboard(entries: MatchScoreEntry[]) {
  currentMatchScores = entries;
  leaderboardRows.innerHTML = '';
  if (!entries || entries.length === 0) {
    leaderboardRows.innerHTML = '<div class="leaderboard-row"><span>No scores yet</span></div>';
    return;
  }
  entries.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `<span>${e.name || 'Agent'}</span><span style="color: #38bdf8; font-weight: 600;">${e.score} pts (${e.kills}K)</span>`;
    leaderboardRows.appendChild(row);
  });
}

function showToast(msg: string) {
  toastNotice.textContent = msg;
  toastNotice.classList.add('show');
  setTimeout(() => {
    toastNotice.classList.remove('show');
  }, 2500);
}

function displayMatchOver(enderName: string, reason?: string) {
  isMatchOver = true;
  document.exitPointerLock();

  const topPlayer = currentMatchScores.length > 0 ? currentMatchScores[0] : null;
  const isLocalWinner = topPlayer && topPlayer.id === network.localId && topPlayer.score > 0;

  if (isLocalWinner) {
    resultBanner.textContent = 'VICTORY';
    resultBanner.className = 'banner-victory';
    matchOverSubtitle.textContent = reason === 'manual' 
      ? `Match concluded by ${enderName}. You finished #1 as Champion!`
      : `5-minute match expired! You finished #1 as Champion!`;
  } else {
    resultBanner.textContent = 'DEFEAT';
    resultBanner.className = 'banner-defeat';
    matchOverSubtitle.textContent = topPlayer && topPlayer.score > 0
      ? `Winner: ${topPlayer.name} with ${topPlayer.score} pts. Better luck next round!`
      : (reason === 'manual' ? `Match concluded by ${enderName}.` : `5-minute time limit expired.`);
  }

  finalLeaderboardRows.innerHTML = '';
  if (currentMatchScores.length === 0) {
    finalLeaderboardRows.innerHTML = '<div>No match scores recorded.</div>';
  } else {
    currentMatchScores.forEach((entry, idx) => {
      const isWinner = idx === 0 && entry.score > 0;
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.padding = '5px 0';
      row.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
      const badge = isWinner ? ' 👑 [WINNER]' : '';
      const color = isWinner ? '#10b981' : (entry.id === network.localId ? '#38bdf8' : '#e2e8f0');
      row.innerHTML = `<span style="color: ${color}; font-weight: 700;">#${idx + 1} ${entry.name}${badge}</span><span style="color: #38bdf8; font-weight: 700;">${entry.score} pts (${entry.kills}K / ${entry.deaths}D)</span>`;
      finalLeaderboardRows.appendChild(row);
    });
  }

  matchOverScreen.style.display = 'flex';
  blocker.style.display = 'none';
}

// Multiplayer Network Setup
const network = new NetworkManager(
  scene,
  savedName,
  (count) => {
    playerCountPill.textContent = `${count} ${count === 1 ? 'Player' : 'Players'}`;
  },
  (dmg, attackerName, attackerId, attackerPos) => {
    if (isPlayerDead || isMatchOver) return;
    playerHealth -= dmg;
    showDamageFlash(attackerPos);
    updateHealthUI();

    if (playerHealth <= 0) {
      handlePlayerDeath(attackerName, attackerId);
    }
  },
  (killer, victim) => {
    addKillFeedMessage(killer, victim);
  },
  (leaderboard) => {
    updateLeaderboard(leaderboard);
  },
  (enderName, reason) => {
    displayMatchOver(enderName, reason);
  },
  (newRemainingSec) => {
    matchRemainingSeconds = newRemainingSec;
    updateTimerDisplay();
  }
);

function handlePlayerDeath(attackerName: string, attackerId: string) {
  isPlayerDead = true;
  playDeathSound();

  network.sendKill(attackerName, attackerId, network.localName, network.localId);

  deathReason.textContent = `Eliminated by ${attackerName}. Respawning in 3s...`;
  deathScreen.style.display = 'flex';
  blocker.style.display = 'none';

  setTimeout(() => {
    if (isMatchOver) return;
    const spawn = getRandomSpawn();
    camera.position.set(spawn.x, 1.6, spawn.z);
    playerHealth = 100;
    isPlayerDead = false;
    updateHealthUI();
    deathScreen.style.display = 'none';

    network.sendRespawn(spawn.x, 0, spawn.z);
    network.broadcastPosition(spawn.x, 0, spawn.z, controls.getYaw());

    renderer.domElement.requestPointerLock();
  }, 3000);
}

// Connect automatically with env credentials
if (supabaseUrl && supabaseKey) {
  network.connect(supabaseUrl, supabaseKey);
  networkBadge.className = 'badge-status badge-online';
  networkStatusText.textContent = 'Online Arena';
} else {
  networkBadge.className = 'badge-status badge-local';
  networkStatusText.textContent = 'Solo Sandbox';
}

// Grenade System
const grenades = new GrenadeSystem(scene, office, network);

// Controls & Weapon
const controls = setupInput(
  camera,
  renderer.domElement,
  blocker,
  playBtn,
  () => !isPlayerDead && !isMatchOver,
  () => {
    // Throw grenade callback (G key)
    if (!isPlayerDead && !isMatchOver) {
      const origin = camera.position.clone();
      const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      if (grenades.throwGrenade(origin, forward)) {
        grenadeVal.textContent = grenades.grenadeCount.toString();
      }
    }
  }
);
const weapon = new WeaponSystem(camera, scene, office, network);

// End Game button handler
const handleEndGame = (e: Event) => {
  e.stopPropagation();
  if (confirm('Are you sure you want to conclude the match for all players?')) {
    network.sendEndMatch('manual');
    displayMatchOver(network.localName, 'manual');
  }
};
btnEndGame.addEventListener('click', handleEndGame);
modalBtnEnd.addEventListener('click', handleEndGame);

// Invite link button handler
const handleInvite = (e: Event) => {
  e.stopPropagation();
  const inviteUrl = window.location.href;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      showToast('Invite link copied to clipboard!');
    }).catch(() => {
      prompt('Copy this invite link to share:', inviteUrl);
    });
  } else {
    prompt('Copy this invite link to share:', inviteUrl);
  }
};
btnInvite.addEventListener('click', handleInvite);
modalBtnInvite.addEventListener('click', handleInvite);

// Play Again / Start New Round button
btnPlayAgain.addEventListener('click', (e) => {
  e.stopPropagation();
  isMatchOver = false;
  matchOverScreen.style.display = 'none';

  matchRemainingSeconds = MATCH_DURATION;
  updateTimerDisplay();
  network.resetMatchScores();
  grenades.resetGrenades();
  grenadeVal.textContent = '3';

  const spawn = getRandomSpawn();
  camera.position.set(spawn.x, 1.6, spawn.z);
  playerHealth = 100;
  isPlayerDead = false;
  updateHealthUI();

  network.sendRespawn(spawn.x, 0, spawn.z);
  renderer.domElement.requestPointerLock();
});

// Name input change handler
playerNameInput.addEventListener('change', () => {
  const newName = playerNameInput.value.trim();
  if (newName) {
    localStorage.setItem('ofg_player_name', newName);
    network.setName(newName);
  }
});

let lastNetworkSync = 0;
let lastTimerTick = performance.now();

// Performance loop
let lastTime = performance.now();
let frames = 0;
let lastFpsUpdate = lastTime;

function animate(currentTime: number) {
  requestAnimationFrame(animate);

  const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
  lastTime = currentTime;

  if (!isMatchOver && currentTime - lastTimerTick >= 1000) {
    matchRemainingSeconds -= 1;
    updateTimerDisplay();
    lastTimerTick = currentTime;

    if (matchRemainingSeconds <= 0) {
      matchRemainingSeconds = 0;
      updateTimerDisplay();
      network.sendEndMatch('time_up');
      displayMatchOver('Timer Expired', 'time_up');
    }
  }

  if (!isPlayerDead && !isMatchOver) {
    controls.setAiming(weapon.isAiming);
    controls.update(delta, (nextPos) => {
      return office.isWalkable(nextPos.x, nextPos.z, 0.35);
    });
    weapon.update(delta);
    // Update grenades with local player position so self-damage applies if in blast radius
    grenades.update(delta, camera.position, (dmg, attackerName, attackerId, attackerPos) => {
      if (isPlayerDead || isMatchOver) return;
      playerHealth -= dmg;
      showDamageFlash(attackerPos);
      updateHealthUI();

      if (playerHealth <= 0) {
        handlePlayerDeath(attackerName, attackerId);
      }
    });
  }

  network.update(delta);

  // Broadcast position (including Y level so jumping and crouching are seen by others)
  if (currentTime - lastNetworkSync > 33 && !isPlayerDead && !isMatchOver) {
    const feetY = controls.isCrouching ? -0.4 : (camera.position.y - 1.6);
    network.broadcastPosition(
      camera.position.x,
      feetY,
      camera.position.z,
      controls.getYaw()
    );
    lastNetworkSync = currentTime;
  }

  renderer.render(scene, camera);

  frames++;
  if (currentTime - lastFpsUpdate >= 500) {
    const fps = Math.round((frames * 1000) / (currentTime - lastFpsUpdate));
    fpsCounter.textContent = `${fps} FPS`;
    posInfo.textContent = `Pos: ${camera.position.x.toFixed(1)}, ${camera.position.z.toFixed(1)}`;
    frames = 0;
    lastFpsUpdate = currentTime;
  }
}

requestAnimationFrame(animate);
