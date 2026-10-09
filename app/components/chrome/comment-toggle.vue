<script lang="ts" setup>
import { MessageSquarePlus } from "@lucide/vue";
import type { ActionShape } from "~/components/chrome/action.vue";

const { shape } = defineProps<{ shape: ActionShape }>();

const chrome = useChrome();

function toggle(): void {
  if (chrome.comment.armed.value) chrome.comment.disarm();
  else chrome.comment.arm();
}
</script>

<template>
  <ChromeAction
    data-region="comment-arm"
    :icon="MessageSquarePlus"
    :is-on="chrome.comment.armed.value"
    label="Comment"
    :shape="shape"
    tip="Comment on anything · hold C"
    @click="toggle"
  />
</template>
