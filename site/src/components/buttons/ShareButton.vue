<script setup lang="ts">
import shareDone from "../../assets/icons/share-done.svg?raw";
import shareIdle from "../../assets/icons/share-idle.svg?raw";
import Glyph from "../Glyph.vue";

defineProps<{
  shared: boolean;
  label: string;
  title: string;
}>();

const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <button
    class="share-btn"
    :class="{ shared }"
    type="button"
    :aria-label="label"
    :title="title"
    @click="emit('click')"
  >
    <Glyph class="share-icon share-idle" :svg="shareIdle" />
    <Glyph class="share-icon share-done" :svg="shareDone" />
  </button>
</template>
