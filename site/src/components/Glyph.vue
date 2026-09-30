<script setup lang="ts">
defineProps<{
  svg: string;
}>();
</script>

<template>
  <span class="glyph" aria-hidden="true" v-html="svg"></span>
</template>
