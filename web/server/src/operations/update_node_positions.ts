import { ZONE_BY_ID, normalizeRotationSteps, inferRotationForZone, canonicalizeHandlesForRotation, type NodePosition, type CustomHandle, type RoomMemoryEntry } from 'shared';
import { broadcast } from '../broadcast.js';
import { trackRoomModified } from '../routes/rooms_analytics.js';
import type { OperationHandler } from './types.js';
import type { ClientMessage } from 'shared';
import { safeRollback } from '../db_tx.js';

export const handleUpdateNodePositions: OperationHandler<Extract<ClientMessage, { type: 'update_node_positions' }>> = async (
  ctx,
  msg
) => {
  if (!ctx.authenticated) return;
  if (!msg.nodePositions) return;
  if (!(await ctx.verifyWriteAccess())) return;

  // Deduplicate nodePositions by zoneId to prevent unique constraint violations
  const deduplicatedRaw = Array.from(
    msg.nodePositions.reduce((map, pos) => {
      map.set(pos.zoneId, pos);
      return map;
    }, new Map<string, NodePosition>()).values()
  );

  // Server-side rotation/handle self-heal: if the client is sending a
  // node whose stored `rotation` is inconsistent with its `customHandles`
  // (a desync), regenerate the canonical handle set from the requested
  // rotation rather than trusting potentially-stale client state.
  // The inferred rotation from handles is treated as authoritative when
  // it conflicts with `pos.rotation` because handles drive what the
  // user actually sees and clicks on.
  const deduplicated = deduplicatedRaw.map((pos) => {
    const zone = ZONE_BY_ID.get(pos.zoneId);
    if (!zone || !zone.mapShape || zone.type === 'roadsHideout') return pos;
    const handles = (pos.customHandles ?? null) as CustomHandle[] | null;
    if (!handles || handles.length === 0) {
      return { ...pos, rotation: normalizeRotationSteps(pos.rotation) };
    }
    const inferred = inferRotationForZone(zone.type, zone.mapShape, handles);
    const requested = normalizeRotationSteps(pos.rotation);
    if (inferred === null) {
      // Handles are inconsistent — rebuild them from defaults at the requested rotation.
      const canonical = canonicalizeHandlesForRotation(zone.type, zone.mapShape, handles, requested);
      return { ...pos, rotation: requested, customHandles: canonical };
    }
    if (inferred !== requested) {
      // Stored rotation disagrees with handle layout — handles win.
      return { ...pos, rotation: inferred };
    }
    return { ...pos, rotation: requested };
  });

  const client = await ctx.app.db.connect();
  try {
    await client.query('BEGIN');

    // Lock the room to serialize updates for the same room and prevent race conditions
    const { rows: homeZoneIdRows } = await client.query<{ home_zone_id: string }>(
      'SELECT home_zone_id FROM rooms WHERE id = $1 FOR UPDATE',
      [ctx.roomId]
    );
    const homeZoneIdRow = homeZoneIdRows[0];

    if (!homeZoneIdRow) {
      await client.query('ROLLBACK');
      return;
    }

    // Preserve chain_id across the delete+reinsert so multi-chain membership
    // survives any node-position save (otherwise drawing a connection from a node
    // would fail the chain_id lookup in POST /connections).
    const { rows: existingChainRows } = await client.query<{ zone_id: string; chain_id: string | null }>(
      'SELECT zone_id, chain_id FROM room_node_positions WHERE room_id = $1',
      [ctx.roomId]
    );
    const chainIdByZone = new Map<string, string | null>(
      existingChainRows.map((r) => [r.zone_id, r.chain_id])
    );
    await client.query('DELETE FROM room_node_positions WHERE room_id = $1', [ctx.roomId]);
    for (const pos of deduplicated) {
      await client.query(
        'INSERT INTO room_node_positions (room_id, zone_id, x, y, features, custom_handles, rotation, explored, chain_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (room_id, zone_id) DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, features = EXCLUDED.features, custom_handles = EXCLUDED.custom_handles, rotation = EXCLUDED.rotation, explored = EXCLUDED.explored, chain_id = COALESCE(room_node_positions.chain_id, EXCLUDED.chain_id)',
        [ctx.roomId, pos.zoneId, pos.x, pos.y, JSON.stringify(pos.features || {}), JSON.stringify(pos.customHandles || null), pos.rotation ?? 0, pos.explored ?? false, chainIdByZone.get(pos.zoneId) ?? null]
      );
    }
    if (msg.updateLastUpdated) {
      await client.query(
        'UPDATE rooms SET updated_at = $1 WHERE id = $2',
        [new Date().toISOString(), ctx.roomId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await safeRollback(client);
    throw e;
  } finally {
    client.release();
  }

  // Re-read from DB so the broadcast contains authoritative values (e.g. explored flag).
  // Include chain_id so clients can resolve the zone's chain (friendly id / colour pill)
  // immediately on broadcast — without it, a freshly added chain's source node would
  // arrive without a chainId and the pill would fall back to the primary chain.
  const { rows: updatedRows } = await ctx.app.db.query<{ zone_id: string; x: number; y: number; features: any; custom_handles: any; rotation: number; explored: boolean; chain_id: string | null }>(
    'SELECT zone_id, x, y, features, custom_handles, rotation, explored, chain_id FROM room_node_positions WHERE room_id = $1',
    [ctx.roomId]
  );
  const broadcastPositions: NodePosition[] = updatedRows.map((row) => ({
    zoneId: row.zone_id,
    x: row.x,
    y: row.y,
    features: row.features,
    customHandles: row.custom_handles,
    rotation: row.rotation ?? 0,
    explored: row.explored ?? false,
    chainId: row.chain_id ?? undefined,
  }));
  broadcast(ctx.roomId, { type: 'node_positions_updated', nodePositions: broadcastPositions, updateLastUpdated: msg.updateLastUpdated }, ctx.socket);
  trackRoomModified(ctx.app.db, ctx.roomId);

  // Update zone memory for nodes that already have a memory entry,
  // storing only map features (resources) and custom handles.
  // Skip non-roads zones.
  const now = new Date().toISOString();
  for (const pos of deduplicated) {
    const zone = ZONE_BY_ID.get(pos.zoneId);
    if (zone?.type !== 'roads' && zone?.type !== 'roadsHideout') continue;

    const memoryFeatures = (() => {
      const f = pos.features;
      if (!f) return null;
      const result: Record<string, any> = {};
      if (f.resources && f.resources.length > 0) result.resources = f.resources;
      if (f.treasuresGreenCount !== undefined) result.treasuresGreenCount = f.treasuresGreenCount;
      if (f.treasuresBlueCount !== undefined) result.treasuresBlueCount = f.treasuresBlueCount;
      if (f.treasuresYellowCount !== undefined) result.treasuresYellowCount = f.treasuresYellowCount;
      if (f.dungeonStatic !== undefined) result.dungeonStatic = f.dungeonStatic;
      if (f.dungeonGroup !== undefined) result.dungeonGroup = f.dungeonGroup;
      if (f.dungeonStaticCount !== undefined) result.dungeonStaticCount = f.dungeonStaticCount;
      if (f.dungeonGroupCount !== undefined) result.dungeonGroupCount = f.dungeonGroupCount;
      if (f.upstreamFeatures && f.upstreamFeatures.length > 0) result.upstreamFeatures = f.upstreamFeatures;
      // crystalCreaturePresent and brecilienPortalPresent are intentionally excluded (temporary flags)
      // chest/chestTimer are intentionally excluded (timed chest, not permanent)
      return Object.keys(result).length > 0 ? result : null;
    })();
    const memoryHandles = pos.customHandles && pos.customHandles.length > 0
      ? pos.customHandles
      : null;

    // Update or create zone memory
    // Always update features with the new value (even null) so that clearing resources
    // via the X button correctly removes them from memory. Previously, the CASE guard
    // `WHEN $3 IS NOT NULL` meant a null value (all features cleared) would leave stale
    // data in the memory entry.
    await ctx.app.db.query(`
      INSERT INTO room_node_memory (room_id, zone_id, features, custom_handles, rotation, last_updated, times_added)
      VALUES ($1, $2, $3, $4, $5, $6, ARRAY[$6::timestamptz])
      ON CONFLICT (room_id, zone_id) DO UPDATE SET
        features = $3,
        custom_handles = CASE WHEN $4 IS NOT NULL THEN $4 ELSE room_node_memory.custom_handles END,
        rotation = EXCLUDED.rotation,
        last_updated = EXCLUDED.last_updated
    `, [
      ctx.roomId,
      pos.zoneId,
      memoryFeatures ? JSON.stringify(memoryFeatures) : null,
      memoryHandles ? JSON.stringify(memoryHandles) : null,
      pos.rotation ?? 0,
      now,
    ]);

    const { rows: updatedMem } = await ctx.app.db.query<{ zone_id: string; times_added: string[]; features: any; custom_handles: any; rotation: number; last_updated: string }>(
      'SELECT zone_id, times_added, features, custom_handles, rotation, last_updated FROM room_node_memory WHERE room_id = $1 AND zone_id = $2',
      [ctx.roomId, pos.zoneId]
    );
    if (updatedMem[0]) {
      const entry: RoomMemoryEntry = {
        zoneId: updatedMem[0].zone_id,
        timesAdded: updatedMem[0].times_added,
        features: updatedMem[0].features ?? undefined,
        customHandles: updatedMem[0].custom_handles ?? undefined,
        rotation: updatedMem[0].rotation ?? 0,
        lastUpdated: updatedMem[0].last_updated,
      };
      broadcast(ctx.roomId, { type: 'memory_updated', entry });
    }
  }
};
