<script setup lang="ts">
import { ref, computed, inject } from 'vue';
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
  TooltipPortal,
} from 'reka-ui';
import { useRoomMemoryStore } from '@/stores/useRoomMemoryStore';
import { useRoomStore } from '@/stores/useRoomStore';
import { API_BASE_URL } from '@/utils/api';
import { ZONE_BY_ID, NodeFeatures } from 'shared';

const dialogOpen = ref(false);
const showToast = inject<(msg: string, type?: 'info' | 'error') => void>('showToast');
const deleteAllConfirmOpen = ref(false);
const roomStore = useRoomStore();
const searchQuery = ref('');
const sortMode = ref<'name' | 'seen' | 'recent'>('name');
const store = useRoomMemoryStore();
const activeZoneIds = computed(() => new Set(roomStore.nodePositions.map(n => n.zoneId)));

const historyEntries = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return Array.from(store.memory.values())
    .filter(entry => {
      if (!query) return true;
      const name = (ZONE_BY_ID.get(entry.zoneId)?.name ?? '').toLowerCase();
      return name.includes(query);
    })
    .sort((a, b) => {
      if (sortMode.value === 'seen') {
        return b.timesAdded.length - a.timesAdded.length;
      }
      if (sortMode.value === 'recent') {
        const lastA = Math.max(...a.timesAdded.map(d => new Date(d).getTime()));
        const lastB = Math.max(...b.timesAdded.map(d => new Date(d).getTime()));
        return lastB - lastA;
      }
      const nameA = (ZONE_BY_ID.get(a.zoneId)?.name ?? '').toLowerCase();
      const nameB = (ZONE_BY_ID.get(b.zoneId)?.name ?? '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
});

const totalZones = computed(() => store.memory.size);

async function deleteZoneFromHistory(zoneId: string) {
  await fetch(`${API_BASE_URL}/api/rooms/${roomStore.roomId}/memory/${encodeURIComponent(zoneId)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${roomStore.token}` },
  });
}

async function deleteAllHistory() {
  await fetch(`${API_BASE_URL}/api/rooms/${roomStore.roomId}/memory`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${roomStore.token}` },
  });
  deleteAllConfirmOpen.value = false;
  dialogOpen.value = false;
  showToast?.('Map History fully deleted.');
}

function formatHistoryTooltip(timesAdded: string[]): string {
  return timesAdded
    .slice()
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    .map(d => formatLastSeen(d))
    .join('\n');
}

function formatLastSeen(isoDate: string): string {
  const d = new Date(isoDate);
  const day = d.getDate();
  const month = d.toLocaleString('en-GB', { month: 'short' });
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}`;
}

function getZoneDisplay(zoneId: string) {
  return ZONE_BY_ID.get(zoneId) || { name: 'Unknown', tier: 0, type: 'other' };
}

function getActiveFeatures(features: NodeFeatures | undefined) {
  if (!features) return [];
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
}
</script>

<template>
  <DialogRoot v-model:open="dialogOpen" @update:open="val => { if (!val) { searchQuery = ''; sortMode = 'name'; } }">
    <button
      class="room-memory-btn"
      @click="dialogOpen = true"
      aria-label="Map History"
    >
      ⏳ <span class="ml-1 font-bold">{{ totalZones }}</span>
    </button>

    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/60 z-[9998]" />
      <DialogContent class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-[9999] p-6 w-[700px] max-w-[95vw] max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <DialogTitle class="text-white font-semibold text-lg">
            Map History ({{ totalZones }})
          </DialogTitle>
          <div class="flex items-center gap-2">
            <button
              @click="deleteAllConfirmOpen = true"
              class="px-2 py-2.5 mr-2 rounded text-xs font-semibold border border-red-700/60 bg-red-900/30 text-red-400 hover:bg-red-800 hover:border-red-600 hover:text-red-300 transition-colors"
            >Delete All</button>
            <DialogClose class="text-gray-400 hover:text-white py-2 px-2 zone-button transition-colors text-xl leading-none cursor-pointer" aria-label="Close">
              ✕ Close
            </DialogClose>
          </div>
        </div>
        <div class="flex justify-center mb-2">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search zones…"
            class="w-full max-w-xs bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-400"
          />
        </div>
        <div class="flex justify-center gap-2 mb-3">
          <button
            @click="sortMode = 'name'"
            :class="[
              'px-3 py-1 rounded text-xs font-semibold border transition-colors',
              sortMode === 'name'
                ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-300'
                : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200'
            ]"
          >Name A–Z</button>
          <button
            @click="sortMode = 'seen'"
            :class="[
              'px-3 py-1 rounded text-xs font-semibold border transition-colors',
              sortMode === 'seen'
                ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-300'
                : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200'
            ]"
          >Times Seen ↓</button>
          <button
            @click="sortMode = 'recent'"
            :class="[
              'px-3 py-1 rounded text-xs font-semibold border transition-colors',
              sortMode === 'recent'
                ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-300'
                : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200'
            ]"
          >Most Recent ↓</button>
        </div>
        
        <ul class="flex-1 overflow-y-auto space-y-1">
          <li
            v-for="entry in historyEntries"
            :key="entry.zoneId"
            class="bg-gray-800/50 rounded flex items-center gap-2 px-2 py-1 border border-gray-700 relative group"
          >
            <span class="text-gray-400 font-mono text-xs shrink-0">{{ entry.timesAdded.length }}x</span>
            <div class="flex items-center w-28">
              <TooltipProvider :delay-duration="0">
                <TooltipRoot>
                  <TooltipTrigger as-child>
                    <span
                      v-if="activeZoneIds.has(entry.zoneId)"
                      class="font-mono text-xs w-full text-center bg-indigo-600/30 border border-indigo-500/60 hover:bg-indigo-500/40 hover:border-indigo-400/60 transition-colors text-purple-200 rounded px-1.5 py-0.5 cursor-default"
                    >On the map</span>
                    <span
                      v-else
                      class="text-gray-400 font-mono w-full text-center text-xs bg-gray-700/60 border border-gray-600 hover:bg-gray-600/60 hover:border-gray-400 transition-colors rounded px-1.5 py-0.5 cursor-default"
                    >{{ formatLastSeen([...entry.timesAdded].sort().at(-1) ?? entry.lastUpdated) }}</span>
                  </TooltipTrigger>
                  <TooltipPortal>
                    <TooltipContent class="bg-black text-white text-xs px-2 py-1 rounded shadow-lg z-[10002] whitespace-pre-line">
                      {{ formatHistoryTooltip(entry.timesAdded) }}
                    </TooltipContent>
                  </TooltipPortal>
                </TooltipRoot>
              </TooltipProvider>
            </div>

            <span class="font-bold text-white px-1.5 py-0.5 rounded bg-gray-700 text-xs shrink-0">
              T{{ getZoneDisplay(entry.zoneId).tier }}
            </span>
            <span class="flex-1 text-gray-200 text-sm truncate">{{ getZoneDisplay(entry.zoneId).name }}</span>
            <!-- Feature icons inline -->
            <div class="flex items-center gap-0.5 shrink-0 flex-wrap justify-end">
              <template v-for="feature in getActiveFeatures(entry.features)" :key="feature.type">
                <div
                  class="rounded flex items-stretch overflow-hidden bg-gray-700"
                  :title="feature.upstream ? feature.title + ' (upstream suggestion)' : feature.title"
                >
                  <img :src="feature.icon" class="w-8 h-8 object-cover p-0.5" :alt="feature.title" />
                  <template v-if="feature.isResource && ((feature.smallCount ?? 0) > 0 || (feature.largeCount ?? 0) > 0)">
                    <div v-if="(feature.smallCount ?? 0) > 0" class="flex flex-col items-center justify-center px-0.5 bg-gray-500/60">
                      <span class="text-[11px] font-bold text-white leading-none">{{ feature.smallCount }}</span>
                      <span class="text-[9px] font-bold text-white/70 leading-none">S</span>
                    </div>
                    <div v-if="(feature.largeCount ?? 0) > 0" class="flex flex-col items-center justify-center px-0.5 bg-gray-500/60">
                      <span class="text-[11px] font-bold text-white leading-none">{{ feature.largeCount }}</span>
                      <span class="text-[9px] font-bold text-white/70 leading-none">L</span>
                    </div>
                  </template>
                  <template v-else-if="feature.isResource">
                    <div class="flex items-center justify-center px-1 bg-gray-500/60">
                      <span class="text-[11px] font-bold text-white/50">?</span>
                    </div>
                  </template>
                  <template v-else-if="!feature.isResource && (feature.count || feature.upstream)">
                    <div class="flex items-center justify-center px-1 bg-gray-500/60">
                      <span v-if="feature.upstream && !feature.count" class="text-[11px] font-bold text-white/50">?</span>
                      <span v-else class="text-[11px] font-bold text-white">{{ feature.count }}</span>
                    </div>
                  </template>
                </div>
              </template>
              <!-- Missing resources indicator at end -->
              <span
                v-if="getActiveFeatures(entry.features).length > 0 && !getActiveFeatures(entry.features).some(f => f.isResource)"
                class="text-[14px] font-bold text-gray-500 border border-dashed border-gray-600 rounded px-1 py-0.5 ml-1 leading-none"
                title="Missing resource data"
              >? Resources</span>
              <span
                v-if="getActiveFeatures(entry.features).length > 0 && !getActiveFeatures(entry.features).some(f => !f.isResource)"
                class="text-[14px] font-bold text-gray-500 border border-dashed border-gray-600 rounded px-1 py-0.5 ml-1 leading-none"
                title="Missing feature data"
              >? Features</span>
            </div>
            <!-- Delete button -->
            <button
              @click.stop="deleteZoneFromHistory(entry.zoneId)"
              class="delete-zone-btn"
              title="Remove from history"
              aria-label="Delete zone from history"
            >✕</button>
          </li>
        </ul>
        
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <!-- Delete All Confirmation Dialog -->
  <DialogRoot v-model:open="deleteAllConfirmOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/70 z-[10000]" />
      <DialogContent class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-[10001] p-6 w-[440px] max-w-[90vw] flex flex-col gap-4">
        <DialogTitle class="text-white font-bold text-lg">Are you sure?</DialogTitle>
        <p class="text-gray-300 text-sm leading-relaxed">
          Deleting the room's map history has no benefits unless there are data issues or you've been advised to do so by the developer. It is recommended to search and delete problematic zones first before wiping it.</p>
        <p class="text-gray-300 text-sm leading-relaxed">
          Zones that are currently on the map will NOT be re-inserted into the memory.
          </p>
        <p class="text-white text-sm leading-relaxed font-bold">
          Are you really sure you want to do this?
        </p>
        <div class="flex justify-end gap-3 mt-2">
          <button
            @click="deleteAllConfirmOpen = false"
            class="px-4 py-2 rounded font-semibold text-sm bg-indigo-700 hover:bg-blue-600 text-white transition-colors"
          >No</button>
          <button
            @click="deleteAllHistory"
            class="px-4 py-2 rounded font-semibold text-sm bg-red-700 hover:bg-red-600 text-white transition-colors"
          >Yes</button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.room-memory-btn {
  @apply px-3;
  min-width: 5rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(30, 30, 40, 0.85);
  border: 1px solid rgba(200, 180, 80, 0.5);
  cursor: pointer;
  color: white;
  transition: background 0.15s, border-color 0.15s;
}
.room-memory-btn:hover {
  background: rgba(60, 55, 20, 0.95);
  border-color: rgba(255, 220, 80, 0.8);
}

.delete-zone-btn {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 36px;
  background: rgba(180, 30, 30, 0.85);
  border: none;
  border-left: 1px solid rgba(220, 60, 60, 0.4);
  border-radius: 0 6px 6px 0;
  color: white;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease-in;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.group:hover .delete-zone-btn {
  opacity: 1;
}
</style>
