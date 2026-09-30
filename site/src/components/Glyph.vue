<script setup lang="ts">
withDefaults(
  defineProps<{
    paths: readonly string[];
    box?: string;
    size?: number;
    stroke?: boolean;
    strokeWidth?: number;
  }>(),
  { box: "0 0 16 16", size: 16, stroke: false, strokeWidth: 2 },
);
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :fill="stroke ? 'none' : 'currentcolor'"
    :stroke="stroke ? 'currentcolor' : undefined"
    :stroke-width="stroke ? strokeWidth : undefined"
    :stroke-linecap="stroke ? 'round' : undefined"
    :stroke-linejoin="stroke ? 'round' : undefined"
    :viewBox="box"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <path v-for="(d, index) in paths" :key="index" :d="d" />
  </svg>
</template>
