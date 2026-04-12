<script setup lang="ts">
import { storeToRefs } from "pinia";
import { BRAND } from "~/config/brand";
import { usePrivyAuth } from "~/composables/usePrivy";
import { useProfileStore } from "~/stores/useProfileStore";

const { isConnected, address, loginMethod, logout, eoaWalletAddress } = usePrivyAuth();
const profileStore = useProfileStore();
const { customName } = storeToRefs(profileStore);

const editingName = ref(false);
const nameInput = ref("");

// ---- Referral ----
const { getReferralCode, getReferralStats } = useUserData();
const referralCode = ref<string | null>(null);
const referralCount = ref(0);
const referredBy = ref<string | null>(null);
const referralList = ref<{ address: string; name: string | null; joined: string }[]>([]);
const referralLink = computed(() => (referralCode.value ? `${window.location.origin}/?ref=${referralCode.value}` : ""));
const copiedRef = ref(false);
const editingCode = ref(false);
const customCodeInput = ref("");
const customCodeError = ref("");
const savingCode = ref(false);

const loadingReferral = ref(false);
const generatingCode = ref(false);

async function loadReferral() {
	if (!address.value) return;
	loadingReferral.value = true;
	try {
		const stats = await getReferralStats(address.value);
		if (stats) {
			referralCode.value = stats.code;
			referralCount.value = stats.count;
			referredBy.value = stats.referred_by;
			referralList.value = stats.referrals || [];
		}
	} catch (e) {
		console.error("[referral] loadReferral failed:", e);
	} finally {
		loadingReferral.value = false;
	}
}

async function generateCode() {
	if (!address.value) return;
	generatingCode.value = true;
	try {
		const code = await getReferralCode(address.value);
		referralCode.value = code;
	} catch (e) {
		console.error("[referral] generateCode failed:", e);
	} finally {
		generatingCode.value = false;
	}
}

function startEditCode() {
	customCodeInput.value = referralCode.value || "";
	customCodeError.value = "";
	editingCode.value = true;
}

async function saveCustomCode() {
	if (!address.value) return;
	const code = customCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
	if (code.length < 3 || code.length > 12) {
		customCodeError.value = "Must be 3-12 characters (letters and numbers only)";
		return;
	}
	savingCode.value = true;
	customCodeError.value = "";
	try {
		const res = await $fetch<{ code: string }>("/api/referral/generate", {
			method: "POST",
			body: { address: address.value, code },
		});
		referralCode.value = res.code;
		editingCode.value = false;
	} catch (e: any) {
		customCodeError.value = e.data?.message || "Could not save code";
	} finally {
		savingCode.value = false;
	}
}

function copyReferralLink() {
	if (!referralLink.value) return;
	navigator.clipboard.writeText(referralLink.value);
	copiedRef.value = true;
	setTimeout(() => (copiedRef.value = false), 2000);
}

function shareReferral() {
	if (!referralLink.value) return;
	if (navigator.share) {
		navigator
			.share({
				title: `Join ${BRAND.name}`,
				text: `Save smarter on Base with ${BRAND.name}. Join me!`,
				url: referralLink.value,
			})
			.catch(() => {});
	} else {
		copyReferralLink();
	}
}

watch(
	address,
	(addr) => {
		if (addr) loadReferral();
	},
	{ immediate: true },
);

// Redirect if not connected
watch(
	isConnected,
	(connected) => {
		if (!connected) navigateTo("/app");
	},
	{ immediate: true },
);

function startEditing() {
	nameInput.value = customName.value;
	editingName.value = true;
}

function saveName() {
	profileStore.setCustomName(nameInput.value.trim());
	editingName.value = false;
}

async function handleDisconnect() {
	profileStore.reset();
	await logout();
	navigateTo("/app");
}

function truncate(addr: string) {
	return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
</script>

<template>
	<div class="min-h-screen bg-background">
		<div class="max-w-md mx-auto px-4 py-6 flex flex-col min-h-screen">
			<!-- Header -->
			<header class="flex items-center gap-3 mb-8">
				<Button variant="ghost" size="icon" @click="navigateTo('/app')">
					<Icon name="lucide:arrow-left" class="w-5 h-5" />
				</Button>
				<h1 class="text-xl font-bold">Account</h1>
			</header>

			<template v-if="isConnected && address">
				<!-- Avatar & Identity -->
				<div class="flex flex-col items-center mb-8">
					<div class="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
						<Icon name="lucide:user" class="w-10 h-10 text-primary" />
					</div>
					<p class="text-lg font-semibold">
						{{ profileStore.displayName(address) }}
					</p>
					<Badge variant="secondary" class="mt-2 font-mono text-xs">
						{{ truncate(address) }}
					</Badge>
					<div v-if="eoaWalletAddress && eoaWalletAddress !== address" class="flex items-center gap-1.5 mt-2">
						<Icon name="lucide:key-round" class="w-3 h-3 text-muted-foreground/60" />
						<span class="text-[11px] text-muted-foreground/60">Signer</span>
						<Badge variant="outline" class="font-mono text-[10px] h-5 text-muted-foreground/60">
							{{ truncate(eoaWalletAddress) }}
						</Badge>
					</div>
				</div>

				<div class="space-y-4">
					<!-- Display Name -->
					<Card>
						<CardContent class="p-4">
							<div class="flex items-center justify-between mb-3">
								<div class="flex items-center gap-2">
									<Icon name="lucide:pen-line" class="w-4 h-4 text-muted-foreground" />
									<p class="text-sm font-medium">Display Name</p>
								</div>
								<Button v-if="!editingName" variant="ghost" size="sm" @click="startEditing"> Edit </Button>
							</div>
							<template v-if="editingName">
								<div class="flex gap-2">
									<Input v-model="nameInput" placeholder="Enter your name" class="flex-1" @keyup.enter="saveName" />
									<Button size="sm" class="bg-primary text-primary-foreground hover:bg-primary/90" @click="saveName">Save</Button>
									<Button size="sm" variant="ghost" @click="editingName = false">
										<Icon name="lucide:x" class="w-4 h-4" />
									</Button>
								</div>
							</template>
							<p v-else class="text-sm text-muted-foreground">
								{{ customName || "No name set" }}
							</p>
						</CardContent>
					</Card>

					<!-- Wallet Management -->
					<Card>
						<CardContent class="p-4">
							<!-- Coinbase Smart Wallet -->
							<template v-if="loginMethod === 'coinbase'">
								<div class="flex items-center gap-2 mb-1">
									<Icon name="simple-icons:coinbase" class="w-4 h-4 text-[#0052FF]" />
									<p class="text-sm font-medium">Coinbase Wallet</p>
								</div>
								<p class="text-xs text-muted-foreground mb-3">Back up your account keys to keep them safe.</p>
								<Button variant="outline" size="sm" class="w-full" as="a" href="https://keys.coinbase.com" target="_blank">
									<Icon name="lucide:external-link" class="w-3.5 h-3.5 mr-1.5" />
									Manage Keys
								</Button>
							</template>

							<!-- Privy embedded wallet (email/phone/social) -->
							<template v-else-if="['email', 'phone', 'google', 'twitter', 'discord', 'farcaster'].includes(loginMethod || '')">
								<div class="flex items-center gap-2 mb-1">
									<Icon name="lucide:shield-check" class="w-4 h-4 text-primary" />
									<p class="text-sm font-medium">Wallet Security</p>
								</div>
								<p class="text-xs text-muted-foreground mb-3">Your wallet is secured by Privy. Export or manage your keys from Privy.</p>
								<Button variant="outline" size="sm" class="w-full" as="a" href="https://home.privy.io/" target="_blank">
									<Icon name="lucide:external-link" class="w-3.5 h-3.5 mr-1.5" />
									Manage Keys
								</Button>
							</template>

							<!-- External wallet (MetaMask, Rabby, etc.) -->
							<template v-else>
								<div class="flex items-center gap-2 mb-1">
									<Icon name="lucide:wallet" class="w-4 h-4 text-muted-foreground" />
									<p class="text-sm font-medium">External Wallet</p>
								</div>
								<p class="text-xs text-muted-foreground">Your keys are managed by your wallet app. Export or back up through your wallet directly.</p>
							</template>
						</CardContent>
					</Card>

					<!-- Referral -->
					<Card>
						<CardContent class="p-4">
							<div class="flex items-center gap-2 mb-3">
								<Icon name="lucide:gift" class="w-4 h-4 text-primary" />
								<p class="text-sm font-medium">Invite Friends</p>
								<Badge v-if="referralCount > 0" variant="secondary" class="ml-auto text-xs"> {{ referralCount }} invited </Badge>
							</div>

							<p class="text-xs text-muted-foreground mb-3">Share your link and grow the community together.</p>

							<!-- Loading -->
							<div v-if="loadingReferral" class="flex items-center gap-2">
								<Skeleton class="h-10 flex-1 rounded-lg" />
								<Skeleton class="h-10 w-10 rounded-lg" />
							</div>

							<!-- No code yet — show Generate button -->
							<div v-else-if="!referralCode && !editingCode">
								<Button class="w-full bg-primary text-primary-foreground hover:bg-primary/90" :disabled="generatingCode" @click="generateCode">
									<Icon v-if="generatingCode" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
									<Icon v-else name="lucide:sparkles" class="w-4 h-4 mr-2" />
									Generate Referral Code
								</Button>
							</div>

							<!-- Edit custom code -->
							<template v-else-if="editingCode">
								<div class="space-y-2">
									<div class="flex items-center gap-2">
										<Input v-model="customCodeInput" placeholder="e.g. AUREN" class="flex-1 h-10 font-mono uppercase" maxlength="12" @keyup.enter="saveCustomCode" />
										<Button size="sm" class="h-10 bg-primary text-primary-foreground hover:bg-primary/90" :disabled="savingCode" @click="saveCustomCode">
											<Icon v-if="savingCode" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
											<template v-else>Save</template>
										</Button>
										<Button variant="ghost" size="sm" class="h-10" @click="editingCode = false">
											<Icon name="lucide:x" class="w-4 h-4" />
										</Button>
									</div>
									<p class="text-[11px] text-muted-foreground">3-12 characters, letters and numbers only</p>
									<p v-if="customCodeError" class="text-[11px] text-destructive">{{ customCodeError }}</p>
								</div>
							</template>

							<!-- Show code + actions -->
							<template v-else>
								<div class="flex items-center gap-2 mb-3">
									<div class="flex-1 h-10 rounded-lg bg-muted/60 border flex items-center px-3">
										<span class="text-sm font-mono font-medium truncate">{{ referralCode }}</span>
									</div>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger as-child>
												<Button variant="outline" size="sm" class="h-10 shrink-0" @click="startEditCode">
													<Icon name="lucide:pencil" class="w-4 h-4" />
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												<p>Custom code</p>
											</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger as-child>
												<Button variant="outline" size="sm" class="h-10 shrink-0" @click="copyReferralLink">
													<Icon :name="copiedRef ? 'lucide:check' : 'lucide:copy'" class="w-4 h-4" />
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												<p>{{ copiedRef ? "Copied!" : "Copy link" }}</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>

								<Button class="w-full bg-primary text-primary-foreground hover:bg-primary/90" @click="shareReferral">
									<Icon name="lucide:share-2" class="w-4 h-4 mr-2" />
									Share Invite Link
								</Button>

								<!-- Referred by -->
								<div v-if="referredBy" class="mt-3 pt-3 border-t border-border/50">
									<p class="text-xs text-muted-foreground">
										Invited by <span class="font-medium text-foreground">{{ truncate(referredBy) }}</span>
									</p>
								</div>

								<!-- Referral list -->
								<div v-if="referralList.length > 0" class="mt-3 pt-3 border-t border-border/50">
									<p class="text-xs font-medium text-muted-foreground mb-2">{{ referralList.length }} friend{{ referralList.length !== 1 ? "s" : "" }} joined</p>
									<div class="space-y-2">
										<div v-for="r in referralList" :key="r.address" class="flex items-center justify-between text-sm">
											<div class="flex items-center gap-2">
												<div class="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
													<Icon name="lucide:user" class="w-3 h-3 text-muted-foreground" />
												</div>
												<span class="font-medium">{{ r.name || truncate(r.address) }}</span>
											</div>
											<span class="text-xs text-muted-foreground">
												{{ new Date(r.joined).toLocaleDateString("en-US", { month: "short", day: "numeric" }) }}
											</span>
										</div>
									</div>
								</div>
							</template>
						</CardContent>
					</Card>

					<Separator />

					<!-- Sign Out -->
					<Button variant="destructive" class="w-full" @click="handleDisconnect">
						<Icon name="lucide:log-out" class="w-4 h-4 mr-2" />
						Sign Out
					</Button>
				</div>
			</template>
		</div>
	</div>
	<LandingFooter />
</template>
