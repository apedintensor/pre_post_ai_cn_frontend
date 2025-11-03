<template>
  <div v-if="isPostAiPhase">
    <Card class="mb-4">
      <template #title>{{ $t('review.aiSuggestions') }}</template>
      <template #content>
        <div v-if="aiOutputs && aiOutputs.length > 0">
          <DataTable :value="aiOutputs" 
                     class="p-datatable-sm" 
                     responsiveLayout="scroll"
                     sortField="rank"
                     :sortOrder="1">
            <Column field="rank" :header="$t('common.rank')" sortable style="width: 15%">
              <template #body="slotProps">
                <Tag :value="slotProps.data.rank" rounded />
              </template>
            </Column>
            <Column field="prediction.name" :header="$t('review.aiSuggestions')" sortable style="width: 100%"></Column>
          </DataTable>
        </div>
        <div v-else>
          <p>{{ $t('review.aiSuggestions') }}：{{ $t('loading') }}</p>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import Card from 'primevue/card';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';

useI18n();

interface DiagnosisTermRead {
  name: string;
  id: number;
}

interface AIOutputRead {
  rank: number | null;
  confidence_score: number | null;
  id: number;
  case_id: number;
  prediction_id: number;
  prediction: DiagnosisTermRead;
}

defineProps<{
  aiOutputs: AIOutputRead[];
  isPostAiPhase: boolean;
}>();
</script>

<style scoped>
.ml-2 {
  margin-left: 0.5rem;
}
</style>
