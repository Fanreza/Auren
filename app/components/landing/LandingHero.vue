<script setup lang="ts">
import { BRAND } from '~/config/brand'

const goals = [
  { emoji: '\u{1F3D6}\u{FE0F}', label: 'Vacation' },
  { emoji: '\u{1F3E0}', label: 'Dream Home' },
  { emoji: '\u{1F393}', label: 'Education' },
  { emoji: '\u{1F6E1}\u{FE0F}', label: 'Emergency Fund' },
  { emoji: '\u{1F680}', label: 'Freedom' },
]
</script>

<template>
	<section class="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
		<!-- Ambient glow orbs -->
		<div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
			<div class="absolute -top-[20%] right-[-10%] w-[min(600px,80vw)] h-[min(600px,80vw)] rounded-full bg-primary/15 blur-[120px] animate-drift-1" />
			<div class="absolute top-[30%] -left-[15%] w-[min(450px,70vw)] h-[min(450px,70vw)] rounded-full bg-primary/8 blur-[100px] animate-drift-2" />
			<div class="absolute -bottom-[15%] right-[15%] w-[min(400px,60vw)] h-[min(400px,60vw)] rounded-full bg-amber-500/10 blur-[100px] animate-drift-3" />
		</div>

		<div class="relative z-10 max-w-6xl mx-auto px-5 sm:px-6 lg:px-8 text-center">
			<!-- Logo -->
			<div class="animate-fade-up mb-8">
				<img src="/logo.png" :alt="BRAND.name" class="w-20 h-20 mx-auto" />
			</div>

			<!-- Badge -->
			<div class="animate-fade-up">
				<Badge variant="secondary" class="mb-8 px-4 py-1.5 text-sm font-medium bg-primary/8 text-muted-foreground border border-primary/15 backdrop-blur-sm"> Powered by Coinbase technology </Badge>
			</div>

			<!-- Headline -->
			<h1 class="text-[2.75rem] sm:text-5xl lg:text-7xl font-bold tracking-[-0.04em] leading-[1.1] animate-fade-up [animation-delay:100ms]">
				{{ BRAND.heroTitle }}
				<br />
				<span class="text-primary">{{ BRAND.heroAccent }}</span>
			</h1>

			<!-- Subtitle -->
			<p class="mt-6 sm:mt-8 text-base sm:text-lg lg:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed animate-fade-up [animation-delay:200ms]">
				{{ BRAND.heroBody }}
			</p>

			<!-- Goal pills -->
			<div class="flex flex-wrap justify-center gap-2 mt-8 animate-fade-up [animation-delay:280ms]">
				<span
					v-for="(goal, i) in goals"
					:key="goal.label"
					class="px-4 py-1.5 rounded-full text-sm bg-white/5 border border-white/10 text-muted-foreground backdrop-blur-sm animate-fade-up"
					:style="{ animationDelay: `${320 + i * 60}ms` }"
				>
					{{ goal.emoji }} {{ goal.label }}
				</span>
			</div>

			<!-- CTA buttons -->
			<div class="mt-10 sm:mt-12 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 animate-fade-up [animation-delay:550ms]">
				<button class="inline-flex items-center justify-center h-12 px-8 text-base font-semibold rounded-full bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary/80 hover:shadow-primary/35 active:scale-[0.98] transition-all duration-200" @click="navigateTo('/app')">
					Start with smart pockets
					<Icon name="lucide:arrow-right" class="w-4 h-4 ml-2" />
				</button>

				<Button variant="outline" size="lg" class="h-12 px-8 text-base rounded-full border-white/12 text-muted-foreground hover:bg-white/5 hover:text-foreground hover:border-white/20" as="a" href="#how-it-works">
					How It Works
					<Icon name="lucide:chevron-down" class="w-4 h-4 ml-1.5" />
				</Button>
			</div>
		</div>
	</section>
</template>
