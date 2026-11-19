import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Scene, Vector3 } from 'three';
import { RemotePlayer, PlayerAABB } from './player';
import { playHitSound } from './audio';

export interface PlayerState {
  id: string;
  name: string;
  color: number;
}

export interface MatchScoreEntry {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  score: number;
}

export class NetworkManager {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  public localId: string;
  public localName: string;
  public isConnected = false;
  private scene: Scene;
  private remotePlayers = new Map<string, RemotePlayer>();
  private matchScores = new Map<string, MatchScoreEntry>();

  private onPlayerCountChange?: (count: number) => void;
  private onLocalDamaged?: (amount: number, attackerName: string, attackerId: string) => void;
  private onKillFeed?: (killer: string, victim: string) => void;
  private onLeaderboardUpdate?: (leaderboard: MatchScoreEntry[]) => void;
  private onMatchEnded?: (enderName: string, reason?: string) => void;
  private onTimerSync?: (remainingSec: number) => void;

  constructor(
    scene: Scene,
    initialName = '',
    onPlayerCountChange?: (count: number) => void,
    onLocalDamaged?: (amount: number, attackerName: string, attackerId: string) => void,
    onKillFeed?: (killer: string, victim: string) => void,
    onLeaderboardUpdate?: (leaderboard: MatchScoreEntry[]) => void,
    onMatchEnded?: (enderName: string, reason?: string) => void,
    onTimerSync?: (remainingSec: number) => void
  ) {
    this.scene = scene;
    this.onPlayerCountChange = onPlayerCountChange;
    this.onLocalDamaged = onLocalDamaged;
    this.onKillFeed = onKillFeed;
    this.onLeaderboardUpdate = onLeaderboardUpdate;
    this.onMatchEnded = onMatchEnded;
    this.onTimerSync = onTimerSync;
    this.localId = 'usr_' + Math.random().toString(36).substring(2, 9);
    this.localName = initialName || 'Agent-' + this.localId.substring(4, 7).toUpperCase();

    this.matchScores.set(this.localId, {
      id: this.localId,
      name: this.localName,
      kills: 0,
      deaths: 0,
      score: 0
    });
  }

  public setName(name: string) {
    this.localName = name.trim() || 'Agent-' + this.localId.substring(4, 7).toUpperCase();
    const entry = this.matchScores.get(this.localId);
    if (entry) {
      entry.name = this.localName;
    }
    if (this.isConnected && this.channel) {
      this.channel.track({
        id: this.localId,
        name: this.localName,
        color: 0x3b82f6
      });
      this.syncPlayerProfileToDB();
      this.notifyLeaderboardChange();
    }
  }

  public connect(supabaseUrl: string, supabaseAnonKey: string) {
    if (!supabaseUrl || !supabaseAnonKey) {
      return;
    }

    try {
      this.client = createClient(supabaseUrl, supabaseAnonKey, {
        realtime: {
          params: {
            eventsPerSecond: 30
          }
        }
      });

      this.channel = this.client.channel('office-arena', {
        config: {
          presence: {
            key: this.localId
          }
        }
      });

      // Presence state tracking (joins/leaves)
      this.channel.on('presence', { event: 'sync' }, () => {
        const state = this.channel?.presenceState() || {};
        const activeIds = new Set<string>();

        for (const key of Object.keys(state)) {
          if (key === this.localId) continue;
          activeIds.add(key);

          const presences = state[key] as unknown as PlayerState[];
          if (presences && presences.length > 0) {
            const data = presences[0];
            let player = this.remotePlayers.get(key);
            if (!player) {
              player = new RemotePlayer(key, data.name || 'Agent', this.scene, data.color || 0xd97706);
              this.remotePlayers.set(key, player);
            } else if (data.name) {
              player.name = data.name;
            }

            if (!this.matchScores.has(key)) {
              this.matchScores.set(key, {
                id: key,
                name: data.name || 'Agent',
                kills: 0,
                deaths: 0,
                score: 0
              });
            } else if (data.name) {
              this.matchScores.get(key)!.name = data.name;
            }
          }
        }

        for (const [id, player] of this.remotePlayers.entries()) {
          if (!activeIds.has(id)) {
            player.destroy(this.scene);
            this.remotePlayers.delete(id);
          }
        }

        this.onPlayerCountChange?.(this.remotePlayers.size + 1);
        this.notifyLeaderboardChange();
      });

      // Position sync broadcast (30Hz tick)
      this.channel.on('broadcast', { event: 'pos' }, (payload) => {
        const data = payload.payload as { id: string; p: [number, number, number, number] };
        if (!data || data.id === this.localId) return;

        const player = this.remotePlayers.get(data.id);
        if (player) {
          const [x, y, z, yaw] = data.p;
          player.targetPos.set(x, y, z);
          player.targetYaw = yaw;
        }
      });

      // Bullet hit damage broadcast
      this.channel.on('broadcast', { event: 'hit' }, (payload) => {
        const data = payload.payload as { targetId: string; attackerId: string; attackerName: string; dmg: number };
        if (!data) return;

        if (data.targetId === this.localId) {
          this.onLocalDamaged?.(data.dmg, data.attackerName, data.attackerId);
        } else {
          const remoteTarget = this.remotePlayers.get(data.targetId);
          if (remoteTarget) {
            remoteTarget.takeDamageVisual();
            playHitSound();
          }
        }
      });

      // Kill announcements & per-match score updates
      this.channel.on('broadcast', { event: 'kill' }, (payload) => {
        const data = payload.payload as { killer: string; killerId: string; victim: string; victimId: string };
        if (data) {
          this.onKillFeed?.(data.killer, data.victim);

          const killerEntry = this.matchScores.get(data.killerId);
          if (killerEntry) {
            killerEntry.kills += 1;
            killerEntry.score += 100;
          } else {
            this.matchScores.set(data.killerId, {
              id: data.killerId,
              name: data.killer,
              kills: 1,
              deaths: 0,
              score: 100
            });
          }

          const victimEntry = this.matchScores.get(data.victimId);
          if (victimEntry) {
            victimEntry.deaths += 1;
          } else {
            this.matchScores.set(data.victimId, {
              id: data.victimId,
              name: data.victim,
              kills: 0,
              deaths: 1,
              score: 0
            });
          }

          const remoteTarget = this.remotePlayers.get(data.victimId);
          if (remoteTarget) {
            remoteTarget.setDead(true);
          }

          this.notifyLeaderboardChange();
        }
      });

      // Respawn announcement
      this.channel.on('broadcast', { event: 'respawn' }, (payload) => {
        const data = payload.payload as { id: string; p: [number, number, number] };
        if (data) {
          const remoteTarget = this.remotePlayers.get(data.id);
          if (remoteTarget) {
            remoteTarget.teleport(new Vector3(data.p[0], data.p[1], data.p[2]), 0);
            remoteTarget.setDead(false);
          }
        }
      });

      // End Game broadcast
      this.channel.on('broadcast', { event: 'end_match' }, (payload) => {
        const data = payload.payload as { enderName: string; reason?: string };
        if (data) {
          this.onMatchEnded?.(data.enderName || 'Time', data.reason);
        }
      });

      // Reset Match scores & timer broadcast
      this.channel.on('broadcast', { event: 'reset_match' }, (payload) => {
        const data = payload.payload as { startTime?: number };
        this.resetMatchScoresLocally();
        if (data && data.startTime) {
          this.onTimerSync?.(300);
        }
      });

      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.isConnected = true;
          await this.channel?.track({
            id: this.localId,
            name: this.localName,
            color: 0x3b82f6
          });
          this.syncPlayerProfileToDB();
          this.notifyLeaderboardChange();
          this.onPlayerCountChange?.(this.remotePlayers.size + 1);
        }
      });
    } catch (e) {
      console.error('Failed to initialize Supabase Realtime channel:', e);
    }
  }

  public resetMatchScores() {
    this.resetMatchScoresLocally();
    if (this.channel && this.isConnected) {
      this.channel.send({
        type: 'broadcast',
        event: 'reset_match',
        payload: {
          startTime: Date.now()
        }
      });
    }
  }

  private resetMatchScoresLocally() {
    for (const entry of this.matchScores.values()) {
      entry.kills = 0;
      entry.deaths = 0;
      entry.score = 0;
    }
    this.notifyLeaderboardChange();
  }

  private notifyLeaderboardChange() {
    if (!this.onLeaderboardUpdate) return;
    const sorted = Array.from(this.matchScores.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.kills - a.kills;
    });
    this.onLeaderboardUpdate(sorted);
  }

  private async syncPlayerProfileToDB() {
    if (!this.client) return;
    try {
      await this.client.from('players').upsert({
        id: this.localId,
        name: this.localName,
        last_seen: new Date().toISOString()
      }, { onConflict: 'id' });
    } catch {
      // Graceful
    }
  }

  public broadcastPosition(x: number, y: number, z: number, yaw: number) {
    if (!this.channel || !this.isConnected) return;

    this.channel.send({
      type: 'broadcast',
      event: 'pos',
      payload: {
        id: this.localId,
        p: [
          Math.round(x * 100) / 100,
          Math.round(y * 100) / 100,
          Math.round(z * 100) / 100,
          Math.round(yaw * 100) / 100
        ]
      }
    });
  }

  public sendDamage(targetId: string, dmg = 25) {
    if (!this.channel || !this.isConnected) return;

    this.channel.send({
      type: 'broadcast',
      event: 'hit',
      payload: {
        targetId,
        attackerId: this.localId,
        attackerName: this.localName,
        dmg
      }
    });
  }

  public sendKill(killerName: string, killerId: string, victimName: string, victimId: string) {
    if (!this.channel || !this.isConnected) return;

    this.channel.send({
      type: 'broadcast',
      event: 'kill',
      payload: {
        killer: killerName,
        killerId,
        victim: victimName,
        victimId
      }
    });

    const killerEntry = this.matchScores.get(killerId);
    if (killerEntry) {
      killerEntry.kills += 1;
      killerEntry.score += 100;
    }
    const victimEntry = this.matchScores.get(victimId);
    if (victimEntry) {
      victimEntry.deaths += 1;
    }
    this.notifyLeaderboardChange();
  }

  public sendRespawn(x: number, y: number, z: number) {
    if (!this.channel || !this.isConnected) return;

    this.channel.send({
      type: 'broadcast',
      event: 'respawn',
      payload: {
        id: this.localId,
        p: [
          Math.round(x * 100) / 100,
          Math.round(y * 100) / 100,
          Math.round(z * 100) / 100
        ]
      }
    });
  }

  public sendEndMatch(reason = 'time_up') {
    if (!this.channel || !this.isConnected) return;

    this.channel.send({
      type: 'broadcast',
      event: 'end_match',
      payload: {
        enderName: this.localName,
        reason
      }
    });
  }

  public raycastPlayers(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number
  ): { hitPlayer: RemotePlayer; dist: number; pointX: number; pointY: number; pointZ: number } | null {
    let closestDist = maxDist;
    let hitResult: { hitPlayer: RemotePlayer; dist: number; pointX: number; pointY: number; pointZ: number } | null = null;

    const invDx = 1 / (dx || 1e-8);
    const invDy = 1 / (dy || 1e-8);
    const invDz = 1 / (dz || 1e-8);

    for (const player of this.remotePlayers.values()) {
      if (player.isDead) continue;
      const b: PlayerAABB = player.getAABB();

      const t1 = (b.minX - ox) * invDx;
      const t2 = (b.maxX - ox) * invDx;
      const t3 = (b.minY - oy) * invDy;
      const t4 = (b.maxY - oy) * invDy;
      const t5 = (b.minZ - oz) * invDz;
      const t6 = (b.maxZ - oz) * invDz;

      const tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
      const tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));

      if (tmax >= 0 && tmin <= tmax && tmin < closestDist && tmin > 0.1) {
        closestDist = tmin;
        hitResult = {
          hitPlayer: player,
          dist: tmin,
          pointX: ox + dx * tmin,
          pointY: oy + dy * tmin,
          pointZ: oz + dz * tmin
        };
      }
    }

    return hitResult;
  }

  public update(delta: number) {
    for (const player of this.remotePlayers.values()) {
      player.updateInterpolation(delta);
    }
  }

  public getPlayerCount(): number {
    return this.remotePlayers.size + 1;
  }
}
