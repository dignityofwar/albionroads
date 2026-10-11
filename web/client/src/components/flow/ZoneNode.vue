<script setup lang="ts">
import { Position, useVueFlow, Handle, rendererPointToPoint } from '@vue-flow/core';
import type { NodeProps } from '@vue-flow/core';
import { ZoneType, NodeFeatures, CustomHandle, getDefaultHandles, getHandleFacing, rotationStepsToDegrees } from 'shared';
import { getBorderBgClass } from '@/utils/zoneStyles';
import { connectionStyle } from '@/utils/connectionStyle';
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent, TooltipPortal } from 'reka-ui';
import ZoneHeader from './zone/ZoneHeader.vue';
import ZoneCoresAndReds from './zone/ZoneCoresAndReds.vue';
import ZoneReds from './zone/ZoneReds.vue';
import ZoneFeatures from './zone/ZoneFeatures.vue';
import ZoneMapFeaturesModal from './zone/ZoneMapFeaturesModal.vue';
import ZoneChestButton from './zone/ZoneChestButton.vue';
import ZoneChestModal from './zone/ZoneChestModal.vue';
import ZoneHandleEditor from './zone/ZoneHandleEditor.vue';
import ZoneHandleEditorButton from './zone/ZoneHandleEditorButton.vue';
import ZoneNodeHandles from './ZoneNodeHandles.vue';
import PingButton from './zone/PingButton.vue';
import RoomMemoryButton from './zone/RoomMemoryButton.vue';
import BluePrompt from '@/components/ui/BluePrompt.vue';
import ChainIdPill from '@/components/common/ChainIdPill.vue';
import { useRoomStore } from '@/stores/useRoomStore';
import { useRoomMemoryStore } from '@/stores/useRoomMemoryStore';
import { usePlotRouteStore } from '@/stores/usePlotRouteStore';
import { storeToRefs } from 'pinia';
import { deleteConnection, deleteConnections, deleteNode, updateConnection } from '@/utils/roomOperations';
import { ref, watch, computed, nextTick, inject, onMounted, type Ref } from 'vue';
import { onClickOutside, useRafFn } from '@vueuse/core';
import { Z_INDEX } from '@/constants/Layers';

const props = defineProps<NodeProps<{ 
  isChainSource: boolean; 
  tier: number; 
  zoneName: string; 
  type: string; 
  features?: NodeFeatures;
  category?: string;
  proximityTo?: string;
  highlighted?: boolean;
  mapShape?: string;
  customHandles?: CustomHandle[];
  rotation?: number;
  isGhost?: boolean;
  explored?: boolean;
}>>();

const store = useRoomStore();
const memoryStore = useRoomMemoryStore();
const plotRouteStore = usePlotRouteStore();
const { connections, homeZoneId, isConnecting, nodePositions, connectingSourceNodeId } = storeToRefs(store);
const memoryEntry = computed(() => memoryStore.getEntry(props.id));
const featuresRequireUpdate = computed(() => {
  const entry = memoryEntry.value;
  if (!entry) return true;
  const f = entry.features;
  if (!f) return true;

  // Resources with unknown quantities (both small and large are null/undefined) need fixing
  if (f.resources && f.resources.some(r => r.small == null && r.large == null)) return true;

  // Check if any meaningful content exists
  const hasContent = (
    (f.resources && f.resources.length > 0) ||
    f.powercoreBlue || f.powercorePurple || f.powercoreGreen || f.powercoreYellow ||
    f.crystalCreaturePresent ||
    f.brecilienPortalPresent ||
    f.dungeonStatic || f.dungeonGroup ||
    (f.dungeonStaticCount && f.dungeonStaticCount > 0) ||
    (f.dungeonGroupCount && f.dungeonGroupCount > 0) ||
    (f.treasuresGreenCount && f.treasuresGreenCount > 0) ||
    (f.treasuresBlueCount && f.treasuresBlueCount > 0) ||
    (f.treasuresYellowCount && f.treasuresYellowCount > 0) ||
    f.slots != null
  );

  return !hasContent;
});
const { updateNodeData, findNode, viewport, viewportRef } = useVueFlow();
const now = inject<Ref<number>>('globalNow', ref(Date.now()));


const isIsolated = computed(() => store.isNodeIsolated(props.id, now.value));
const isExpired = computed(() => store.isNodeExpired(props.id, now.value));
const isRestricted = computed(() => isIsolated.value || isExpired.value);
const isUnexplored = computed(() => !props.data.isChainSource && !props.data.isGhost && !props.data.explored);

const isRoadsHideout = computed(() => props.data.type === 'roadsHideout');
const isHovered = ref(false);
const isPlotRouteTarget = computed(() => plotRouteStore.isPlotRouteMode && !props.data.isGhost && isHovered.value);
const isRouteFromZone = computed(() => plotRouteStore.fromZoneId === props.id && plotRouteStore.hasRoute);
const isRouteToZone = computed(() => plotRouteStore.toZoneId === props.id && plotRouteStore.hasRoute);
const isRouteDestination = computed(() => isRouteFromZone.value || isRouteToZone.value);
// During selectingTo: the chosen start zone should glow blue even before the route is committed
const isSelectingFromZone = computed(() => plotRouteStore.isSelectingTo && plotRouteStore.fromZoneId === props.id);
// During selectingTo: zones not in the selected chain should be dimmed
const thisNodeChainId = computed(() => nodePositions.value.find(n => n.zoneId === props.id)?.chainId ?? null);
const isGreyedByChain = computed(() =>
  plotRouteStore.isSelectingTo &&
  !props.data.isGhost &&
  thisNodeChainId.value !== plotRouteStore.chainId
);
const hasCustomHandles = computed(() => (props.data.customHandles?.length ?? 0) > 0);
const needsCustomHandles = computed(() => isRoadsHideout.value && !hasCustomHandles.value);

const isMapFeaturesModalOpen = ref(false);
const isHandleEditorOpen = ref(false);
const mapFeaturesModalContainerRef = ref<HTMLElement | null>(null);
const featuresContainerRef = ref<HTMLElement | null>(null);

function getInitialHandles(): CustomHandle[] {
  let handles = props.data.customHandles || [];
  
  if (handles.length === 0) {
    return getDefaultHandles(props.data.type as ZoneType, props.data.mapShape);
  }
  
  if (props.data.type === 'roadsHideout') {
    // Filter out shape handles for hideouts
    return handles.filter(h => !/^[cfhoptxs]-p\d+$/.test(h.id));
  }
  
  return handles;
}

const handleEditorButtonRef = ref<any>(null);
const mapFeaturesButtonRef = ref<HTMLElement | null>(null);

function openHandleEditor() {
  isHandleEditorOpen.value = true;
}

async function saveCustomHandles(newHandles: CustomHandle[], newRotation: number) {
  updateNodeData(props.id, { rotation: newRotation });

  const currentHandles = getInitialHandles();
  const newHandleIds = new Set(newHandles.map(h => h.id));

  // Handles that were removed entirely (not just disabled)
  const removedHandleIds = currentHandles.filter(h => !newHandleIds.has(h.id)).map(h => h.id);

  // Handles that are disabled in the new set
  const disabledHandleIds = newHandles.filter(h => h.disabled).map(h => h.id);

  const affectedHandleIds = [...new Set([...removedHandleIds, ...disabledHandleIds])];

  if (affectedHandleIds.length > 0) {
    // Find connections using these handles on THIS node (deduplicated)
    const seenConnIds = new Set<string>();
    const affectedConnections = store.connections.filter(c => {
      if (seenConnIds.has(c.id)) return false;
      const affected =
        (c.fromZoneId === props.id && affectedHandleIds.includes(c.fromHandleId!)) ||
        (c.toZoneId === props.id && affectedHandleIds.includes(c.toHandleId!));
      if (affected) seenConnIds.add(c.id);
      return affected;
    });

    for (const conn of affectedConnections) {
      try {
        if (conn.toZoneId === props.id && affectedHandleIds.includes(conn.toHandleId!)) {
          // Redirect the destination handle to center instead of deleting the connection
          await updateConnection(store.roomId, store.token, conn.id, { toHandleId: 'center' });
        } else {
          // Source handle was removed — delete the connection
          await deleteConnection(store.roomId, store.token, conn.id);
        }
      } catch (err) {
        console.error('Failed to update/delete connection for handle:', err);
      }
    }
  }

  // Handles + rotation are saved in a single atomic message; the server echoes
  // the authoritative result back to this client as well as everyone else.
  store.saveZoneHandles(props.id, newHandles, newRotation);
  isHandleEditorOpen.value = false;
  if (typeof showToast !== 'undefined') showToast('Handle positions updated', 'info', 8000);
}

const handleCloseTray = () => {
  isMapFeaturesModalOpen.value = false;
};
const zoneNodeRef = ref<HTMLElement | null>(null);

const showDeleteOverlay = ref(false);

async function handleDelete() {
  try {
    const nodeConns = store.connections.filter(
      c => c.fromZoneId === props.id || c.toZoneId === props.id
    );

    if (nodeConns.length === 0) {
      // Orphaned node — no connections at all, just remove the position
      await deleteNode(store.roomId, store.token, props.id);
      plotRouteStore.onNodeRemoved(props.id);
    } else {
      // Collect all connections touching this node plus their descendants
      const toDelete = new Set<string>();
      const queue = nodeConns.map(c => c.id);

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (toDelete.has(currentId)) continue;
        toDelete.add(currentId);
        const c = store.connections.find(x => x.id === currentId);
        if (c) {
          const children = store.connections.filter(x => x.fromZoneId === c.toZoneId);
          for (const child of children) queue.push(child.id);
        }
      }

      // One request for the whole branch — the server also drops every zone
      // the removal orphans, this node included, so `deleteNode` is only
      // needed when the position survived (chain source / home zone).
      const removed = await deleteConnections(store.roomId, store.token, Array.from(toDelete).reverse());
      if (!(removed?.removedZoneIds ?? []).includes(props.id)) {
        await deleteNode(store.roomId, store.token, props.id);
      }
      plotRouteStore.onNodeRemoved(props.id);
    }
  } catch (err) {
    console.error('Failed to delete node:', err);
  }
  showDeleteOverlay.value = false;
}

const activeEditingCore = ref<'powercoreGreen' | 'powercoreBlue' | 'powercorePurple' | 'powercoreYellow' | null>(null);

const handles = computed(() => {
  const custom = props.data.customHandles || [];
  const defaults = getDefaultHandles(props.data.type as ZoneType, props.data.mapShape);
  
  const h = [...custom];
  // Only merge defaults if no custom handles have been saved yet.
  // If customHandles is non-empty, the user has explicitly configured handles
  // (including deletions), so we must not add defaults back.
  if (custom.length === 0) {
    for (const def of defaults) {
      if (!h.find(c => c.id === def.id)) {
        h.push(def);
      }
    }
  }
  
  const center = h.find(h => h.id === 'center');
  if (!center) {
    h.push({ id: 'center', left: '50%', top: '50%', position: Position.Right });
  }

  // Hide this node's own center handle while dragging a connection from it,
  // so the source zone doesn't show a center snap target on itself.
  const isSource = isConnecting.value && store.connectingSourceNodeId === props.id;

  // Add overlay handle if connecting to allow for easy center snapping
  if (isConnecting.value && !isSource) {
    h.push({ id: 'center-overlay', left: '50%', top: '50%', position: Position.Right });
  }

  // Keep disabled handles visible but non-interactive (shown as hollow/greyed out)
  return isSource ? h.filter(x => x.id !== 'center') : h;
});

function getHandlePosition(left: string, top: string) {
  const facing = getHandleFacing(left, top);
  if (facing === 'n') return Position.Top;
  if (facing === 's') return Position.Bottom;
  if (facing === 'w') return Position.Left;
  return Position.Right;
}


const { onMoveStart, onMoveEnd, onNodeDragStart, onConnectStart, onConnectEnd, updateNode } = useVueFlow();

watch(isMapFeaturesModalOpen, (val) => {
  updateNode(props.id, { zIndex: val ? 9999 : 0 });
});
const isViewportMoving = ref(false);
onMoveStart(() => {
  isViewportMoving.value = true;
});
onMoveEnd(() => {
  setTimeout(() => {
    isViewportMoving.value = false;
  }, 50);
});

onNodeDragStart(() => {
  isMapFeaturesModalOpen.value = false;
});

onConnectStart((params) => {
  isMapFeaturesModalOpen.value = false;
  store.isConnecting = true;
  const { handleId, nodeId } = params;
  if (handleId && nodeId) {
    store.connectingSourceHandleId = handleId;
    store.connectingSourceNodeId = nodeId;
  } else {
    store.connectingSourceHandleId = null;
    store.connectingSourceNodeId = null;
  }
});

onConnectEnd(() => {
  store.connectingSourceHandleId = null;
  store.connectingSourceNodeId = null;
  store.isConnecting = false;
});

onClickOutside(mapFeaturesModalContainerRef, (_) => {
  if (!isMapFeaturesModalOpen.value) return;
  if (isViewportMoving.value) return;
  isMapFeaturesModalOpen.value = false;
}, { ignore: [featuresContainerRef] });

const timerValue = ref('');
const isEditingTimer = ref(false);
const timerComponentRefNW = ref<InstanceType<typeof ZoneCoresAndReds> | null>(null);
const timerComponentRefNE = ref<InstanceType<typeof ZoneCoresAndReds> | null>(null);
const timerContainerRefNW = ref<HTMLElement | null>(null);
const timerContainerRefNE = ref<HTMLElement | null>(null);

const isRedsOpen = ref(false);
const isChestModalOpen = ref(false);
const chestModalContainerRef = ref<HTMLElement | null>(null);

onClickOutside(chestModalContainerRef, () => {
  if (isChestModalOpen.value) isChestModalOpen.value = false;
});

function saveChest(size: 'S' | 'M' | 'L', timerValue: string) {
  const match = timerValue.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return;
  const m = parseInt(match[1], 10);
  const s = parseInt(match[2], 10);
  const totalSeconds = m * 60 + s;
  const currentFeatures = props.data.features || {};
  store.updateNodeFeatures(props.id, {
    ...currentFeatures,
    timedChest: { size, timer: now.value + totalSeconds * 1000 },
  });
}

function clearChest() {
  const currentFeatures = { ...(props.data.features || {}) };
  delete currentFeatures.timedChest;
  store.updateNodeFeatures(props.id, currentFeatures);
}


const promptsReady = ref(false);
onMounted(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      promptsReady.value = true;
    });
  });
  // If this hideout has been reset to a fresh state (no connections, default handles),
  // clear any stale dismissal so the hint shows again.
  if (isRoadsHideout.value && !hasAnyConnection.value && hasOnlyDefaultHandles.value) {
    undismissHideoutHint();
  }
});

const NODE_SIZE = 400;

function getHandleScreenPos(leftPct: string, topPct: string): { x: number; y: number } | null {
  const node = findNode(props.id);
  if (!node) return null;
  const vp = viewportRef.value;
  if (!vp) return null;
  const containerRect = vp.getBoundingClientRect();
  const left = parseFloat(leftPct) / 100;
  const top = parseFloat(topPct) / 100;
  const canvasX = node.computedPosition.x + left * NODE_SIZE;
  const canvasY = node.computedPosition.y + top * NODE_SIZE;
  const screen = rendererPointToPoint({ x: canvasX, y: canvasY }, viewport.value);
  return { x: containerRect.left + screen.x, y: containerRect.top + screen.y };
}

const nHandleScreenPos = ref<{ x: number; y: number } | null>(null);
const mapFeaturesButtonScreenPos = ref<{ x: number; y: number } | null>(null);

useRafFn(() => {
  if (showFreshRoomHint.value) {
    const nHandle = handles.value.find(h => h.id === 'n');
    if (nHandle) {
      nHandleScreenPos.value = getHandleScreenPos(nHandle.left, nHandle.top);
    }
  }
  if (mapFeaturesButtonRef.value) {
    const r = mapFeaturesButtonRef.value.getBoundingClientRect();
    mapFeaturesButtonScreenPos.value = { x: r.left + r.width / 2, y: r.top - 10 };
  }
});

const HIDEOUT_HINT_STORAGE_KEY = 'hideoutNHandleHintDismissedIds';
// Clean up legacy global dismissal flag so existing users get the hint back.
try { localStorage.removeItem('hideoutNHandleHintDismissed'); } catch {}
function readDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDEOUT_HINT_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
const hideoutHintDismissed = ref(readDismissedIds().has(props.id));

function dismissHideoutHint() {
  hideoutHintDismissed.value = true;
  try {
    const ids = readDismissedIds();
    ids.add(props.id);
    localStorage.setItem(HIDEOUT_HINT_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {}
}

function undismissHideoutHint() {
  hideoutHintDismissed.value = false;
  try {
    const ids = readDismissedIds();
    if (ids.has(props.id)) {
      ids.delete(props.id);
      localStorage.setItem(HIDEOUT_HINT_STORAGE_KEY, JSON.stringify([...ids]));
    }
  } catch {}
}

const hasOnlyDefaultHandles = computed(() => {
  const custom = props.data.customHandles || [];
  if (custom.length === 0) return true;
  const defaults = getDefaultHandles(props.data.type as ZoneType, props.data.mapShape);
  if (custom.length !== defaults.length) return false;
  const defaultIds = new Set(defaults.map(d => d.id));
  return custom.every(c => defaultIds.has(c.id) && !c.disabled);
});

const hasAnyConnection = computed(() =>
  connections.value.some(c => c.fromZoneId === props.id || c.toZoneId === props.id)
);

const showFreshRoomHint = computed(() => {
  if (!isRoadsHideout.value) return false;
  if (props.data.isGhost) return false;
  if (hideoutHintDismissed.value) return false;
  if (isHandleEditorOpen.value || isMapFeaturesModalOpen.value || isChestModalOpen.value) return false;
  if (hasAnyConnection.value) return false;
  if (!hasOnlyDefaultHandles.value) return false;
  return true;
});

// Auto-dismiss once the user creates their first connection on this hideout
watch(hasAnyConnection, (has ) => {
  if (has && !hideoutHintDismissed.value) dismissHideoutHint();
});

onClickOutside(timerContainerRefNW, (e) => {
  if (activeEditingCore.value && !timerContainerRefNE.value?.contains(e.target as Node)) {
    activeEditingCore.value = null;
  }
}, { capture: true });

onClickOutside(timerContainerRefNE, (e) => {
  if (activeEditingCore.value && !timerContainerRefNW.value?.contains(e.target as Node)) {
    activeEditingCore.value = null;
  }
}, { capture: true });

const MAX_TIMES = {
  powercoreGreen: 5 * 60,
  powercoreBlue: 15 * 60,
  powercorePurple: 30 * 60,
  powercoreYellow: 50 * 60,
};

const showToast = inject<(msg: string, type?: 'info' | 'error', duration?: number) => void>('showToast');
const showPingToast = inject<(zoneName: string, nodeId?: string) => void>('showPingToast');

const isPinged = ref(false);
const pingKey = ref(0);

function handlePing() {
  store.send({ type: 'ping', zoneName: props.data.zoneName || props.id, nodeId: props.id });
}

function handleMarkAsCorrect() {
  const currentFeatures = props.data.features || {};
  store.updateNodeFeatures(props.id, { ...currentFeatures });
}

const lastUpdatedText = computed(() => {
  const ts = props.data.features?.lastUpdatedAt;
  if (!ts) return '';
  const diffMs = now.value - ts;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    const remainingMins = diffMins % 60;
    return remainingMins > 0 ? `${diffHours}h ${remainingMins}m ago` : `${diffHours}h ago`;
  }
  return `${Math.floor(diffHours / 24)}d ago`;
});

const lastUpdatedColor = computed(() => {
  const ts = props.data.features?.lastUpdatedAt;
  if (!ts) return '';
  const diffMs = now.value - ts;
  const diffHours = diffMs / 3600000;
  if (diffHours < 2) return 'text-green-400';
  if (diffHours < 3) return 'text-orange-400';
  return 'text-red-400';
});

watch(() => store.lastPing, (ping) => {
  if (ping && ping.nodeId === props.id) {
    isPinged.value = false;
    pingKey.value++;
    requestAnimationFrame(() => {
      isPinged.value = true;
    });
  }
});


function formatTimer(expiresAtMs: number | undefined | null): string {
  if (expiresAtMs === undefined || expiresAtMs === null) return '';
  const remaining = Math.max(0, Math.floor((expiresAtMs - now.value) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getTimerKey(core: string): string {
  switch (core) {
    case 'powercoreGreen': return 'powercoreTimerGreen';
    case 'powercoreBlue': return 'powercoreTimerBlue';
    case 'powercorePurple': return 'powercoreTimerPurple';
    case 'powercoreYellow': return 'powercoreTimerYellow';
    default: return '';
  }
}

// Update timer value when the active core changes
watch(activeEditingCore, (newCore) => {
  if (!newCore) {
    timerValue.value = '';
    return;
  }
  
  const timerKey = getTimerKey(newCore);
  const val = props.data.features?.[timerKey as keyof NodeFeatures] as number | undefined;
  const formatted = formatTimer(val);
  
  // If we have a value from props, update it.
  // Otherwise keep current (might be auto-filled by toggleFeature)
  if (formatted) {
    timerValue.value = formatted;
  }
});

// Update timer value from external store changes (only if not currently typing)
watch([() => props.data.features, now], ([features, _]) => {
  if (isEditingTimer.value || !activeEditingCore.value) return;
  
  const timerKey = getTimerKey(activeEditingCore.value);
  const val = features?.[timerKey as keyof NodeFeatures] as number | undefined;
  timerValue.value = formatTimer(val);
}, { deep: true });

const isTimerValid = computed(() => {
  const match = timerValue.value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const s = parseInt(match[2], 10);
  return s < 60;
});

const isTimerTooLong = computed(() => {
  if (!activeEditingCore.value || !isTimerValid.value) return false;
  const match = timerValue.value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const m = parseInt(match[1], 10);
  const s = parseInt(match[2], 10);
  const totalSeconds = m * 60 + s;
  const maxSeconds = MAX_TIMES[activeEditingCore.value];
  return totalSeconds > maxSeconds;
});

const showFeatures = computed(() => {
  const type = props.data.type;
  if (!type) return true;
  return !type.startsWith('royal') && type !== 'outlands';
});

const activeFeatures = computed(() => {
  if (!props.data.features) return [];
  const features = props.data.features;
  const upstream = features.upstreamFeatures ?? [];
  const list: { type: string; title: string; icon: string; smallCount?: number; largeCount?: number; count?: number; isResource: boolean; upstream?: boolean }[] = [];
  
  const countableFeatures = [
    { key: 'treasuresGreen',        countKey: 'treasuresGreenCount',  title: 'Green Treasures',   icon: '/images/treasures-green.png' },
    { key: 'treasuresBlue',         countKey: 'treasuresBlueCount',   title: 'Blue Treasures',    icon: '/images/treasures-blue.png' },
    { key: 'treasuresYellow',       countKey: 'treasuresYellowCount', title: 'Yellow Treasures',  icon: '/images/treasures-yellow.png' },
    { key: 'crystalCreaturePresent',countKey: null,                   title: 'Crystal Creature',  icon: '/images/crystal.png' },
    { key: 'brecilienPortalPresent',countKey: null,                   title: 'Brecilien Portal',  icon: '/images/brecilien-portal.png' },
    { key: 'dungeonStatic',         countKey: 'dungeonStaticCount',   title: 'Static Dungeon',    icon: '/images/dungeon-static.png' },
    { key: 'dungeonGroup',          countKey: 'dungeonGroupCount',    title: 'Group Dungeon',     icon: '/images/dungeon-group.png' },
  ];

  const resourceMeta: Record<string, { title: string; icon: string }> = {
    fibre:   { title: 'Fibre',   icon: '/images/resource-fibre.png' },
    leather: { title: 'Leather', icon: '/images/resource-leather.png' },
    ore:     { title: 'Ore',     icon: '/images/resource-ore.png' },
    stone:   { title: 'Stone',   icon: '/images/resource-stone.png' },
    wood:    { title: 'Wood',    icon: '/images/resource-wood.png' },
  };

  for (const entry of (features.resources ?? [])) {
    const meta = resourceMeta[entry.type];
    if (!meta) continue;
    const smallCount = entry.small ?? 0;
    const largeCount = entry.large ?? 0;
    const isUpstream = upstream.includes(entry.type);
    if (smallCount > 0 || largeCount > 0 || isUpstream) {
      list.push({ type: entry.type, title: meta.title, icon: meta.icon, smallCount, largeCount, isResource: true, upstream: isUpstream && smallCount === 0 && largeCount === 0 });
    }
  }

  for (const f of countableFeatures) {
    const isBoolean = f.countKey === null;
    const countKey = f.countKey ?? '';
    const count = countKey ? ((features[countKey as keyof NodeFeatures] as number | undefined) ?? 0) : 0;
    const booleanVal = isBoolean ? (features[f.key as keyof NodeFeatures] as boolean | undefined) : false;
    
    const upstreamKey = isBoolean ? f.key : countKey;
    const isUpstream = upstream.includes(upstreamKey);
    
    const active = (isBoolean ? booleanVal : count > 0) || isUpstream;
    
    if (active) {
      list.push({ 
        type: f.key, 
        title: f.title, 
        icon: f.icon, 
        count: isBoolean ? undefined : count, 
        isResource: false, 
        upstream: isUpstream && (isBoolean ? !booleanVal : count === 0) 
      });
    }
  }
  return list;
});

const hasUnknownResources = computed(() => {
  const resources = props.data.features?.resources;
  if (!resources || resources.length === 0) return false;
  const hasUnknown = resources.some(r => r.small == null && r.large == null);
  const hasKnown = resources.some(r => (r.small != null && r.small > 0) || (r.large != null && r.large > 0));
  return hasUnknown && hasKnown;
});

const hasReds = computed(() => {
  const reds = props.data.features?.reds;
  const redsTimer = props.data.features?.redsTimer;
  if (redsTimer && redsTimer <= now.value) return false;
  return reds !== undefined && reds !== 0;
});

const diamondOuterClass = computed(() => {
  const classes: string[] = [Z_INDEX.NODE_BASE];

  if (hasReds.value) {
    classes.push('bg-red-500/80');
  } else if (props.data.isChainSource && !hasReds.value) {
    classes.push('bg-green-500');
  } else {
    classes.push(getBorderBgClass(props.data.type));
  }
  return classes;
});

const diamondInnerClass = computed(() => {
  const classes: string[] = [Z_INDEX.NODE_BORDER];

  if (hasReds.value) {
    classes.push('bg-red-950/80');
  } else {
    classes.push('bg-gray-800');
  }

  return classes;
});

function toggleFeature(feature: 'powercoreBlue' | 'powercorePurple' | 'powercoreGreen' | 'powercoreYellow' | 'crystalCreaturePresent' | 'brecilienPortalPresent' | 'dungeonStatic' | 'dungeonGroup') {
  const currentFeatures = props.data.features || {};
  const features = { ...currentFeatures };
  
  if (feature.startsWith('powercore')) {
    const isAlreadyEditing = activeEditingCore.value === feature;
    const timerKey = getTimerKey(feature);
    const expiresAt = features[timerKey as keyof NodeFeatures] as number | undefined;
    const isExpired = expiresAt && expiresAt <= now.value;

    if (isAlreadyEditing) {
      if (isExpired) {
        // If expired, reset to max instead of toggling off
        const maxSeconds = MAX_TIMES[feature as keyof typeof MAX_TIMES];
        features[feature] = true;
        features[timerKey as keyof NodeFeatures] = (now.value + maxSeconds * 1000) as any;
        const m = Math.floor(maxSeconds / 60);
        const s = maxSeconds % 60;
        timerValue.value = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      } else {
        // If already active core is clicked and not expired, do nothing.
        // User must use 'X' to clear.
        return;
      }
    } else {
      // If a different core is clicked, select it for editing and ensure it's ON
      features[feature] = true;
      activeEditingCore.value = feature as any;

      // Auto-fill max time ONLY IF no valid timer exists
      if (!expiresAt || isExpired) {
        const maxSeconds = MAX_TIMES[feature as keyof typeof MAX_TIMES];
        features[timerKey as keyof NodeFeatures] = (now.value + maxSeconds * 1000) as any;

        // Update local timerValue for immediate feedback
        const m = Math.floor(maxSeconds / 60);
        const s = maxSeconds % 60;
        timerValue.value = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
    }
  } else {
    features[feature] = !features[feature];
  }
  
  store.updateNodeFeatures(props.id, features);
}

function setFeatureSize(type: keyof NodeFeatures, size: 'S' | 'L') {
  const currentFeatures = props.data.features || {};
  const features: any = { ...currentFeatures };
  const sizeKey = `${type}Size` as keyof NodeFeatures;
  features[sizeKey] = size;
  features[type] = true;
  store.updateNodeFeatures(props.id, features);
}

function setFeatureCount(type: string, count: number) {
  const countKey = `${type}Count` as keyof NodeFeatures;
  const currentFeatures = props.data.features || {};
  const features: any = { ...currentFeatures };
  if (count > 0) {
    features[countKey] = count;
  } else {
    delete features[countKey];
  }
  // Clear upstream marker when user explicitly sets a count
  if (features.upstreamFeatures) {
    features.upstreamFeatures = features.upstreamFeatures.filter((k: string) => k !== String(countKey));
    if (features.upstreamFeatures.length === 0) delete features.upstreamFeatures;
  }
  store.updateNodeFeatures(props.id, features);
}

function setResourceCount(type: string, size: 'small' | 'large', count: number) {
  const currentFeatures = props.data.features || {};
  const resources = [...(currentFeatures.resources ?? [])];
  const idx = resources.findIndex(r => r.type === type);
  if (idx >= 0) {
    const updated = { ...resources[idx], [size]: count > 0 ? count : undefined };
    if (!updated.small && !updated.large) {
      resources.splice(idx, 1);
    } else {
      resources[idx] = updated;
    }
  } else if (count > 0) {
    resources.push({ type: type as any, [size]: count });
  }
  // Clear upstream marker when user explicitly sets a resource count
  let upstreamFeatures = currentFeatures.upstreamFeatures ? [...currentFeatures.upstreamFeatures] : undefined;
  if (upstreamFeatures) {
    upstreamFeatures = upstreamFeatures.filter(k => k !== type);
    if (upstreamFeatures.length === 0) upstreamFeatures = undefined;
  }
  store.updateNodeFeatures(props.id, { ...currentFeatures, resources, upstreamFeatures });
}

function clearResource(type: string) {
  const currentFeatures = props.data.features || {};
  const resources = [...(currentFeatures.resources ?? [])];
  const idx = resources.findIndex(r => r.type === type);
  if (idx >= 0) {
    resources.splice(idx, 1);
    
    // Clear upstream marker
    let upstreamFeatures = currentFeatures.upstreamFeatures ? [...currentFeatures.upstreamFeatures] : undefined;
    if (upstreamFeatures) {
      upstreamFeatures = upstreamFeatures.filter(k => k !== type);
      if (upstreamFeatures.length === 0) upstreamFeatures = undefined;
    }
    store.updateNodeFeatures(props.id, { ...currentFeatures, resources, upstreamFeatures });
  }
}


function saveTimer() {
  if (!activeEditingCore.value) return;
  
  if (isTimerTooLong.value) {
    showToast?.('The timer is too long', 'error');
    return;
  }
  
  const timerKey = getTimerKey(activeEditingCore.value);
  const currentFeatures = { ...(props.data.features || {}) };

  if (timerValue.value === '') {
    delete currentFeatures[timerKey as keyof NodeFeatures];
    if (activeEditingCore.value) {
      delete currentFeatures[activeEditingCore.value as keyof NodeFeatures];
    }
    store.updateNodeFeatures(props.id, currentFeatures);
    activeEditingCore.value = null;
    return;
  }

  const match = timerValue.value.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const m = parseInt(match[1], 10);
    const s = parseInt(match[2], 10);
    if (s < 60) {
      currentFeatures[timerKey as keyof NodeFeatures] = (now.value + (m * 60 + s) * 1000) as any;
      store.updateNodeFeatures(props.id, currentFeatures);
      
      // Blur the input after saving
      nextTick(() => {
        timerComponentRefNW.value?.blur();
        timerComponentRefNE.value?.blur();
      });
      activeEditingCore.value = null;
    }
  }
}

function clearTimer() {
  if (!activeEditingCore.value) return;
  timerValue.value = '';
  saveTimer();
  activeEditingCore.value = null;
}

function onTimerFocus() {
  isEditingTimer.value = true;
}

function onTimerBlur() {
  isEditingTimer.value = false;
  // Reset to formatted value from store
  if (!activeEditingCore.value) {
    timerValue.value = '';
    return;
  }
  const timerKey = getTimerKey(activeEditingCore.value);
  const newVal = props.data.features?.[timerKey as keyof NodeFeatures] as number | undefined;
  timerValue.value = formatTimer(newVal);
}

// ...


function updateReds(val: number | null | undefined) {
  const features = { ...(props.data.features || {}) };
  if (val === undefined) {
    delete features.reds;
    delete features.redsTimer;
  } else {
    features.reds = val;
    // Set/Refresh 15 minute timer
    features.redsTimer = now.value + 15 * 60 * 1000;
  }
  store.updateNodeFeatures(props.id, features);
}

function unlockCore(core: string) {
  const timerKey = getTimerKey(core);
  const features = { ...(props.data.features || {}) };
  // Set timer to current time so it's considered expired (unlocked)
  features[timerKey as keyof NodeFeatures] = now.value as any;
  store.updateNodeFeatures(props.id, features);
  
  if (activeEditingCore.value === core) {
    timerValue.value = '';
    activeEditingCore.value = null;
  }
}

function isInsideDiamond(e: MouseEvent): boolean {
  const el = zoneNodeRef.value;
  if (!el) return true;
  const rect = el.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  return Math.abs(x - cx) + Math.abs(y - cy) <= cx;
}

function onNodeMouseDown(e: MouseEvent) {
  // Allow events from interactive children (buttons, inputs, handles) regardless of position
  const target = e.target as HTMLElement;
  if (target.closest('button, input, .vue-flow__handle, .nodrag')) return;
  if (!isInsideDiamond(e)) {
    e.stopPropagation();
  }
}

function lockCore(core: string) {
  const timerKey = getTimerKey(core);
  const features = { ...(props.data.features || {}) };
  const maxSeconds = MAX_TIMES[core as keyof typeof MAX_TIMES];
  features[timerKey as keyof NodeFeatures] = (now.value + maxSeconds * 1000) as any;
  store.updateNodeFeatures(props.id, features);
  
  if (activeEditingCore.value === core) {
    const m = Math.floor(maxSeconds / 60);
    const s = maxSeconds % 60;
    timerValue.value = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
</script>

<template>
  <div class="zone-node relative" ref="zoneNodeRef" :class="{ 'ghost-node': props.data.isGhost }" @mousedown="onNodeMouseDown">
    <!-- Chain ID pill at the very top of the node.
         Always shown when the zone belongs to any chain (including the only/primary one). -->
    <ChainIdPill :zone-id="props.id" :position-style="{'z-index': '30' }" />
    <div :class="[isConnecting ? 'connecting-mode' : '']">
      <ZoneNodeHandles
        v-if="!isHandleEditorOpen && !isMapFeaturesModalOpen && !isChestModalOpen"
        :node-id="props.id"
        :node-type="props.data.type"
        :handles="handles"
        :is-restricted="isRestricted"
        :now="now"
      />
    </div>
    
    <!-- Plot route mode overlay: intercepts clicks on inner elements (cores, buttons, etc.) so only the node-level click registers.
         We drive isHovered from here so the glow activates even though this div sits on top of the inner content. -->
    <div
      v-if="plotRouteStore.isPlotRouteMode && !props.data.isGhost"
      class="absolute inset-0 z-[200] cursor-pointer"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
    />

    <div v-if="isRestricted" class="absolute inset-0 cursor-pointer diamond-shape" :class="[Z_INDEX.RESTRICTED_NODE, { 'bg-transparent': !showDeleteOverlay, 'bg-black/80': showDeleteOverlay }]" @click="showDeleteOverlay = true">
       <div v-if="showDeleteOverlay" class="flex flex-col items-center justify-center h-full rounded-lg" @click.stop>
         <p class="text-white mb-4">Node is expired. Delete it?</p>
         <div class="flex gap-2">
           <button @click.stop="handleDelete" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded">Delete</button>
           <button @click.stop="showDeleteOverlay = false" class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded">Cancel</button>
         </div>
       </div>
    </div>

    <div v-if="isUnexplored && !isRestricted" class="absolute inset-0 pointer-events-none flex items-center justify-center" :class="Z_INDEX.RESTRICTED_NODE">
      <div class="absolute inset-0 bg-gray-900/70 diamond-shape"></div>
      <span class="relative text-[18px] font-semibold tracking-widest border-dashed border uppercase text-white select-none mt-48 bg-gray-700 px-3 py-1 rounded-xl">Unexplored</span>
    </div>
    <TooltipProvider :delay-duration="0">
      <div 
        :key="pingKey"
        class="text-white text-xs text-center min-w-[400px] min-h-[400px] relative transition-all duration-300"
        :class="[
          hasReds ? 'red-glow' : '',
          props.data.highlighted ? 'goto-glow-animation' : '',
          isPinged ? 'ping-animation' : '',
          props.data.isGhost || isRestricted ? 'opacity-50 grayscale' : '',
          isGreyedByChain ? 'opacity-30 grayscale' : '',
          isPlotRouteTarget && store.animationsEnabled ? 'plot-route-hover' : (isPlotRouteTarget ? 'plot-route-hover-static' : ''),
          (isRouteDestination || isSelectingFromZone) && store.animationsEnabled ? 'plot-route-destination' : ((isRouteDestination || isSelectingFromZone) ? 'plot-route-destination-static' : '')
        ]"
        @animationend="(e: AnimationEvent) => { if (e.animationName === 'goto-glow') updateNodeData(props.id, { highlighted: false }); if (e.animationName === 'ping-glow' || e.animationName === 'ping-glow-home') isPinged = false; }"
        @mouseenter="isHovered = true"
        @mouseleave="isHovered = false"
      >
      <!-- Ping Button (top tip) -->
      <div class="absolute left-1/2 -translate-x-1/2 top-9 flex flex-col items-center gap-0.5" :class="Z_INDEX.CONTENT_MID">
        <div class="flex items-center gap-1">
          <PingButton :has-reds="hasReds" @ping="handlePing" />
          <TooltipRoot>
            <TooltipTrigger asChild>
              <button
                :class="['w-9 h-9 flex items-center justify-center zone-button round-button check-button shadow-lg text-lg pointer-events-auto', hasReds ? 'zone-button-reds' : '']"
                @click.stop="handleMarkAsCorrect"
              >✅</button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent class="bg-black text-white text-xs px-2 py-1 rounded shadow-lg z-[10000]">
                Mark as correct
              </TooltipContent>
            </TooltipPortal>
          </TooltipRoot>
        </div>
        <span v-if="props.data.features?.lastUpdatedAt" class="text-[10px] font-semibold pointer-events-none select-none" :class="lastUpdatedColor">
          Updated: {{ lastUpdatedText }}
        </span>
      </div>

      <!-- Diamond Shape Background -->
      <div 
        class="absolute inset-0 diamond-shape transition-colors duration-300 pointer-events-none"
        :class="diamondOuterClass"
      ></div>
      <div 
        class="absolute inset-[4px] diamond-shape transition-colors duration-300 pointer-events-none"
        :class="diamondInnerClass"
      ></div>

      <!-- Shape Image Overlay -->
      <img
        v-if="props.data.mapShape && props.data.mapShape !== 'rest'"
        :src="`/images/shapes/${props.data.mapShape}.png`"
        class="absolute w-full h-full p-1.5 object-contain pointer-events-none"
        :class="Z_INDEX.CONTENT_LOW"
        :style="{
          opacity: isHandleEditorOpen ? 1 : (store.shapeBackgroundOpacity / 100),
          ...(props.data.rotation ? { transform: `rotate(${rotationStepsToDegrees(props.data.rotation)}deg)` } : {})
        }"
        alt=""
      />

      <div 
        v-if="showFeatures"
        class="absolute top-0 left-0 w-full h-full pointer-events-none" :class="Z_INDEX.CONTENT_MID"
      >
        <div class="cores-nw-container pointer-events-auto" ref="timerContainerRefNW">
          <ZoneCoresAndReds 
            ref="timerComponentRefNW"
            :features="props.data.features"
            :active-editing-core="activeEditingCore"
            :now="now"
            :has-reds="hasReds"
            v-model:timer-value="timerValue"
            :is-timer-too-long="isTimerTooLong"
            :is-timer-valid="isTimerValid"
            :cores="['powercoreGreen', 'powercoreBlue']"
            side="left"
            @toggle="toggleFeature"
            @save="saveTimer"
            @clear="clearTimer"
            @focus="onTimerFocus"
            @blur="onTimerBlur"
            @unlock="unlockCore"
            @lock="lockCore"
          />
        </div>

        <div class="cores-ne-container pointer-events-auto" ref="timerContainerRefNE">
          <ZoneCoresAndReds 
            ref="timerComponentRefNE"
            :features="props.data.features"
            :active-editing-core="activeEditingCore"
            :now="now"
            :has-reds="hasReds"
            v-model:timer-value="timerValue"
            :is-timer-too-long="isTimerTooLong"
            :is-timer-valid="isTimerValid"
            :cores="['powercorePurple', 'powercoreYellow']"
            side="right"
            @toggle="toggleFeature"
            @save="saveTimer"
            @clear="clearTimer"
            @focus="onTimerFocus"
            @blur="onTimerBlur"
            @unlock="unlockCore"
            @lock="lockCore"
          />
        </div>

        <!-- Reds on North-East Edge -->
        <div class="reds-ne-container pointer-events-auto">
          <ZoneReds 
            :reds="props.data.features?.reds"
            :reds-timer="props.data.features?.redsTimer"
            :now="now"
            v-model:is-open="isRedsOpen"
            @update:reds="updateReds"
          />
        </div>

        <!-- Chest on South-West Edge (opposite of Reds) -->
        <div class="chest-sw-container pointer-events-auto">
          <ZoneChestButton
            :timed-chest="props.data.features?.timedChest"
            :now="now"
            :has-reds="hasReds"
            @click="isChestModalOpen = !isChestModalOpen"
          />
        </div>
      </div>

      <!-- Handle Editor Button -->
      <div v-if="!isHandleEditorOpen && !isMapFeaturesModalOpen && !isChestModalOpen" class="handle-editor-container pointer-events-auto" :class="Z_INDEX.TOAST">
        <ZoneHandleEditorButton
          ref="handleEditorButtonRef"
          :map-shape="props.data.mapShape"
          :type="props.data.type"
          :has-reds="hasReds"
          :needs-custom-handles="needsCustomHandles"
          :is-unexplored="isUnexplored && featuresRequireUpdate"
          @click="openHandleEditor"
        />
      </div>

      <!-- Central Content Block -->
      <div class="absolute inset-x-0 top-[42%] pointer-events-none flex flex-col items-center" :class="Z_INDEX.CONTENT_LOW">
        <div class="w-full flex flex-col items-center pointer-events-none">
          <!-- Zone Header -->
            <ZoneHeader
              :id="props.id" 
              :zone-name="props.data.zoneName" 
              :is-chain-source="props.data.isChainSource" 
              :type="props.data.type as ZoneType" 
              :category="props.data.category"
              :map-shape="props.data.mapShape"
              :tier="props.data.tier"
              :proximity-to="props.data.proximityTo"
            />

          <!-- Map Features -->
          <div class="flex flex-col items-center pointer-events-auto mt-2" ref="featuresContainerRef">
            <div class="flex items-center justify-center gap-1 mb-1 relative">
              <span class="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Map Features</span>
              <button 
                ref="mapFeaturesButtonRef"
                @click.stop="isMapFeaturesModalOpen = !isMapFeaturesModalOpen"
                @mousedown.stop
                :class="['zone-button p-1 pointer-events-auto relative', hasReds ? 'zone-button-reds' : '', (featuresRequireUpdate && store.bluePromptsEnabled) ? 'pulse-prompt-button' : '', Z_INDEX.CONTENT_HIGH]"
                title="Edit Map Features"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <BluePrompt
                v-if="promptsReady && !isMapFeaturesModalOpen && !isHandleEditorOpen && !isChestModalOpen && showFeatures && activeFeatures.length === 0 && mapFeaturesButtonRef"
                pointing="up"
                :offset-y="4"
                :target="mapFeaturesButtonRef">
                  Add Map Features</BluePrompt>
              <BluePrompt
                v-if="promptsReady && !isMapFeaturesModalOpen && !isHandleEditorOpen && !isChestModalOpen && showFeatures && hasUnknownResources && mapFeaturesButtonRef"
                pointing="left"
                :offset-x="4"
                :target="mapFeaturesButtonRef">
                  Review "?" resources</BluePrompt>
            </div>
            <ZoneFeatures 
              :active-features="activeFeatures"
              :has-reds="hasReds"
              @edit="isMapFeaturesModalOpen = true"
            />
          </div>
        </div>
      </div>

      <div ref="mapFeaturesModalContainerRef">
        <ZoneMapFeaturesModal 
          :is-open="isMapFeaturesModalOpen"
          :has-reds="hasReds"
          :features="props.data.features"
          :upstream-features="props.data.features?.upstreamFeatures ?? []"
          @toggle="toggleFeature"
          @size="setFeatureSize"
          @feature-count="setFeatureCount"
          @resource-count="setResourceCount"
          @clear-resource="clearResource"
          @close="handleCloseTray"
        />
      </div>

      <div ref="chestModalContainerRef">
        <ZoneChestModal
          :is-open="isChestModalOpen"
          :has-reds="hasReds"
          :chest-size="props.data.features?.timedChest?.size"
          :chest-timer="props.data.features?.timedChest?.timer"
          :now="now"
          @save="saveChest"
          @clear="clearChest"
          @close="isChestModalOpen = false"
        />
      </div>


      <ZoneHandleEditor
        v-if="isHandleEditorOpen"
        :zone-name="props.data.zoneName || props.id"
        :initial-handles="getInitialHandles()"
        :is-toggle-mode="props.data.mapShape !== 'rest' && props.data.type !== 'roadsHideout'"
        :is-hideout="props.data.type === 'roadsHideout'"
        :map-shape="props.data.mapShape"
        :initial-rotation="props.data.rotation ?? 0"
        @save="saveCustomHandles"
        @close="isHandleEditorOpen = false"
      />

      <BluePrompt
        v-if="promptsReady && showFreshRoomHint && nHandleScreenPos"
        pointing="down"
        bounce
        :offset-x="5"
        :offset-y="-60"
        :screen-pos="nHandleScreenPos"
        :class="[Z_INDEX.HANDLE_OVERLAY]"
      >Pull on this handle to add a zone</BluePrompt>

      <!-- Room Memory Button (bottom tip) -->
      <div class="absolute left-1/2 -translate-x-1/2 bottom-5 flex items-center justify-center" :class="Z_INDEX.CONTENT_LOW" v-if="!props.data.isChainSource">
        <RoomMemoryButton :entry="memoryEntry ?? null" :zone-name="props.data.zoneName || props.id" :zone-id="props.id" />
      </div>
      
    </div>
    </TooltipProvider>
  </div>
</template>

<style scoped>
@import './nodes.css';

.cores-nw-container {
  position: absolute;
  top: 90px;
  left: 82px;
}

.cores-ne-container {
  position: absolute;
  top: 90px;
  right: 82px;
}

.reds-ne-container {
  position: absolute;
  top: 200px;
  right: 4px;
}

.chest-sw-container {
  position: absolute;
  top: 200px;
  left: 4px;
}

.handle-editor-container {
  position: absolute;
  top: 165px;
  left: 50px;
}

/*noinspection ALL*/
.plot-route-hover {
  animation: plot-route-hover-pulse 1.5s ease-in-out infinite;
}

/*noinspection ALL*/
.plot-route-hover-static {
  filter: drop-shadow(0 0 18px #60a5fa) drop-shadow(0 0 6px #93c5fd);
}

@keyframes plot-route-hover-pulse {
  0%, 100% { filter: drop-shadow(0 0 18px #60a5fa) drop-shadow(0 0 6px #93c5fd); }
  50% { filter: drop-shadow(0 0 6px #1d4ed8) drop-shadow(0 0 2px #3b82f6); }
}

/*noinspection ALL*/
.plot-route-destination {
  animation: plot-route-destination-pulse 5s ease-in-out infinite;
}

/*noinspection ALL*/
.plot-route-destination-static {
  filter: drop-shadow(0 0 20px #1d4ed8) drop-shadow(0 0 8px #1e40af);
}

@keyframes plot-route-destination-pulse {
  0%, 100% { filter: drop-shadow(0 0 20px #1d4ed8) drop-shadow(0 0 8px #1e40af); }
  50% { filter: drop-shadow(0 0 8px #1e3a8a) drop-shadow(0 0 2px #1d4ed8); }
}

</style>
