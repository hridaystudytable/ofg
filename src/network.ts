import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Scene, Vector3 } from 'three';
import { RemotePlayer, PlayerAABB } from './player';
import { playHitSound } from './audio';

export interface PlayerState {
  id: string;
  name: string;
  color: number;
}

export interface LeaderboardEntry {
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
  private onPlayerCountChange?: (count: number) => void;
  private onLocalDamaged?: (amount: number, attackerName: string, attackerId: string) => void;
  private onKillFeed?: (killer: string, victim: string) => void;
  private onLeaderboardUpdate?: (leaderboard: LeaderboardEntry[]) => void;
  private onMatchEnded?: (enderName: string) => void;

  constructor(
    scene: Scene,
    initialName = '',
    onPlayerCountChange?: (count: number) => void,
    onLocalDamaged?: (amount: number, attackerName: string, attackerId: string) => void,
    onKillFeed?: (killer: string, victim: string) => void,
    onLeaderboardUpdate?: (leaderboard: LeaderboardEntry[]) => void,
    onMatchEnded?: (enderName: string) => void
  ) {
    this.scene = scene;
    this.onPlayerCountChange = onPlayerCountChange;
    this.onLocalDamaged = onLocalDamaged;
    this.onKillFeed = onKillFeed;
    this.onLeaderboardUpdate = onLeaderboardUpdate;
    this.onMatchEnded = onMatchEnded;
    this.localId = 'usr_' + Math.random().toString(36).substring(2, 9);
    this.localName = initialName || 'Agent-' + this.localId.substring(4, 7).toUpperCase();
  }

  public setName(name: string) {
    this.localName = name.trim() || 'Agent-' + this.localId.substring(4, 7).toUpperCase();
    if (this.isConnected && this.channel) {
      this.channel.track({
        id: this.localId,
        name: this.localName,
        color: 0x3b82f6
      });
      this.syncPlayerProfileToDB();
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
          }
        }

        for (const [id, player] of this.remotePlayers.entries()) {
          if (!activeIds.has(id)) {
            player.destroy(this.scene);
            this.remotePlayers.delete(id);
          }
        }

        this.onPlayerCountChange?.(this.remotePlayers.size + 1);
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

      // Kill announcements
      this.channel.on('broadcast', { event: 'kill' }, (payload) => {
        const data = payload.payload as { killer: string; killerId: string; victim: string; victimId: string };
        if (data) {
          this.onKillFeed?.(data.killer, data.victim);
          const remoteTarget = this.remotePlayers.get(data.victimId);
          if (remoteTarget) {
            remoteTarget.setDead(true);
          }
          setTimeout(() => this.fetchLeaderboard(), 400);
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
        const data = payload.payload as { enderName: string };
        if (data) {
          this.onMatchEnded?.(data.enderName || 'An agent');
        }
      });

      // Listen for database changes on players table
      this.client
        .channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
          this.fetchLeaderboard();
        })
        .subscribe();

      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.isConnected = true;
          await this.channel?.track({
            id: this.localId,
            name: this.localName,
            color: 0x3b82f6
          });
          this.syncPlayerProfileToDB();
          this.fetchLeaderboard();
          this.onPlayerCountChange?.(this.remotePlayers.size + 1);
        }
      });
    } catch (e) {
      console.error('Failed to initialize Supabase Realtime channel:', e);
    }
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

  public async recordKillInDB(killerId: string, killerName: string, victimId: string, victimName: string) {
    if (!this.client) return;
    try {
      await this.client.from('match_events').insert({
        killer_id: killerId,
        killer_name: killerName,
        victim_id: victimId,
        victim_name: victimName
      });

      const { data } = await this.client
        .from('players')
        .select('kills, score')
        .eq('id', killerId)
        .maybeSingle();

      const newKills = ((data?.kills) || 0) + 1;
      const newScore = ((data?.score) || 0) + 100;

      await this.client.from('players').upsert({
        id: killerId,
        name: killerName,
        kills: newKills,
        score: newScore,
        last_seen: new Date().toISOString()
      }, { onConflict: 'id' });

      this.fetchLeaderboard();
    } catch (err) {
      console.warn('Error recording kill in DB:', err);
    }
  }

  public async recordDeathInDB() {
    if (!this.client) return;
    try {
      const { data } = await this.client
        .from('players')
        .select('deaths')
        .eq('id', this.localId)
        .maybeSingle();

      const newDeaths = ((data?.deaths) || 0) + 1;

      await this.client.from('players').upsert({
        id: this.localId,
        name: this.localName,
        deaths: newDeaths,
        last_seen: new Date().toISOString()
      }, { onConflict: 'id' });

      this.fetchLeaderboard();
    } catch (err) {
      console.warn('Error recording death in DB:', err);
    }
  }

  public async fetchLeaderboard() {
    if (!this.client || !this.onLeaderboardUpdate) return;
    try {
      const { data } = await this.client
        .from('players')
        .select('id, name, kills, deaths, score')
        .order('score', { ascending: false })
        .limit(5);

      if (data && data.length > 0) {
        this.onLeaderboardUpdate(data as LeaderboardEntry[]);
      }
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

    this.recordKillInDB(killerId, killerName, victimId, victimName);
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

  public sendEndMatch() {
    if (!this.channel || !this.isConnected) return;

    this.channel.send({
      type: 'broadcast',
      event: 'end_match',
      payload: {
        enderName: this.localName
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
