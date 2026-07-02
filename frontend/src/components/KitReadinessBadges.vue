<script setup>
import { computed } from 'vue';
import {
  isKitReadyToApply,
  readinessBadgeClass,
  readinessLabel,
  READY_ATS_TARGET,
  READY_ATS_MIN,
} from '../utils/kitReadiness';

const props = defineProps({
  kit: { type: Object, default: null },
  compact: { type: Boolean, default: false },
});

const ready = computed(() => isKitReadyToApply(props.kit));
const label = computed(() => readinessLabel(props.kit));
const badgeClass = computed(() => readinessBadgeClass(props.kit));
</script>

<template>
  <div v-if="kit" class="flex flex-wrap items-center gap-2">
    <span v-if="kit.hasKit && kit.atsScore != null" class="badge badge-slate text-[11px]">
      ATS {{ kit.atsScore }}%
    </span>
    <span v-if="kit.hasKit && kit.jdMatchPct != null" class="badge badge-slate text-[11px]">
      Fit {{ kit.jdMatchPct }}%
    </span>
    <span class="badge text-[11px]" :class="badgeClass">
      {{ label }}
    </span>
    <span
      v-if="kit.hasKit && !ready && !compact"
      class="text-[11px] text-slate-500"
    >
      Target {{ kit.polishTarget || READY_ATS_TARGET }}% ATS · min {{ READY_ATS_MIN }}%
    </span>
  </div>
  <span v-else class="badge badge-slate text-[11px]">No kit</span>
</template>
