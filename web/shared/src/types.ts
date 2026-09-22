import { z } from 'zod';

// ── Zone types ──────────────────────────────────────────────────────────────

export type ZoneType = 'royalBlue' | 'royalYellow' | 'royalRed' | 'outlands' | 'roads' | 'roadsHideout' | 'other';

export interface Zone {
  id: string;
  name: string;
  type: ZoneType;
  tier: number;
  knownFeatures?: KnownFeatures;
  isRoadsHome?: boolean;
  category?: string;
  mapShape?: string;
  proximityTo?: string;
}

// ── GameMap (on-disk shape from maps.json) ──────────────────────────────────

export type MapType = 'royalBlue' | 'royalYellow' | 'royalRed' | 'outlands' | 'roads' | 'other';

export type KnownFeatures = string[];

export interface GameMap {
  mapID: string;
  mapName: string;
  mapType: MapType;
  tier: number;
  category?: string;
  isRoadsHideout?: true;
  knownFeatures?: KnownFeatures;
  mapShape?: string;
  socketCount?: number;
  largeSocketCount?: number;
  smallSocketCount?: number;
  proximityTo?: string;
}

// ── Connection ───────────────────────────────────────────────────────────────

export interface HandleCoordinates {
  position: { x: number; y: number };
}

export interface Connection {
  id: string;
  roomId: string;
  fromZoneId: string;
  toZoneId: string;
  fromHandleId?: string;
  toHandleId?: string;
  expiresAt: string;
  reportedAt: string;
  reportedBy?: string;
  isExpired?: boolean;
  startHandle?: HandleCoordinates;
  endHandle?: HandleCoordinates;
  chainId?: string;
  permanent?: boolean;
}

export interface NodePosition {
  zoneId: string;
  x: number;
  y: number;
  virtualGridPos?: { x: number; y: number };
  features?: NodeFeatures;
  customHandles?: CustomHandle[];
  rotation?: number;
  proximityTo?: string;
  explored?: boolean;
  chainId?: string;
}

export interface CustomHandle {
  id: string;
  left: string;
  top: string;
  disabled?: boolean;
  position?: 'top' | 'right' | 'bottom' | 'left';
}

export type ResourceType = 'fibre' | 'leather' | 'ore' | 'stone' | 'wood';

export interface ResourceEntry {
  type: ResourceType;
  small?: number;
  large?: number;
}

export interface TimedChest {
  size: 'S' | 'M' | 'L';
  timer: number; // Expiration timestamp in ms
}

export interface NodeFeatures {
  slots?: 7 | 20;
  reds?: number | null;
  redsTimer?: number; // Expiration timestamp in ms
  powercoreBlue?: boolean;
  powercorePurple?: boolean;
  powercoreGreen?: boolean;
  powercoreYellow?: boolean;
  powercoreTimerGreen?: number; // Expiration timestamp in ms
  powercoreTimerBlue?: number;  // Expiration timestamp in ms
  powercoreTimerPurple?: number; // Expiration timestamp in ms
  powercoreTimerYellow?: number; // Expiration timestamp in ms
  crystalCreaturePresent?: boolean;
  brecilienPortalPresent?: boolean;
  dungeonStatic?: boolean;
  dungeonGroup?: boolean;
  timedChest?: TimedChest;
  treasuresGreenCount?: number;
  treasuresBlueCount?: number;
  treasuresYellowCount?: number;
  dungeonStaticCount?: number;
  dungeonGroupCount?: number;
  resources?: ResourceEntry[];
  upstreamFeatures?: string[]; // Feature keys/resource types populated from upstream maps.json data (unconfirmed)
  lastUpdatedAt?: number; // Timestamp in ms
}

export type ConnectionStatus = 'active' | 'expired';

export function getConnectionStatus(connection: Connection, now: Date = new Date()): ConnectionStatus {
  const expiresAt = new Date(connection.expiresAt).getTime();
  const nowMs = now.getTime();

  if (nowMs < expiresAt) return 'active';
  return 'expired';
}

// ── Room Memory ──────────────────────────────────────────────────────────────

export interface RoomMemoryEntry {
  zoneId: string;
  timesAdded: string[]; // ISO date strings
  features?: NodeFeatures;
  customHandles?: CustomHandle[];
  rotation?: number;
  lastUpdated: string; // ISO date string
}

// ── Room ─────────────────────────────────────────────────────────────────────

/**
 * The Albion game server a room's map data was gathered on. Rooms created
 * before this existed have no server (`null` in the DB / `undefined` on the
 * wire) and are prompted to pick one in-room; everything downstream must treat
 * "unassigned" as a real state.
 */
export const ROOM_SERVERS = ['eu', 'us', 'asia'] as const;
export type RoomServer = typeof ROOM_SERVERS[number];

export const ROOM_SERVER_LABELS: Record<RoomServer, string> = {
  eu: 'Europe',
  us: 'Americas',
  asia: 'Asia',
};

export interface Room {
  id: string;
  title?: string;
  server?: RoomServer;
  passwordHash: string;
  adminPasswordHash: string;
  homeZoneId: string;
  createdAt: string;
  updatedAt?: string;
  plottedRoute?: string[];
  plottedRouteFromZoneId?: string;
  plottedRouteToZoneId?: string;
  plottedRouteChainId?: string;
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

export const ZoneTypeSchema = z.enum([
  'royalBlue',
  'royalYellow',
  'royalRed',
  'outlands',
  'roads',
  'roadsHideout',
  'other',
]);

export const ZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ZoneTypeSchema,
  tier: z.number().int().min(1).max(8),
  knownFeatures: z.array(z.string()).optional(),
  isRoadsHome: z.boolean().optional(),
  category: z.string().optional(),
  mapShape: z.string().optional(),
  proximityTo: z.string().optional(),
});

export const ConnectionSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string(),
  fromZoneId: z.string(),
  toZoneId: z.string(),
  fromHandleId: z.string().optional(),
  toHandleId: z.string().optional(),
  expiresAt: z.string().datetime(),
  reportedAt: z.string().datetime(),
  reportedBy: z.string().optional(),
  chainId: z.string().nullable().optional(),
  permanent: z.boolean().optional(),
  startHandle: z.object({
    position: z.object({ x: z.number(), y: z.number() }),
  }).optional(),
  endHandle: z.object({
    position: z.object({ x: z.number(), y: z.number() }),
  }).optional(),
});

export const RoomServerSchema = z.enum(ROOM_SERVERS);

export const RoomSchema = z.object({
  id: z.string(),
  title: z.string().max(50).optional(),
  server: RoomServerSchema.optional(),
  passwordHash: z.string(),
  adminPasswordHash: z.string(),
  homeZoneId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

// ── API request schemas ───────────────────────────────────────────────────────

/**
 * `server` is deliberately OPTIONAL here even though the create form requires
 * it: an older deployed client (or an API consumer) posting without it must
 * still be able to create a room — it lands unassigned and gets prompted
 * in-room. Tightening this to required would break creation during a rollout
 * where the client lags the server.
 */
export const CreateRoomBodySchema = z.object({
  password: z.string().min(1),
  adminPassword: z.string().min(1),
  homeZoneId: z.string().min(1),
  title: z.string().max(50).optional(),
  server: RoomServerSchema.optional(),
  vanityUrl: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
});

/**
 * `adminPassword` is only required when the room ALREADY has a server and the
 * request changes it — the first assignment is open to any room member so the
 * in-room prompt can backfill existing rooms without an admin-password wall.
 * The route enforces that rule; the schema can't express it.
 */
export const SetRoomServerBodySchema = z.object({
  server: RoomServerSchema,
  adminPassword: z.string().min(1).optional(),
});

export const AuthRoomBodySchema = z.object({
  password: z.string().min(1),
});

export const AdminAuthRoomBodySchema = z.object({
  adminPassword: z.string().min(1),
});

export const SetRoomLockBodySchema = z.object({
  locked: z.boolean(),
});

/**
 * Generic analytics event. `type` is an open slug (not an enum) so new client
 * events need no server changes — the server buckets them per event type per
 * Europe/London day. The regex + length cap are the only guard against junk
 * types on an unauthenticated endpoint, so keep them strict.
 */
export const EventBodySchema = z.object({
  type: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
});

/**
 * Payload embedded in room JWTs. `role` is only ever set to 'admin' by the
 * server after verifying the room's admin password — it must never be
 * derivable from any client-supplied input.
 */
export interface RoomTokenPayload {
  roomId: string;
  passwordVersion?: number;
  role?: 'admin';
}

export const CreateConnectionBodySchema = z.object({
  fromZoneId: z.string().min(1),
  toZoneId: z.string().min(1),
  fromHandleId: z.string().nullable().optional(),
  toHandleId: z.string().nullable().optional(),
  permanent: z.boolean().optional(),
  secondsRemaining: z.number().int().min(1).max(86400).optional(),
  slots: z.union([z.literal(7), z.literal(20)], {
    errorMap: () => ({ message: 'slots is required and must be 7 or 20' }),
  }).optional(),
  reportedBy: z.string().optional(),
  targetPosition: z.object({ x: z.number(), y: z.number() }).optional(),
}).superRefine((data, ctx) => {
  if (!data.permanent) {
    if (data.secondsRemaining === undefined || data.secondsRemaining === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'secondsRemaining is required', path: ['secondsRemaining'] });
    }
    if (data.slots === undefined || data.slots === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'slots is required and must be 7 or 20', path: ['slots'] });
    }
  }
});

export const UpdateConnectionBodySchema = z.object({
  secondsRemaining: z.number().int().min(1).max(86400).optional(),
  fromHandleId: z.string().nullable().optional(),
  toHandleId: z.string().nullable().optional(),
});

/**
 * Body for the bulk connection delete endpoint. The client walks the
 * connection tree locally (e.g. "delete this & connected") and submits every
 * doomed connection in one request, so the server can prune the whole branch —
 * connections plus any zones that become orphaned — in a single statement
 * instead of N round trips.
 */
export const BulkDeleteConnectionsBodySchema = z.object({
  connectionIds: z.array(z.string().min(1)).min(1).max(500),
});

export const ChangePasswordBodySchema = z.object({
  newPassword: z.string().min(1),
  adminPassword: z.string().min(1),
});

export const AddChainBodySchema = z.object({
  sourceZoneId: z.string().min(1),
  // Optional initial position. When provided, the server inserts the new
  // chain's source node at these coords instead of (0,0). Used by the
  // "ghost on cursor" placement flow in the client.
  x: z.number().optional(),
  y: z.number().optional(),
});

export type RoomChain = {
  id: string;
  sourceZoneId: string;
  chainNumber: number;
  chainColor: string;
};

// Default palette for chains. Index 0 is reserved for the primary chain;
// subsequent chains cycle through indices 1..N. Kept in sync with the
// `1777245947015_add-chain-number-and-color.js` migration.
export const CHAIN_COLOR_PALETTE = [
  '#10b981', // primary — emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#f59e0b', // orange
  '#22c55e', // green
  '#a78bfa', // light purple
  '#06b6d4', // cyan
  '#ffffff', // white
] as const;

export const PRIMARY_CHAIN_COLOR = CHAIN_COLOR_PALETTE[0];

// Hex colour validator used for the PATCH /chains/:chainId/color endpoint
// and shared between client + server.
export const ChainColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const UpdateChainBodySchema = z.object({
  chainColor: ChainColorSchema,
});

export const RelocateChainBodySchema = z.object({
  sourceZoneId: z.string().min(1),
});

export const RenameRoomBodySchema = z.object({
  title: z.string().max(50),
  adminPassword: z.string().min(1),
});

// Pick a default colour for a chain at the given 1-based chain number.
export function defaultChainColor(chainNumber: number): string {
  if (chainNumber <= 1) return CHAIN_COLOR_PALETTE[0];
  const cycleSize = CHAIN_COLOR_PALETTE.length - 1; // exclude the primary slot
  const idx = 1 + ((chainNumber - 2) % cycleSize);
  return CHAIN_COLOR_PALETTE[idx];
}

export const ResourceEntrySchema = z.object({
  type: z.enum(['fibre', 'leather', 'ore', 'stone', 'wood']),
  small: z.number().optional(),
  large: z.number().optional(),
});

export const NodeFeaturesSchema = z.object({
  slots: z.union([z.literal(7), z.literal(20)]).optional(),
  reds: z.number().nullable().optional(),
  redsTimer: z.number().optional(),
  powercoreBlue: z.boolean().optional(),
  powercorePurple: z.boolean().optional(),
  powercoreGreen: z.boolean().optional(),
  powercoreYellow: z.boolean().optional(),
  powercoreTimerGreen: z.number().optional(),
  powercoreTimerBlue: z.number().optional(),
  powercoreTimerPurple: z.number().optional(),
  powercoreTimerYellow: z.number().optional(),
  crystalCreaturePresent: z.boolean().optional(),
  brecilienPortalPresent: z.boolean().optional(),
  dungeonStatic: z.boolean().optional(),
  dungeonGroup: z.boolean().optional(),
  timedChest: z.object({
    size: z.enum(['S', 'M', 'L']),
    timer: z.number(),
  }).optional(),
  treasuresGreenCount: z.number().optional(),
  treasuresBlueCount: z.number().optional(),
  treasuresYellowCount: z.number().optional(),
  dungeonStaticCount: z.number().optional(),
  dungeonGroupCount: z.number().optional(),
  resources: z.array(ResourceEntrySchema).optional(),
}).passthrough().optional();

export const CustomHandleSchema = z.object({
  id: z.string(),
  left: z.string(),
  top: z.string(),
  disabled: z.boolean().optional(),
});

export const NodePositionSchema = z.object({
  zoneId: z.string(),
  x: z.number(),
  y: z.number(),
  virtualGridPos: z.object({ x: z.number(), y: z.number() }).optional(),
  features: NodeFeaturesSchema.optional(),
  customHandles: z.array(CustomHandleSchema).nullable().optional(),
  rotation: z.number().optional(),
  explored: z.boolean().optional(),
  chainId: z.string().nullable().optional(),
});

export const RoomMemoryEntrySchema = z.object({
  zoneId: z.string(),
  timesAdded: z.array(z.string()),
  features: NodeFeaturesSchema.optional(),
  customHandles: z.array(CustomHandleSchema).nullable().optional(),
  rotation: z.number().optional(),
  lastUpdated: z.string(),
});

export const ImportRoomBodySchema = z.object({
  homeZoneId: z.string(),
  connections: z.array(z.object({
      id: z.string().optional(),
      roomId: z.string().optional(),
      fromZoneId: z.string(),
      toZoneId: z.string(),
      fromHandleId: z.string().nullable().optional(),
      toHandleId: z.string().nullable().optional(),
      expiresAt: z.string().datetime(),
      reportedAt: z.string().datetime().optional(),
      reportedBy: z.string().optional(),
      chainId: z.string().nullable().optional(),
      permanent: z.boolean().optional(),
  })),
  nodePositions: z.array(NodePositionSchema),
  roomHistory: z.array(RoomMemoryEntrySchema).optional(),
  chains: z.array(z.object({
    id: z.string().optional(),
    sourceZoneId: z.string(),
  })).optional(),
});

// ── WebSocket message types ───────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'auth_ok' }
  | { type: 'sync'; connections: Connection[]; homeZoneId: string; title?: string; server?: RoomServer; nodePositions: NodePosition[]; lastUpdatedAt: string; watching: number; totalConnected: number; plottedRoute?: string[]; plottedRouteFromZoneId?: string; plottedRouteToZoneId?: string; plottedRouteChainId?: string; chains?: RoomChain[]; locked?: boolean }
  | { type: 'connection_added'; connection: Connection }
  | { type: 'connection_updated'; connection: Connection }
  // `connectionIds` carries a batch removal (bulk delete of a whole branch);
  // `connectionId` remains for single deletes. Clients must honour both.
  | { type: 'connection_removed'; connectionId?: string; connectionIds?: string[]; removedZoneIds?: string[] }
  | { type: 'connection_expired'; connectionId: string }
  | { type: 'room_updated'; homeZoneId: string }
  | { type: 'room_reset' }
  | { type: 'node_positions_updated'; nodePositions: NodePosition[]; updateLastUpdated?: boolean }
  | { type: 'ping'; zoneName: string; nodeId?: string }
  | { type: 'marco' }
  | { type: 'polo' }
  | { type: 'watching'; roomId: string; count: number; totalConnected: number }
  | { type: 'memory_sync'; memory: RoomMemoryEntry[] }
  | { type: 'memory_updated'; entry: RoomMemoryEntry }
  | { type: 'memory_deleted'; zoneId: string }
  | { type: 'plot_route_updated'; plottedRoute: string[]; fromZoneId?: string; toZoneId?: string; chainId?: string }
  | { type: 'password_rotated' }
  | { type: 'room_deleted' }
  | { type: 'force_reload' }
  | { type: 'chain_added'; chain: RoomChain }
  | { type: 'chain_removed'; chainId: string; removedZoneIds: string[]; removedConnectionIds: string[] }
  | { type: 'chain_updated'; chain: RoomChain }
  | { type: 'chain_relocated'; chain: RoomChain; removedZoneIds: string[]; removedConnectionIds: string[]; newHomeZoneId?: string; newSourceNodePosition: NodePosition }
  | { type: 'room_title_updated'; title: string }
  | { type: 'room_server_updated'; server: RoomServer }
  | { type: 'room_lock_changed'; locked: boolean }
  | { type: 'session_expired'; reason: string }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'ping'; zoneName: string; nodeId?: string }
  | { type: 'polo' }
  | { type: 'marco' }
  | { type: 'update_node_positions'; nodePositions: NodePosition[]; updateLastUpdated?: boolean }
  | { type: 'rotate_zone'; zoneId: string; rotation: number; customHandles?: CustomHandle[] }
  | { type: 'update_plot_route'; plottedRoute: string[]; fromZoneId?: string; toZoneId?: string; chainId?: string }
  | { type: 'create_connection'; fromZoneId: string; toZoneId: string; fromHandleId?: string; toHandleId?: string; secondsRemaining: number; slots?: number; reportedBy?: string; targetPosition?: { x: number; y: number }; permanent?: boolean };
