/**
 * Net module entry point. Transports are created through openRoom() so trystero (and its Nostr
 * crypto dependency) is only downloaded when real P2P is used (dynamic import -> separate chunk).
 *
 *   ?net=local    BroadcastChannel between tabs (offline multiplayer testing)
 *   ?net=offline  single player, local player is host with zero peers
 *   (default)     p2p via trystero / Nostr
 *   ?lat=80&jit=20  simulated one-way latency / jitter for ?net=local
 *   TURN relay for players behind strict NATs (P2P only): localStorage 'efsun.turn' = JSON
 *     {"urls":"turn:host:3478","username":"u","credential":"p"} (object or array of them). Applied to every p2p room
 *     (game + lobby). Deliberately not readable from the URL (credentials do not belong in links). See configuredTurnServers().
 */
import { OfflineTransport, type ChannelMap, type NetTransport, type TransportConfig } from './transport';
import {
  GAME_CHANNELS,
  LOBBY_CHANNELS,
  LOBBY_ROOM_ID,
  NET_APP_ID,
  gameRoomId,
  type GameChannels,
  type LobbyChannels,
} from './messages';
import type { LocalTransportConfig } from './LocalTransport';
import type { TrysteroTransportConfig } from './TrysteroTransport';

export * from './transport';
export * from './messages';
export * from './lobby';
export type { LocalTransportConfig } from './LocalTransport';
export type { TrysteroTransportConfig } from './TrysteroTransport';

export type NetMode = 'offline' | 'local' | 'p2p';

type Extra<T> = Omit<T, keyof TransportConfig>;

export interface OpenRoomOptions {
  mode: NetMode;
  roomId: string;
  channels: readonly string[];
  password?: string;
  appId?: string;
  local?: Extra<LocalTransportConfig>;
  p2p?: Extra<TrysteroTransportConfig>;
}

export async function openRoom<M extends ChannelMap>(o: OpenRoomOptions): Promise<NetTransport<M>> {
  const base: TransportConfig = {
    appId: o.appId ?? NET_APP_ID,
    roomId: o.roomId,
    channels: o.channels,
    ...(o.password ? { password: o.password } : {}),
  };
  switch (o.mode) {
    case 'offline':
      return new OfflineTransport<M>(o.roomId);
    case 'local': {
      const { LocalTransport } = await import('./LocalTransport');
      return new LocalTransport<M>({ ...o.local, ...base });
    }
    case 'p2p': {
      const { TrysteroTransport } = await import('./TrysteroTransport');
      const turn = configuredTurnServers();
      return new TrysteroTransport<M>({ ...(turn.length ? { turnServers: turn } : {}), ...o.p2p, ...base });
    }
  }
}

type TurnServers = NonNullable<TrysteroTransportConfig['turnServers']>;

const TURN_URL = /^turns?:[A-Za-z0-9._\-\[\]:%]+(\?transport=(udp|tcp))?$/;

/**
 * TURN servers configured by the player / site owner (none by default: trystero then uses its public STUN servers only, which
 * is enough for most home networks but fails behind symmetric NATs). Source: localStorage 'efsun.turn' (JSON object or array
 * of {urls, username?, credential?}). Only turn:/turns: URLs are accepted.
 */
export function configuredTurnServers(): TurnServers {
  const out: TurnServers = [];
  const add = (urls: unknown, username: unknown, credential: unknown): void => {
    const list = (Array.isArray(urls) ? urls : [urls]).filter((u): u is string => typeof u === 'string' && u.length <= 200 && TURN_URL.test(u)).slice(0, 4);
    if (!list.length) return;
    out.push({
      urls: list.length === 1 ? list[0] : list,
      ...(typeof username === 'string' && username ? { username: username.slice(0, 200) } : {}),
      ...(typeof credential === 'string' && credential ? { credential: credential.slice(0, 200) } : {}),
    });
  };
  try {
    const raw = globalThis.localStorage?.getItem('efsun.turn');
    if (raw) {
      const j: unknown = JSON.parse(raw);
      for (const e of (Array.isArray(j) ? j : [j]).slice(0, 4)) {
        if (typeof e === 'object' && e !== null) {
          const r = e as Record<string, unknown>;
          add(r.urls, r.username, r.credential);
        }
      }
    }
  } catch {
    /* storage blocked or bad JSON: ignore */
  }
  return out;
}

/** Game room for a party code (makeRoomCode()). The host and every member call this. */
export function openGameRoom(
  mode: NetMode,
  code: string,
  password?: string,
  extra?: Pick<OpenRoomOptions, 'local' | 'p2p'>,
): Promise<NetTransport<GameChannels>> {
  return openRoom<GameChannels>({ mode, roomId: gameRoomId(code), channels: GAME_CHANNELS, password, ...extra });
}

/** Lobby for the room browser. Joined ACTIVELY (see docs/NETCODE.md 3.3 on why not passive). */
export function openLobby(
  mode: Exclude<NetMode, 'offline'>,
  extra?: Pick<OpenRoomOptions, 'local' | 'p2p'>,
): Promise<NetTransport<LobbyChannels>> {
  return openRoom<LobbyChannels>({ mode, roomId: LOBBY_ROOM_ID, channels: LOBBY_CHANNELS, ...extra });
}

/** Reads ?net=, ?lat=, ?jit= from the page URL. */
export function netOptionsFromUrl(search: string = globalThis.location?.search ?? ''): {
  mode: NetMode;
  local: Extra<LocalTransportConfig>;
} {
  const q = new URLSearchParams(search);
  const net = q.get('net');
  const mode: NetMode = net === 'local' || net === 'offline' ? net : 'p2p';
  const lat = Number(q.get('lat') ?? 0);
  const jit = Number(q.get('jit') ?? 0);
  return {
    mode,
    local: {
      latencyMs: Number.isFinite(lat) ? Math.max(0, Math.min(1000, lat)) : 0,
      jitterMs: Number.isFinite(jit) ? Math.max(0, Math.min(1000, jit)) : 0,
    },
  };
}
