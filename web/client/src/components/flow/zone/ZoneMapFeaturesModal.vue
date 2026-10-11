<script setup lang="ts">
import { NodeFeatures } from 'shared';
import { Z_INDEX } from '@/constants/Layers';
import { ref, watch } from 'vue';

const props = defineProps<{
  isOpen: boolean;
  hasReds: boolean;
  features?: NodeFeatures;
  upstreamFeatures?: string[];
}>();

const emit = defineEmits<{
  (e: 'toggle', feature: any): void;
  (e: 'size', type: any, size: 'S' | 'L'): void;
  (e: 'resourceCount', type: string, size: 'small' | 'large', count: number): void;
  (e: 'featureCount', type: string, count: number): void;
  (e: 'clearResource', type: string): void;
  (e: 'close'): void;
}>();

const RESOURCES = [
  { type: 'fibre',   title: 'Fibre',   icon: '/images/resource-fibre.png' },
  { type: 'leather', title: 'Leather', icon: '/images/resource-leather.png' },
  { type: 'ore',     title: 'Ore',     icon: '/images/resource-ore.png' },
  { type: 'stone',   title: 'Stone',   icon: '/images/resource-stone.png' },
  { type: 'wood',    title: 'Wood',    icon: '/images/resource-wood.png' },
];

const TREASURES = [
  { type: 'treasuresGreen',  title: 'Green',  icon: '/images/treasures-green.png' },
  { type: 'treasuresBlue',   title: 'Blue',   icon: '/images/treasures-blue.png' },
  { type: 'treasuresYellow', title: 'Yellow', icon: '/images/treasures-yellow.png' },
];

const DUNGEONS = [
  { type: 'dungeonStatic', title: 'Static', icon: '/images/dungeon-static.png' },
  { type: 'dungeonGroup',  title: 'Group',  icon: '/images/dungeon-group.png' },
];

// Boolean toggles — no count, and never written to room memory (transient state)
const TOGGLES = [
  { type: 'crystalCreaturePresent', title: 'Crystal Creature', icon: '/images/crystal.png' },
  { type: 'brecilienPortalPresent', title: 'Brecilien Portal', icon: '/images/brecilien-portal.png' },
] as const;

// --- Draft input state ---
// Tracks which inputs are currently focused so prop changes don't overwrite them
const focusedInputs = ref<Set<string>>(new Set());

type DraftKey = string; // e.g. "fibre-small", "fibre-large", "treasuresGreenCount"
const drafts = ref<Record<DraftKey, string>>({});

function draftKey(type: string, size?: 'small' | 'large'): DraftKey {
  return size ? `${type}-${size}` : `${type}Count`;
}

function getCount(type: string, size: 'small' | 'large'): number {
  const entry = props.features?.resources?.find(r => r.type === type);
  return entry?.[size] ?? 0;
}

function getFeatureCount(type: string): number {
  const countKey = `${type}Count` as keyof NodeFeatures;
  return (props.features?.[countKey] as number | undefined) ?? 0;
}

function getDraftValue(type: string, size?: 'small' | 'large'): string {
  const key = draftKey(type, size);
  if (focusedInputs.value.has(key)) {
    return drafts.value[key] ?? String(size ? getCount(type, size) : getFeatureCount(type));
  }
  return String(size ? getCount(type, size) : getFeatureCount(type));
}

function onFocus(type: string, size?: 'small' | 'large') {
  const key = draftKey(type, size);
  drafts.value[key] = String(size ? getCount(type, size) : getFeatureCount(type));
  focusedInputs.value.add(key);
}

function onInput(value: string, type: string, size?: 'small' | 'large') {
  const key = draftKey(type, size);
  drafts.value[key] = value;
}

function commitResource(type: string, size: 'small' | 'large') {
  const key = draftKey(type, size);
  const raw = drafts.value[key] ?? '';
  const count = Math.max(0, parseInt(raw) || 0);
  focusedInputs.value.delete(key);
  emit('resourceCount', type, size, count);
}

function commitFeature(type: string) {
  const key = draftKey(type);
  const raw = drafts.value[key] ?? '';
  const count = Math.max(0, parseInt(raw) || 0);
  focusedInputs.value.delete(key);
  emit('featureCount', type, count);
}

function onResourceKeydown(e: KeyboardEvent, type: string, size: 'small' | 'large') {
  if (e.key === 'Enter') {
    (e.target as HTMLInputElement).blur();
  }
}

function onFeatureKeydown(e: KeyboardEvent, type: string) {
  if (e.key === 'Enter') {
    (e.target as HTMLInputElement).blur();
  }
}

// --- Stepper buttons still work instantly ---
function adjustResource(type: string, size: 'small' | 'large', delta: number) {
  const current = getCount(type, size);
  const next = Math.max(0, current + delta);
  emit('resourceCount', type, size, next);
}

function adjustFeature(type: string, delta: number) {
  const current = getFeatureCount(type);
  const next = Math.max(0, current + delta);
  emit('featureCount', type, next);
}

function isUpstreamResource(type: string): boolean {
  return (props.upstreamFeatures ?? []).includes(type);
}

function isUpstreamFeature(type: string): boolean {
  const countKey = `${type}Count`;
  return (props.upstreamFeatures ?? []).includes(countKey);
}

// When the modal closes, clear all draft/focus state
watch(() => props.isOpen, (open) => {
  if (!open) {
    focusedInputs.value.clear();
    drafts.value = {};
  }
});
</script>

<template>
  <Transition name="tray">
    <div v-if="isOpen" 
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] rounded-xl shadow-2xl backdrop-blur-xl border p-4 text-left space-y-3 transition-all duration-300"
      :class="[
        hasReds ? 'bg-red-950/90 border-red-500/50' : 'bg-gray-900/95 border-gray-700',
        Z_INDEX.MODAL
      ]"
      @mousedown.stop
      @click.stop
    >
      <div class="flex items-center justify-between mb-1">
        <div class="text-[10px] uppercase text-white font-bold tracking-widest">Edit Map Features</div>
        <button
          @click="emit('close')"
          class="zone-button px-2 py-1 flex items-center gap-1.5 transition-colors"
          :class="hasReds ? 'zone-button-reds' : ''"
          title="Close"
        >
          <span class="text-[10px] uppercase text-white font-bold tracking-widest">Close</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <!-- Upstream callout -->
      <div v-if="(upstreamFeatures ?? []).length > 0" class="flex items-start gap-2 rounded-lg border border-yellow-500/60 bg-yellow-500/10 px-3 py-2">
        <span class="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-yellow-400 text-gray-900 text-[9px] font-black flex items-center justify-center leading-none">?</span>
        <span class="text-[10px] text-yellow-300 leading-tight">Please confirm the presence of this map feature. If it does not exist, increment it up by one then down.</span>
      </div>

      <hr class="transition-colors duration-300" :class="hasReds ? 'border-red-500/30' : 'border-gray-700/50'" />

      <!-- Resources -->
      <div>
        <div class="section-label">Resources</div>
        <!-- Table header -->
        <div class="grid grid-cols-[28px_1fr_1fr_28px] gap-x-2 mb-0.5">
          <div></div>
          <div class="col-label">Small</div>
          <div class="col-label">Large</div>
          <div></div>
        </div>
        <!-- Resource rows -->
        <div
          v-for="(r, i) in RESOURCES"
          :key="r.type"
          class="flex flex-col rounded transition-all"
          :class="[
            i < RESOURCES.length - 1 ? (hasReds ? 'border-b border-red-500/20' : 'border-b border-gray-700/50') : '',
            isUpstreamResource(r.type) ? 'animate-pulse bg-gray-700/60' : ''
          ]"
        >
          <div class="grid grid-cols-[28px_1fr_1fr_28px] gap-x-2 items-center py-1 px-1">
            <!-- Icon -->
            <div class="relative w-7 h-7">
              <img :src="r.icon" :alt="r.title" class="w-7 h-7 object-cover p-0.5 rounded" :title="r.title" />
              <span v-if="isUpstreamResource(r.type)" class="absolute -top-1 -right-1 bg-yellow-400 text-gray-900 text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">?</span>
            </div>
            <!-- Small count -->
            <div class="flex items-center justify-center gap-0.5">
              <button
                @click.stop="adjustResource(r.type, 'small', -1)"
                class="count-btn zone-button"
                :class="hasReds ? 'zone-button-reds' : ''"
              >−</button>
              <input
                type="number"
                min="0"
                :value="getDraftValue(r.type, 'small')"
                @focus.stop="onFocus(r.type, 'small')"
                @input.stop="onInput(($event.target as HTMLInputElement).value, r.type, 'small')"
                @blur.stop="commitResource(r.type, 'small')"
                @keydown.stop="onResourceKeydown($event, r.type, 'small')"
                @click.stop
                class="count-input"
              />
              <button
                @click.stop="adjustResource(r.type, 'small', 1)"
                class="count-btn zone-button"
                :class="hasReds ? 'zone-button-reds' : ''"
              >+</button>
            </div>
            <!-- Large count -->
            <div class="flex items-center justify-center gap-0.5">
              <button
                @click.stop="adjustResource(r.type, 'large', -1)"
                class="count-btn zone-button"
                :class="hasReds ? 'zone-button-reds' : ''"
              >−</button>
              <input
                type="number"
                min="0"
                :value="getDraftValue(r.type, 'large')"
                @focus.stop="onFocus(r.type, 'large')"
                @input.stop="onInput(($event.target as HTMLInputElement).value, r.type, 'large')"
                @blur.stop="commitResource(r.type, 'large')"
                @keydown.stop="onResourceKeydown($event, r.type, 'large')"
                @click.stop
                class="count-input"
              />
              <button
                @click.stop="adjustResource(r.type, 'large', 1)"
                class="count-btn zone-button"
                :class="hasReds ? 'zone-button-reds' : ''"
              >+</button>
            </div>
            <!-- Clear button -->
            <div class="flex items-center justify-center">
              <button
                @click.stop="emit('clearResource', r.type)"
                class="count-btn clear-btn disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="getCount(r.type, 'small') === 0 && getCount(r.type, 'large') === 0"
              >×</button>
            </div>
          </div>
        </div>
      </div>

      <hr class="transition-colors duration-300" :class="hasReds ? 'border-red-500/30' : 'border-gray-700/50'" />

      <!-- Map Features (Treasures, Dungeons, Other) -->
      <div>
        <div class="section-label">Map Features</div>
        <div class="flex flex-wrap gap-2 items-center justify-start">
          <!-- Countable features: treasures + dungeons -->
          <div
            v-for="f in [...TREASURES, ...DUNGEONS]"
            :key="f.type"
            class="feature-item flex flex-col items-center gap-1 rounded p-1 transition-all"
            :class="isUpstreamFeature(f.type) ? 'animate-pulse bg-gray-700/60' : ''"
          >
            <div class="relative w-8 h-8">
              <img :src="f.icon" :alt="f.title" class="w-8 h-8 object-cover p-0.5 rounded" :title="f.title" />
              <span v-if="isUpstreamFeature(f.type)" class="absolute -top-1 -right-1 bg-yellow-400 text-gray-900 text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">?</span>
            </div>
            <div class="flex items-center gap-0.5">
              <button
                @click.stop="adjustFeature(f.type, -1)"
                class="count-btn zone-button"
                :class="hasReds ? 'zone-button-reds' : ''"
              >−</button>
              <input
                type="number"
                min="0"
                :value="getDraftValue(f.type)"
                @focus.stop="onFocus(f.type)"
                @input.stop="onInput(($event.target as HTMLInputElement).value, f.type)"
                @blur.stop="commitFeature(f.type)"
                @keydown.stop="onFeatureKeydown($event, f.type)"
                @click.stop
                class="count-input"
              />
              <button
                @click.stop="adjustFeature(f.type, 1)"
                class="count-btn zone-button"
                :class="hasReds ? 'zone-button-reds' : ''"
              >+</button>
            </div>
          </div>
          <!-- Toggle-only features -->
          <div
            v-for="t in TOGGLES"
            :key="t.type"
            class="feature-item flex flex-col items-center gap-1 self-center"
          >
            <button
              @click.stop="emit('toggle', t.type)"
              class="zone-button w-8 h-8 flex items-center justify-center rounded p-0.5"
              :class="[hasReds ? 'zone-button-reds' : '', features?.[t.type] ? 'ring-1 ring-white bg-gray-500' : 'opacity-60']"
              :title="t.title"
            >
              <img :src="t.icon" :alt="t.title" class="w-full h-full object-cover" />
            </button>
            <span class="col-label my-0.5" style="font-size: 8px">{{ t.title }}</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.tray-enter-active,
.tray-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.tray-enter-from,
.tray-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.9);
}

.count-btn {
  @apply w-6 h-6 flex items-center justify-center text-white text-sm leading-none rounded flex-shrink-0;
  transition: background-color 0.1s ease;
}

.clear-btn {
  @apply bg-red-900 border border-red-500 hover:bg-red-600 hover:border-red-400;

  &:disabled {
    @apply bg-gray-600 border-0;
  }
}

.count-btn:active {
  @apply bg-white/30;
}

.count-input {
  @apply w-6 text-center text-xs text-white bg-gray-800 border border-gray-600 rounded h-6;
  appearance: textfield;
}

.count-input::-webkit-outer-spin-button,
.count-input::-webkit-inner-spin-button {
  appearance: none;
}

.feature-item {
  width: 83px;
}

.section-label {
  @apply text-[9px] uppercase text-white font-bold mb-1.5 tracking-wider;
}

.col-label {
  @apply text-[9px] uppercase text-gray-400 font-bold tracking-wider text-center;
}
</style>
