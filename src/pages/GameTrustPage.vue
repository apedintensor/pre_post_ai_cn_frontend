<template>
  <div class="u-page u-page-standard trust-container u-surface-card border-round">
    <Toast />
    <Card class="trust-card shadow-2">
      <template #title>
        <div class="trust-header">
          <i class="pi pi-shield trust-icon"></i>
          <div class="trust-heading-text">
            <h2 class="trust-title">{{ $t('trust.title') }}</h2>
            <small v-if="blockDisplay" class="trust-subtitle">#{{ blockDisplay }}</small>
          </div>
        </div>
      </template>
      <template #content>
        <p class="trust-prompt">{{ $t('trust.prompt', { count: totalCases }) }}</p>
        <p class="trust-scale-label text-600">{{ $t('trust.scaleLabel') }}</p>
        <div class="trust-scale-grid">
          <div
            v-for="option in scaleOptions"
            :key="option.value"
            class="trust-option"
          >
            <Button
              type="button"
              :label="option.value.toString()"
              :severity="selectedScore === option.value ? 'primary' : 'secondary'"
              :outlined="selectedScore !== option.value"
              class="trust-score-button"
              :disabled="isSubmitting"
              @click="selectScore(option.value)"
            />
            <span class="trust-option-label">{{ option.description }}</span>
          </div>
        </div>
        <div class="trust-actions">
          <Button
            type="button"
            :label="$t('trust.submit')"
            icon="pi pi-check"
            class="trust-submit"
            :loading="isSubmitting"
            @click="handleSubmit"
          />
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import { useGamesStore } from '../stores/gamesStore';
import { submitBlockTrust } from '../api/games';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { t } = useI18n();
const gamesStore = useGamesStore();

const selectedScore = ref<number | null>(null);
const isSubmitting = ref(false);

const blockIndex = computed(() => {
  const raw = route.params.block;
  const parsed = raw != null ? parseInt(raw as string, 10) : NaN;
  return Number.isNaN(parsed) ? null : parsed;
});

const blockDisplay = computed(() => (blockIndex.value != null ? blockIndex.value + 1 : null));

const scaleOptions = computed(() => [
  { value: 1, description: t('trust.option1') },
  { value: 2, description: t('trust.option2') },
  { value: 3, description: t('trust.option3') },
  { value: 4, description: t('trust.option4') },
  { value: 5, description: t('trust.option5') }
]);

const totalCases = computed(() => {
  const idx = blockIndex.value;
  if (idx == null) return 15;
  const progress = gamesStore.blockProgress(idx);
  if (progress.total) return progress.total;
  const assignments = gamesStore.assignmentsByBlock[idx];
  if (assignments && Array.isArray(assignments) && assignments.length) {
    return assignments.length;
  }
  return 15;
});

function ensureContext(idx: number) {
  try {
    gamesStore.ensureAssignmentsLoaded(idx);
    gamesStore.startSummaryPolling(idx);
  } catch (error) {
    console.error('Failed to ensure block context', error);
  }
}

function selectScore(value: number) {
  selectedScore.value = value;
}

async function handleSubmit() {
  if (isSubmitting.value) return;
  const idx = blockIndex.value;
  if (idx == null) {
    await router.replace('/');
    return;
  }
  if (selectedScore.value == null) {
    toast.add({ severity: 'warn', summary: t('common.warning'), detail: t('trust.toastSelect'), life: 3500 });
    return;
  }
  isSubmitting.value = true;
  try {
    await submitBlockTrust(idx, selectedScore.value);
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('trust.toastSaved'), life: 3000 });
    await router.replace({ path: `/game/report/${idx}` });
  } catch (error: any) {
    console.error('Failed to submit trust feedback', error);
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('trust.toastError'), life: 4000 });
  } finally {
    isSubmitting.value = false;
  }
}

watch(blockIndex, (idx) => {
  if (idx == null) {
    router.replace('/');
    return;
  }
  selectedScore.value = null;
  ensureContext(idx);
}, { immediate: true });
</script>

<style scoped>
.trust-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 2.5rem;
}

.trust-card {
  width: 100%;
  max-width: 560px;
}

.trust-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.trust-icon {
  font-size: 2rem;
  color: var(--primary-color, #22c55e);
}

.trust-heading-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.trust-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.trust-subtitle {
  color: var(--text-color-secondary, #6b7280);
  letter-spacing: 1px;
}

.trust-prompt {
  font-size: 1rem;
  line-height: 1.5;
  margin-bottom: 1rem;
}

.trust-scale-label {
  margin-bottom: 0.75rem;
}

.trust-scale-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 1rem 0.75rem;
  margin-bottom: 1.75rem;
}

.trust-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
}

.trust-score-button {
  width: 100%;
  font-weight: 600;
}

.trust-option-label {
  font-size: 0.85rem;
  color: var(--text-color-secondary, #6b7280);
  min-height: 2.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.25rem;
  line-height: 1.3;
}

.trust-actions {
  display: flex;
  justify-content: center;
}

.trust-submit {
  min-width: 12rem;
}
</style>
