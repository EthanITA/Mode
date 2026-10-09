<script lang="ts" setup>
import { Moon, Sun } from "@lucide/vue";

const look = useTheme();
const isDark = computed(() => look.theme.value === "dark");
</script>

<template>
  <ChromeAction
    data-region="theme-toggle"
    :icon="isDark ? Sun : Moon"
    shape="island"
    :tip="isDark ? 'Light theme' : 'Dark theme'"
    @click="look.toggle"
  />
</template>
