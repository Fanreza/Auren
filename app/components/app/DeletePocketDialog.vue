<script setup lang="ts">
import type { DbPocket } from '~/types/database'

const props = defineProps<{
  pocketPositions: Record<string, { shares: bigint; value: bigint }>
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  confirmed: [id: string]
}>()

const pocketToDelete = ref<DbPocket | null>(null)
const deleting = ref(false)

const hasFunds = computed(() => {
  if (!pocketToDelete.value) return false
  const pos = props.pocketPositions[pocketToDelete.value.id]
  return pos && pos.shares > 0n
})

function requestDelete(pocket: DbPocket) {
  pocketToDelete.value = pocket
  open.value = true
}

async function confirmDelete() {
  if (!pocketToDelete.value) return
  deleting.value = true
  try {
    emit('confirmed', pocketToDelete.value.id)
  } finally {
    deleting.value = false
    open.value = false
    pocketToDelete.value = null
  }
}

defineExpose({ requestDelete })
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ hasFunds ? "Can't delete pocket" : 'Delete pocket?' }}</AlertDialogTitle>
        <AlertDialogDescription>
          <template v-if="hasFunds">
            <span class="font-medium text-foreground">{{ pocketToDelete?.name }}</span> still has funds. Use the Cash Out button to withdraw first, then delete the pocket. You can also withdraw directly via
            <a href="https://app.yo.xyz" target="_blank" rel="noopener" class="text-primary underline underline-offset-2 hover:text-primary/80">app.yo.xyz</a>.
          </template>
          <template v-else>
            Are you sure you want to delete <span class="font-medium text-foreground">{{ pocketToDelete?.name }}</span>? This action cannot be undone.
          </template>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="deleting">{{ hasFunds ? 'OK' : 'Cancel' }}</AlertDialogCancel>
        <AlertDialogAction
          v-if="!hasFunds"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          :disabled="deleting"
          @click.prevent="confirmDelete"
        >
          <Icon v-if="deleting" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
