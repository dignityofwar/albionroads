<script setup lang="ts">
import RoomMapFeaturesToolbar from '../flow/zone/RoomMapFeaturesToolbar.vue';
import { Z_INDEX } from '@/constants/Layers';

defineProps<{
  cores: any[];
  crystals: any[];
  portals: any[];
  dungeons: any[];
  chests: any[];
}>();

const emit = defineEmits<{
  (e: 'select', nodeId: string): void;
}>();
</script>

<template>
  <!-- Map Features Summary Toolbar (Desktop only) -->
  <div class="toolbar-wrap absolute top-16 right-4 pointer-events-none" :class="Z_INDEX.TRAY">
    <RoomMapFeaturesToolbar
      :cores="cores"
      :crystals="crystals"
      :portals="portals"
      :dungeons="dungeons"
      :chests="chests"
      @select="emit('select', $event)"
    />
  </div>
</template>

<style scoped>
/* Hidden on mobile (sub-768px), visible on desktop only */
.toolbar-wrap {
  display: none;
}
@media (min-width: 768px) and (min-height: 501px) {
  .toolbar-wrap {
    display: flex;
  }
}
</style>
