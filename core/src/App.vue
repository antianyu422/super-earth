<script setup>
import Earth from "./core/Earth.ts";
import {onMounted} from "vue";

onMounted(() => {
  new window.SPECTOR.Spector().displayUI()
  const earth = new Earth('container')
})
</script>

<template>
  <div id="container"></div>
</template>

<style scoped>
#container {
  width: 100%;
  height: 100%;
}
</style>
