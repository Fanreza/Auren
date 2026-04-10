<script setup lang="ts">
import { Toaster } from "vue-sonner";

import "vue-sonner/style.css";
</script>

<template>
	<NuxtPage />
	<Toaster position="top-center" :theme="'dark'" rich-colors />

	<!-- Botpress chat trigger -->
	<button
		id="bp-toggle-chat"
		class="fixed z-50 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center right-4 bottom-4"
		aria-label="Chat with Nora"
	>
		<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
	</button>
</template>
