<template>
  <div class="u-page u-page-narrow demo-complete">
    <Toast />
    <Card class="shadow-2 demo-card">
      <template #title>
        <div class="flex flex-column gap-2 align-items-center text-center">
          <i class="pi pi-flag-checkered text-3xl text-primary"></i>
          <h2 class="m-0 text-2xl font-semibold">{{ $t('demo.completeTitle') }}</h2>
        </div>
      </template>
      <template #content>
        <p class="text-lg text-center text-700 mb-3">{{ $t('demo.completeLead') }}</p>
        <Message severity="info" class="mb-4 demo-hint">
          {{ $t('demo.practiceHint') }}
        </Message>
        <div class="flex flex-column md:flex-row gap-3 justify-content-center">
          <Button
            type="button"
            severity="secondary"
            icon="pi pi-refresh"
            :label="$t('demo.practiceAgain')"
            class="p-button-outlined demo-btn"
            :loading="launchingDemo"
            :disabled="launchingDemo || startingRealGame"
            @click="handlePracticeAgain"
          />
          <Button
            type="button"
            severity="primary"
            icon="pi pi-play"
            :label="$t('demo.startRealGame')"
            class="demo-btn"
            :loading="startingRealGame"
            :disabled="startingRealGame"
            @click="handleStartRealGame"
          />
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import { useCaseStore } from '../stores/caseStore';
import { useGamesStore } from '../stores/gamesStore';
import { navigateToDemoCase } from '../utils/demo';

const router = useRouter();
const toast = useToast();
const { t } = useI18n();
const caseStore = useCaseStore();
const gamesStore = useGamesStore();

const launchingDemo = ref(false);
const startingRealGame = ref(false);

const handlePracticeAgain = async () => {
  if (launchingDemo.value) return;
  launchingDemo.value = true;
  try {
    await navigateToDemoCase(router, caseStore, { replace: true });
  } catch (error: any) {
    console.error('Failed to relaunch demo case', error);
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('demo.practiceError'), life: 4000 });
  } finally {
    launchingDemo.value = false;
  }
};

const handleStartRealGame = async () => {
  if (startingRealGame.value) return;
  startingRealGame.value = true;
  try {
    const response = await gamesStore.advanceToNext();
    if (response.status === 'exhausted' || !response.assignment) {
      toast.add({ severity: 'warn', summary: t('common.info'), detail: t('demo.exhausted'), life: 4000 });
      await router.push('/');
      return;
    }
    await router.push({ path: `/case/${response.assignment.case_id}` });
  } catch (error: any) {
    console.error('Failed to start real game after demo', error);
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('demo.startGameError'), life: 4000 });
  } finally {
    startingRealGame.value = false;
  }
};
</script>

<style scoped>
.demo-complete {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 2.5rem;
}

.demo-card {
  width: 100%;
  max-width: 540px;
}

.demo-btn {
  min-width: 14rem;
}

.demo-hint {
  font-size: 0.95rem;
  line-height: 1.4;
}
</style>
