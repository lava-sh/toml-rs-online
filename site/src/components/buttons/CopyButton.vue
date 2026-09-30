<script setup lang="ts">
import copyDone from "../../assets/icons/copy-done.svg?raw";
import copyIdle from "../../assets/icons/copy-idle.svg?raw";
import Glyph from "../Glyph.vue";

defineProps<{
  copied: boolean;
  label: string;
  title: string;
}>();

const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <button
    class="copy-btn"
    :class="{ copied }"
    type="button"
    :aria-label="label"
    :title="title"
    @click="emit('click')"
  >
    <Glyph class="copy-icon copy-idle" :svg="copyIdle" />
    <Glyph class="copy-icon copy-done" :svg="copyDone" />
  </button>
</template>
