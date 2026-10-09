<script lang="ts" setup>
import { Moon, Sun } from "@lucide/vue";
import type { ActionShape } from "~/components/chrome/action.vue";

const { shape } = defineProps<{ shape: ActionShape }>();

const look = useArtifactTheme();
const isDark = computed(() => look.theme.value === "dark");
</script>

<template>
  <ChromeAction
    data-region="artifact-theme"
    :icon="isDark ? Sun : Moon"
    :shape="shape"
    :tip="isDark ? 'Show the page light' : 'Show the page dark'"
    @click="look.toggle"
  />
</template>
