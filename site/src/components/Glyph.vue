<script setup lang="ts">
withDefaults(
  defineProps<{
    paths: readonly string[];
    box?: string;
    size?: number;
  }>(),
  { box: "0 0 16 16", size: 16 },
);
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="currentcolor"
    :viewBox="box"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <path v-for="(d, index) in paths" :key="index" :d="d" />
  </svg>
</template>
