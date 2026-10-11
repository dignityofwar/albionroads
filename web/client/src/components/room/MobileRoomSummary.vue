<script setup lang="ts">
import { ref } from 'vue';
import MapHistoryButton from '../flow/zone/MapHistoryButton.vue';
import ChainIdPill from '../common/ChainIdPill.vue';
import { Z_INDEX } from '@/constants/Layers';

type ResourceZone = { zoneId: string; zoneName: string; tier: number; small?: number; large?: number };
type CoreZone     = { zoneId: string; zoneName: string; coreType: 'green' | 'blue' | 'purple' | 'yellow' };
type CrystalZone  = { zoneId: string; zoneName: string };
type PortalZone   = { zoneId: string; zoneName: string };
type DungeonZone  = { zoneId: string; zoneName: string; type: 'static' | 'group'; count?: number };
type ChestZone    = { zoneId: string; zoneName: string; type: 'green' | 'blue' | 'yellow' | 'chest'; count?: number };

const props = defineProps<{
  show: boolean;
  activeResources: {
    fibre:   ResourceZone[];
    leather: ResourceZone[];
    ore:     ResourceZone[];
    stone:   ResourceZone[];
    wood:    ResourceZone[];
  };
  activeCores:     CoreZone[];
  activeCrystals:  CrystalZone[];
  activePortals:   PortalZone[];
  activeDungeons:  DungeonZone[];
  activeChests:    ChestZone[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'navigate', zoneId: string): void;
}>();

const mobileActiveResourceTab = ref<'fibre' | 'leather' | 'ore' | 'stone' | 'wood' | null>(null);
const mobileActiveFeatureTab  = ref<'cores' | 'crystals' | 'portals' | 'dungeons' | 'chests' | null>(null);

function toggleMobileResourceTab(tab: 'fibre' | 'leather' | 'ore' | 'stone' | 'wood') {
  mobileActiveResourceTab.value = mobileActiveResourceTab.value === tab ? null : tab;
}
function toggleMobileFeatureTab(tab: 'cores' | 'crystals' | 'portals' | 'dungeons' | 'chests') {
  mobileActiveFeatureTab.value = mobileActiveFeatureTab.value === tab ? null : tab;
}

function navigateTo(zoneId: string) {
  emit('navigate', zoneId);
  emit('close');
}
</script>

<template>
  <Transition name="overlay">
  <div
    v-if="show"
    class="mobile-summary-overlay fixed inset-0 flex items-center justify-center p-4 bg-black/60"
    :class="Z_INDEX.MOBILE_SUMMARY"
    @click.self="emit('close')"
  >
    <div class="modal-panel bg-gray-900 border border-gray-700 rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div
        class="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-900 rounded-t-xl sticky top-0"
        :class="Z_INDEX.CONTENT_LOW"
      >
        <div class="flex items-center gap-3">
          <h2 class="text-base font-bold uppercase text-gray-400">Room Summary</h2>
          <MapHistoryButton />
        </div>
        <button class="text-gray-400 hover:text-white text-xl leading-none" @click="emit('close')">&times;</button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        <!-- Resources section -->
        <div class="frosted-background border border-gray-700/50 rounded-xl p-2 shadow-2xl">
          <p class="text-xs uppercase text-gray-500 font-bold mb-2 px-1">Resources</p>
          <div class="flex flex-row gap-2 justify-around">
            <button
              v-for="tab in ([
                { type: 'fibre'   as const, label: 'Cotton',  icon: '/images/resource-fibre.png'   },
                { type: 'leather' as const, label: 'Leather', icon: '/images/resource-leather.png' },
                { type: 'ore'     as const, label: 'Ore',     icon: '/images/resource-ore.png'     },
                { type: 'stone'   as const, label: 'Stone',   icon: '/images/resource-stone.png'   },
                { type: 'wood'    as const, label: 'Wood',    icon: '/images/resource-wood.png'    },
              ])"
              :key="tab.type"
              :disabled="activeResources[tab.type].length === 0"
              :class="[
                'flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                mobileActiveResourceTab === tab.type
                  ? 'bg-indigo-600/20 border-indigo-500/50'
                  : 'bg-gray-700/50 border-gray-600'
              ]"
              :title="tab.label"
              @click="toggleMobileResourceTab(tab.type)"
            >
              <img :src="tab.icon" class="w-6 h-6 object-contain" :alt="tab.label" />
              <span class="text-sm font-bold text-gray-300">{{ activeResources[tab.type].length }}</span>
            </button>
          </div>
          <!-- Zone list for selected resource -->
          <Transition name="fade">
            <div v-if="mobileActiveResourceTab !== null && activeResources[mobileActiveResourceTab].length > 0" class="mt-2 flex flex-col gap-1">
              <button
                v-for="zone in activeResources[mobileActiveResourceTab!]"
                :key="zone.zoneId"
                @click="navigateTo(zone.zoneId)"
                class="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-white bg-gray-800/50 hover:bg-gray-700/50 transition-colors text-left rounded border border-gray-700"
              >
                <span class="truncate flex-1 font-medium">{{ zone.zoneName }}</span>
                <ChainIdPill :zone-id="zone.zoneId" small />
                <span class="shrink-0 flex gap-1">
                  <span v-if="zone.small" class="text-xs font-bold text-gray-300 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 leading-none">{{ zone.small }}S</span>
                  <span v-if="zone.large" class="text-xs font-bold text-gray-300 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 leading-none">{{ zone.large }}L</span>
                  <span v-if="!zone.small && !zone.large" class="text-xs font-bold text-gray-300 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 leading-none">?</span>
                </span>
              </button>
            </div>
          </Transition>
        </div>

        <!-- Features section (cores + crystals/portals/dungeons/chests) -->
        <div class="frosted-background border border-gray-700/50 rounded-xl p-2 shadow-2xl">
          <p class="text-xs uppercase text-gray-500 font-bold mb-2 px-1">Features</p>

          <!-- All 5 feature buttons in one row -->
          <div class="features-btn-row flex flex-row gap-2 mb-2">
            <!-- Cores button -->
            <button
              :disabled="activeCores.length === 0"
              :class="[
                'cores-btn flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                mobileActiveFeatureTab === 'cores'
                  ? 'bg-indigo-600/20 border-indigo-500/50'
                  : 'bg-gray-700/50 border-gray-600'
              ]"
              title="Cores"
              @click="toggleMobileFeatureTab('cores')"
            >
              <img src="/images/core-green.png" class="w-6 h-6 object-contain" alt="Core" />
              <span class="text-sm font-bold text-gray-200">{{ activeCores.length }}</span>
              <span class="cores-breakdown ml-1 text-sm font-bold">
                <span class="text-green-500">{{ activeCores.filter(c => c.coreType === 'green').length }}</span><span class="text-gray-500">-</span><span class="text-blue-500">{{ activeCores.filter(c => c.coreType === 'blue').length }}</span><span class="text-gray-500">-</span><span class="text-purple-500">{{ activeCores.filter(c => c.coreType === 'purple').length }}</span><span class="text-gray-500">-</span><span class="text-yellow-500">{{ activeCores.filter(c => c.coreType === 'yellow').length }}</span>
              </span>
            </button>
            <!-- Crystals button -->
            <button
              :disabled="activeCrystals.length === 0"
              :class="[
                'flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                mobileActiveFeatureTab === 'crystals'
                  ? 'bg-indigo-600/20 border-indigo-500/50'
                  : 'bg-gray-700/50 border-gray-600'
              ]"
              title="Crystals"
              @click="toggleMobileFeatureTab('crystals')"
            >
              <img src="/images/crystal.png" class="w-6 h-6 object-contain" alt="Crystal" />
              <span class="text-sm font-bold text-gray-300">{{ activeCrystals.length }}</span>
            </button>
            <!-- Brecilien portals button -->
            <button
              :disabled="activePortals.length === 0"
              :class="[
                'flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                mobileActiveFeatureTab === 'portals'
                  ? 'bg-indigo-600/20 border-indigo-500/50'
                  : 'bg-gray-700/50 border-gray-600'
              ]"
              title="Brecilien Portals"
              @click="toggleMobileFeatureTab('portals')"
            >
              <img src="/images/brecilien-portal.png" class="w-6 h-6 object-contain" alt="Brecilien Portal" />
              <span class="text-sm font-bold text-gray-300">{{ activePortals.length }}</span>
            </button>
            <!-- Dungeons button -->
            <button
              :disabled="activeDungeons.length === 0"
              :class="[
                'flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                mobileActiveFeatureTab === 'dungeons'
                  ? 'bg-indigo-600/20 border-indigo-500/50'
                  : 'bg-gray-700/50 border-gray-600'
              ]"
              title="Dungeons"
              @click="toggleMobileFeatureTab('dungeons')"
            >
              <img src="/images/dungeon-group.png" class="w-6 h-6 object-contain" alt="Dungeon" />
              <span class="text-sm font-bold text-gray-300">{{ activeDungeons.length }}</span>
            </button>
            <!-- Chests button -->
            <button
              :disabled="activeChests.length === 0"
              :class="[
                'flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                mobileActiveFeatureTab === 'chests'
                  ? 'bg-indigo-600/20 border-indigo-500/50'
                  : 'bg-gray-700/50 border-gray-600'
              ]"
              title="Chests"
              @click="toggleMobileFeatureTab('chests')"
            >
              <img src="/images/treasures-green.png" class="w-6 h-6 object-contain" alt="Chest" />
              <span class="text-sm font-bold text-gray-300">{{ activeChests.length }}</span>
            </button>
          </div>

          <!-- Core zone list -->
          <Transition name="fade">
            <div v-if="mobileActiveFeatureTab === 'cores' && activeCores.length > 0" class="mt-2 mb-2 flex flex-col gap-1">
              <button
                v-for="core in activeCores"
                :key="`${core.zoneId}-${core.coreType}`"
                @click="navigateTo(core.zoneId)"
                :class="[
                  'w-full flex items-center gap-2 px-2.5 py-2 text-sm text-white transition-colors text-left rounded border',
                  core.coreType === 'green'  ? 'border-green-500 bg-gray-800/50 hover:bg-gray-700/50' :
                  core.coreType === 'blue'   ? 'border-blue-500 bg-gray-800/50 hover:bg-gray-700/50' :
                  core.coreType === 'purple' ? 'border-purple-500 bg-gray-800/50 hover:bg-gray-700/50' :
                                               'border-yellow-500 bg-gray-800/50 hover:bg-gray-700/50'
                ]"
              >
                <img :src="`/images/core-${core.coreType}.png`" class="w-5 h-5 object-contain" :alt="core.coreType" />
                <span class="truncate flex-1 font-medium">{{ core.zoneName }}</span>
                <ChainIdPill :zone-id="core.zoneId" small />
              </button>
            </div>
          </Transition>

          <!-- Zone list for crystals/portals/dungeons/chests -->
          <Transition name="fade">
            <div v-if="mobileActiveFeatureTab === 'crystals' && activeCrystals.length > 0" class="mt-2 flex flex-col gap-1">
              <button
                v-for="item in activeCrystals"
                :key="item.zoneId"
                @click="navigateTo(item.zoneId)"
                class="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-white bg-gray-800/50 hover:bg-gray-700/50 transition-colors text-left rounded border border-gray-700"
              >
                <img src="/images/crystal.png" class="w-5 h-5 object-contain" alt="Crystal" />
                <span class="truncate flex-1 font-medium">{{ item.zoneName }}</span>
                <ChainIdPill :zone-id="item.zoneId" small />
              </button>
            </div>
            <div v-else-if="mobileActiveFeatureTab === 'portals' && activePortals.length > 0" class="mt-2 flex flex-col gap-1">
              <button
                v-for="item in activePortals"
                :key="item.zoneId"
                @click="navigateTo(item.zoneId)"
                class="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-white bg-gray-800/50 hover:bg-gray-700/50 transition-colors text-left rounded border border-gray-700"
              >
                <img src="/images/brecilien-portal.png" class="w-5 h-5 object-contain" alt="Brecilien Portal" />
                <span class="truncate flex-1 font-medium">{{ item.zoneName }}</span>
                <ChainIdPill :zone-id="item.zoneId" small />
              </button>
            </div>
            <div v-else-if="mobileActiveFeatureTab === 'dungeons' && activeDungeons.length > 0" class="mt-2 flex flex-col gap-1">
              <button
                v-for="item in activeDungeons"
                :key="item.zoneId"
                @click="navigateTo(item.zoneId)"
                class="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-white bg-gray-800/50 hover:bg-gray-700/50 transition-colors text-left rounded border border-gray-700"
              >
                <img :src="item.type === 'static' ? '/images/dungeon-static.png' : '/images/dungeon-group.png'" class="w-5 h-5 object-contain" alt="Dungeon" />
                <span class="truncate flex-1 font-medium">{{ item.zoneName }}</span>
                <ChainIdPill :zone-id="item.zoneId" small />
                <span v-if="item.count" class="shrink-0 text-xs font-bold text-gray-300 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 leading-none">{{ item.count }}</span>
              </button>
            </div>
            <div v-else-if="mobileActiveFeatureTab === 'chests' && activeChests.length > 0" class="mt-2 flex flex-col gap-1">
              <button
                v-for="item in activeChests"
                :key="item.zoneId"
                @click="navigateTo(item.zoneId)"
                class="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-white bg-gray-800/50 hover:bg-gray-700/50 transition-colors text-left rounded border border-gray-700"
              >
                <img :src="item.type === 'blue' ? '/images/treasures-blue.png' : item.type === 'yellow' ? '/images/treasures-yellow.png' : item.type === 'chest' ? '/images/chest.png' : '/images/treasures-green.png'" class="w-5 h-5 object-contain" alt="Chest" />
                <span class="truncate flex-1 font-medium">{{ item.zoneName }}</span>
                <ChainIdPill :zone-id="item.zoneId" small />
                <span v-if="item.count" class="shrink-0 text-xs font-bold text-gray-300 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 leading-none">{{ item.count }}</span>
              </button>
            </div>
          </Transition>
        </div>

      </div>
    </div>
  </div>
  </Transition>
</template>

<style scoped>
/* Hide on tall desktop (trays are visible there) */
@media (min-width: 768px) and (min-height: 501px) {
  .mobile-summary-overlay {
    display: none !important;
  }
}

/* Below 600px: cores button goes full-width above the other 4 */
@media (max-width: 599px) {
  .features-btn-row {
    flex-wrap: wrap;
  }
  .cores-btn {
    flex: 1 1 100%;
  }
}

/* Overlay fade in/out */
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

/* Modal panel slide+fade */
.overlay-enter-active .modal-panel,
.overlay-leave-active .modal-panel {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.overlay-enter-from .modal-panel,
.overlay-leave-to .modal-panel {
  opacity: 0;
  transform: translateY(12px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
