import { createRenderContext } from './renderer';
import { setupInput } from './input';
import { buildOffice } from './office';
import { WeaponSystem } from './weapon';
import { NetworkManager, LeaderboardEntry } from './network';
import { playDeathSound } from './audio';

// DOM Elements
const container = document.getElementById('canvas-container') as HTMLElement;
const blocker = document.getElementById('blocker') as HTMLElement;
const playBtn = document.getElementById('play-btn') as HTMLElement;
const fpsCounter = document.getElementById('fps-counter') as HTMLElement;
const posInfo = document.getElementById('pos-info') as HTMLElement;
const networkBadge = document.getElementById('network-badge') as HTMLElement;
const networkStatusText = document.getElementById('network-status-text') as HTMLElement;
const playerCountPill = document.getElementById('player-count-pill') as HTMLElement;
const playerNameInput = document.getElementById('player-name-input') as HTMLInputElement;
const leaderboardRows = document.getElementById('leaderboard-rows') as HTMLElement;
const healthVal = document.getElementById('health-val') as HTMLElement;
const damageFlash = document.getElementById('damage-flash') as HTMLElement;
const killFeed = document.getElementById('kill-feed') as HTMLElement;
const deathScreen = document.getElementById('death-screen') as HTMLElement;
const deathReason = document.getElementById('death-reason') as HTMLElement;

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

function showDamageFlash() {
  damageFlash.style.opacity = '1';
  setTimeout(() => {
    damageFlash.style.opacity = '0';
  }, 100);
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

function updateLeaderboard(entries: LeaderboardEntry[]) {
  leaderboardRows.innerHTML = '';
  entries.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `<span>${e.name}</span><span style="color: #38bdf8; font-weight: 600;">${e.score} pts</span>`;
    leaderboardRows.appendChild(row);
  });
}

// Multiplayer Network Setup
const network = new NetworkManager(
  scene,
  savedName,
  (count) => {
    playerCountPill.textContent = `${count} ${count === 1 ? 'Player' : 'Players'}`;
  },
  (dmg, attackerName) => {
    if (isPlayerDead) return;
    playerHealth -= dmg;
    showDamageFlash();
    updateHealthUI();

    if (playerHealth <= 0) {
      handlePlayerDeath(attackerName);
    }
  },
  (killer, victim) => {
    addKillFeedMessage(killer, victim);
  },
  (leaderboard) => {
    updateLeaderboard(leaderboard);
  }
);

function handlePlayerDeath(attackerName: string) {
  isPlayerDead = true;
  playDeathSound();
  network.sendKill(network.localName, network.localId);
  network.recordDeathInDB();

  deathReason.textContent = `Eliminated by ${attackerName}. Respawning in 3s...`;
  deathScreen.style.display = 'flex';
  document.exitPointerLock();

  setTimeout(() => {
    const spawn = getRandomSpawn();
    camera.position.set(spawn.x, 1.6, spawn.z);
    playerHealth = 100;
    isPlayerDead = false;
    updateHealthUI();
    deathScreen.style.display = 'none';
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

// Controls & Weapon
const controls = setupInput(camera, renderer.domElement, blocker, playBtn);
const weapon = new WeaponSystem(camera, scene, office, network);

// Bake static shadow map once
renderer.shadowMap.needsUpdate = true;

// Name input change handler
playerNameInput.addEventListener('change', () => {
  const newName = playerNameInput.value.trim();
  if (newName) {
    localStorage.setItem('ofg_player_name', newName);
    network.setName(newName);
  }
});

let lastNetworkSync = 0;
let lastLeaderboardPoll = 0;

// Performance loop
let lastTime = performance.now();
let frames = 0;
let lastFpsUpdate = lastTime;

function animate(currentTime: number) {
  requestAnimationFrame(animate);

  const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
  lastTime = currentTime;

  if (!isPlayerDead) {
    controls.setAiming(weapon.isAiming);
    controls.update(delta, (nextPos) => {
      return office.isWalkable(nextPos.x, nextPos.z, 0.35);
    });
    weapon.update(delta);
  }

  network.update(delta);

  // Broadcast position (20 ticks/sec)
  if (currentTime - lastNetworkSync > 50 && !isPlayerDead) {
    network.broadcastPosition(
      camera.position.x,
      camera.position.y - 1.6,
      camera.position.z,
      controls.getYaw()
    );
    lastNetworkSync = currentTime;
  }

  // Poll database leaderboard periodically (every 10s)
  if (currentTime - lastLeaderboardPoll > 10000) {
    network.fetchLeaderboard();
    lastLeaderboardPoll = currentTime;
  }

  renderer.render(scene, camera);

  // FPS & Position stats
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
