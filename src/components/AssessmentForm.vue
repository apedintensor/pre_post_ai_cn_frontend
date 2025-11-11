<template>
  <Card>
    <template #title>
      {{ isPostAiPhase ? $t('case.postTitle') : $t('case.preTitle') }}
    </template>
    <template #content>
      <form @submit.prevent="$emit('submit-form')">
        <Fieldset :legend="$t('case.sectionDiagnoses')" class="mb-4">
          <!-- Post-AI: Change Primary Diagnosis question moved here -->
          <div v-if="isPostAiPhase" class="field mb-3 change-diagnosis-toggle">
            <label id="changeDiagnosis-label" class="font-medium mb-2">{{ $t('case.changeDiagQuestion') }}</label>
            <SelectButton id="changeDiagnosis"
                          name="changeDiagnosis"
                          v-model="formData.changeDiagnosis"
                          @update:modelValue="onChangeDiagnosisUserToggle"
                          :options="changeOptions"
                          optionLabel="label"
                          optionValue="value"
                          class="w-full md:w-auto"
                          :aria-labelledby="'changeDiagnosis-label'"
                          :allowEmpty="false"
                          :class="{'p-invalid': submitted && formData.changeDiagnosis === null}"
                          required
                          v-tooltip.bottom="t('case.changeDiagQuestion')" />
            <small v-if="submitted && formData.changeDiagnosis === null" class="p-error mt-2">{{ $t('common.required') }}</small>
            <small v-else-if="showChangeDiagnosisPrompt" class="p-warning mt-2">{{ $t('case.changeDiagPrompt') }}</small>
          </div>
          <div class="grid formgrid">
            <div class="field col-12">
              <label id="diag1-label">{{ $t('case.primaryDiagnosis') }}</label>
              <input
                id="diag1"
                class="da-input"
                v-model="diagnosisRank1Proxy"
                type="text"
                :placeholder="$t('case.freeTextPlaceholder')"
                :disabled="submitting"
              />
              <small v-if="submitted && !formData.diagnosisRank1Text" class="p-error">{{ $t('case.validationPrimaryRequired') }}</small>
            </div>
            <div class="field col-12 md:col-6">
              <label id="diag2-label">{{ $t('case.differential2') }}</label>
              <input
                id="diag2"
                class="da-input"
                v-model="diagnosisRank2Proxy"
                type="text"
                :placeholder="$t('common.optional')"
                :disabled="submitting"
              />
            </div>
            <div class="field col-12 md:col-6">
              <label id="diag3-label">{{ $t('case.differential3') }}</label>
              <input
                id="diag3"
                class="da-input"
                v-model="diagnosisRank3Proxy"
                type="text"
                :placeholder="$t('common.optional')"
                :disabled="submitting"
              />
            </div>
          </div>
        </Fieldset>

        <Fieldset :legend="$t('case.sectionManagement')" class="mb-4">
          <!-- Post-AI: Change Management question moved here -->
          <div v-if="isPostAiPhase" class="field mb-3 change-management-toggle">
            <label id="changeManagement-label" class="font-medium mb-2">{{ $t('case.changeMgmtQuestion') }}</label>
            <SelectButton id="changeManagement" name="changeManagement" v-model="formData.changeManagement"
                          @update:modelValue="onChangeManagementUserToggle"
                          :options="changeOptions"
                          optionLabel="label"
                          optionValue="value"
                          class="w-full md:w-auto"
                          :aria-labelledby="'changeManagement-label'"
                          :allowEmpty="false"
                          :class="{'p-invalid': submitted && formData.changeManagement === null}"
                          required
                          v-tooltip.bottom="t('case.changeMgmtQuestion')" />
            <small v-if="submitted && formData.changeManagement === null" class="p-error mt-2">{{ $t('common.required') }}</small>
            <small v-else-if="showChangeManagementPrompt" class="p-warning mt-2">{{ $t('case.changeMgmtPrompt') }}</small>
          </div>
          <div class="grid formgrid aligned-grid mgmt-grid">
            <div class="field col-12 md:col-6 centered-field">
              <label>{{ $t('case.investigationLabel') }}</label>
              <SelectButton v-model="formData.investigationPlan" :options="investigationOptions" optionLabel="label" optionValue="value" class="w-full" :class="{'p-invalid': submitted && !formData.investigationPlan}" />
              <small v-if="submitted && !formData.investigationPlan" class="p-error">{{ $t('common.selectOne') }}</small>
            </div>
            <div class="field col-12 md:col-6 centered-field">
              <label>{{ $t('case.nextStepLabel') }}</label>
              <SelectButton v-model="formData.nextStep" :options="nextStepOptions" optionLabel="label" optionValue="value" class="w-full" :class="{'p-invalid': submitted && !formData.nextStep}" />
              <small v-if="submitted && !formData.nextStep" class="p-error">{{ $t('common.selectOne') }}</small>
            </div>
          </div>
        </Fieldset>

        <Fieldset :legend="$t('case.sectionConfidence')" class="mb-4">
          <div class="grid formgrid aligned-grid">
            <div class="field col-12 md:col-6 centered-field">
              <label id="confidence-label">{{ $t('case.confidenceLabel') }}</label>
              <SelectButton id="confidence"
                            name="confidence"
                            v-model="formData.confidenceScore"
                            :options="scoreOptions"
                            optionLabel="label"
                            optionValue="value"
                            class="w-full"
                            :aria-labelledby="'confidence-label'"
                            v-tooltip.bottom="getConfidenceLabel(formData.confidenceScore || 0)" />
            </div>
            <div class="field col-12 md:col-6 centered-field">
              <label id="certainty-label">{{ $t('case.certaintyLabel') }}</label>
              <SelectButton id="certainty"
                            name="certainty"
                            v-model="formData.certaintyScore"
                            :options="scoreOptions"
                            optionLabel="label"
                            optionValue="value"
                            class="w-full"
                            :aria-labelledby="'certainty-label'"
                            v-tooltip.bottom="getCertaintyLabel(formData.certaintyScore || 0)" />
            </div>
          </div>
        </Fieldset>

  <!-- Management & diagnosis layout adjusted -->

        <!-- Post-AI Specific Questions -->
        <div v-if="isPostAiPhase">
          <Divider />
          <Fieldset :legend="$t('case.aiImpact')" class="mt-4 mb-4 ai-impact">
            <div class="grid formgrid ai-impact-grid">
              <div class="field col-12">
                <label id="aiUsefulness-label">{{ $t('case.aiUsefulLabel') }}</label>
                <SelectButton id="aiUsefulness" name="aiUsefulness" v-model="formData.aiUsefulness"
                              :options="aiUsefulnessOpts"
                              optionLabel="label"
                              optionValue="value"
                              class="w-full"
                              :aria-labelledby="'aiUsefulness-label'"
                              :class="{'p-invalid': submitted && !formData.aiUsefulness}"
                              required
                              v-tooltip.bottom="t('case.aiUsefulLabel')" />
                <small v-if="submitted && !formData.aiUsefulness" class="p-error">{{ $t('common.required') }}</small>
              </div>
            </div>
          </Fieldset>
        </div>

        <div class="col-12 mt-4">
          <Button type="submit"
                  :label="submitting ? $t('common.submitting') : (isPostAiPhase ? $t('case.submitPost') : $t('case.submitPre'))"
                  :icon="submitting ? 'pi pi-spin pi-spinner' : (isPostAiPhase ? 'pi pi-check-circle' : 'pi pi-arrow-right')"
                  :severity="isPostAiPhase ? 'success' : 'primary'"
                  class="w-full p-3"
                  :loading="submitting"
                  :disabled="submitting"
                  v-tooltip.bottom="isPostAiPhase ? t('case.submitPost') : t('case.submitPre')" />
        </div>
      </form>
    </template>
  </Card>
</template>

<script setup lang="ts">
import Card from 'primevue/card';
import Fieldset from 'primevue/fieldset';
import SelectButton from 'primevue/selectbutton';
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { useI18n } from 'vue-i18n';
import type { InvestigationPlan, NextStepAction } from '../utils/assessmentEnums';

const { t } = useI18n();

// Interfaces for props
interface DiagnosisTermRead {
  name: string;
  id: number;
}

interface FormData {
  diagnosisRank1Text: string | null;
  diagnosisRank2Text: string | null;
  diagnosisRank3Text: string | null;
  confidenceScore: number;
  certaintyScore: number;
  investigationPlan: InvestigationPlan | null;
  nextStep: NextStepAction | null;
  // Post-AI specific fields - ensure they are optional or handled in parent
  changeDiagnosis?: boolean | null;
  changeManagement?: boolean | null;
  aiUsefulness?: string | null;
}

interface ScoreOption {
  label: string;
  value: number;
}

interface AiUsefulnessOption {
  label: string;
  value: string;
}

interface ChangeOption {
  label: string;
  value: boolean;
}

const props = defineProps<{
  formData: FormData;
  diagnosisTerms: DiagnosisTermRead[];
  scoreOptions: ScoreOption[];
  submitted: boolean;
  submitting: boolean;
  isPostAiPhase: boolean;
  aiUsefulnessOptions?: AiUsefulnessOption[]; // Optional as they are only for post-AI
  changeOptions?: ChangeOption[];           // Optional as they are only for post-AI
  getConfidenceLabel: (score: number) => string;
  getCertaintyLabel: (score: number) => string;
}>();

const emit = defineEmits(['submit-form']);

// Track whether the user manually toggled the change flags (vs. auto-set by parent)
const changeDiagnosisSelectedByUser = ref(false);
const changeManagementSelectedByUser = ref(false);

// Track original primary diagnosis at time user indicates change
const originalPrimaryAtChange = ref<string | null>(null);
const showChangeDiagnosisPrompt = computed(() => {
  if (!props.isPostAiPhase) return false;
  if (props.formData.changeDiagnosis !== true) return false;
  if (!changeDiagnosisSelectedByUser.value) return false; // show only if user manually selected Yes
  // If user has not modified the primary diagnosis after toggling yes
  return originalPrimaryAtChange.value != null && originalPrimaryAtChange.value === props.formData.diagnosisRank1Text;
});

// Track original management selections (biopsy/referral) when user indicates change
const originalManagementAtChange = ref<{ investigationPlan: FormData['investigationPlan']; nextStep: FormData['nextStep'] } | null>(null);
const showChangeManagementPrompt = computed(() => {
  if (!props.isPostAiPhase) return false;
  if (props.formData.changeManagement !== true) return false;
  if (!changeManagementSelectedByUser.value) return false; // show only if user manually selected Yes
  if (!originalManagementAtChange.value) return false;
  const unchangedInvestigation = originalManagementAtChange.value.investigationPlan === props.formData.investigationPlan;
  const unchangedNextStep = originalManagementAtChange.value.nextStep === props.formData.nextStep;
  // Prompt if both remain exactly the same
  return unchangedInvestigation && unchangedNextStep;
});

watch(() => props.formData.changeDiagnosis, (val) => {
  if (val === true) {
    // Only snapshot if user manually selected Yes; skip when auto-set
    if (changeDiagnosisSelectedByUser.value) {
      originalPrimaryAtChange.value = props.formData.diagnosisRank1Text || '';
    } else {
      originalPrimaryAtChange.value = null;
    }
  } else {
    originalPrimaryAtChange.value = null;
    if (val === false) changeDiagnosisSelectedByUser.value = false;
  }
});

watch(() => props.formData.changeManagement, (val) => {
  if (val === true) {
    if (changeManagementSelectedByUser.value) {
      originalManagementAtChange.value = {
        investigationPlan: props.formData.investigationPlan,
        nextStep: props.formData.nextStep
      };
    } else {
      originalManagementAtChange.value = null;
    }
  } else {
    originalManagementAtChange.value = null;
    if (val === false) changeManagementSelectedByUser.value = false;
  }
});

// When primary diagnosis changes after indicating change, hide prompt automatically
watch(() => props.formData.diagnosisRank1Text, () => {
  if (props.formData.changeDiagnosis === true && originalPrimaryAtChange.value != null) {
    // if value differs, prompt computed will turn false
  }
});

// When management selections change after indicating change, prompt will auto-hide if either differs
watch(() => [props.formData.investigationPlan, props.formData.nextStep], () => {
  if (props.formData.changeManagement === true && originalManagementAtChange.value) {
    // prompt recomputes automatically
  }
});

// Free-text mode: no selection handler needed

function onChangeDiagnosisUserToggle() {
  changeDiagnosisSelectedByUser.value = true;
}

function onChangeManagementUserToggle() {
  changeManagementSelectedByUser.value = true;
}

const investigationOptions = computed(() => ([
  { label: t('case.investigationNone'), value: 'NONE' as InvestigationPlan },
  { label: t('case.investigationBiopsy'), value: 'BIOPSY' as InvestigationPlan },
  { label: t('case.investigationOther'), value: 'OTHER' as InvestigationPlan }
]));

const nextStepOptions = computed(() => ([
  { label: t('case.nextReassure'), value: 'REASSURE' as NextStepAction },
  { label: t('case.nextManage'), value: 'MANAGE_MYSELF' as NextStepAction },
  { label: t('case.nextRefer'), value: 'REFER' as NextStepAction }
]));

const aiUsefulnessOpts = computed(() => props.aiUsefulnessOptions ?? ([
  { label: t('case.aiUsefulVery'), value: 'very' },
  { label: t('case.aiUsefulSome'), value: 'some' },
  { label: t('case.aiUsefulNot'), value: 'not' }
]));

// Null-safe proxies for autocomplete (component expects string)
const diagnosisRank1Proxy = computed({
  get: () => props.formData.diagnosisRank1Text || '',
  set: (v: string) => { props.formData.diagnosisRank1Text = v || null; }
});
const diagnosisRank2Proxy = computed({
  get: () => props.formData.diagnosisRank2Text || '',
  set: (v: string) => { props.formData.diagnosisRank2Text = v || null; }
});
const diagnosisRank3Proxy = computed({
  get: () => props.formData.diagnosisRank3Text || '',
  set: (v: string) => { props.formData.diagnosisRank3Text = v || null; }
});

// Register Tooltip directive locally if not globally registered
// import { Tooltip } from 'primevue/tooltip'; // Already imported
// No need for app.directive if it's globally registered in main.ts
// If not, and you want it local: directives: { Tooltip }
</script>

<style scoped>
.w-full {
  width: 100%;
}
.p-error {
  display: block;
  margin-top: 0.25rem;
}
.mb-4 {
  margin-bottom: 1.5rem; /* Consistent spacing */
}
.mt-4 {
  margin-top: 1.5rem;
}
/* Ensure SelectButton options are visible and well-spaced */
:deep(.p-selectbutton .p-button) {
    flex-grow: 1;
}

/* AI Impact alignment */
.ai-impact-grid {
  align-items: stretch;
}
.ai-impact-grid .field {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}
.ai-impact-grid label {
  margin-bottom: 0.5rem;
  font-weight: 500;
}
:deep(.ai-impact-grid label) {
  display: block;
  width: 100%;
  text-align: center;
}
:deep(.ai-impact .p-selectbutton) {
  display: flex;
  justify-content: center;
  width: 100%;
}
:deep(.ai-impact .p-selectbutton .p-button) {
  flex: 1 1 0;
  text-wrap: balance;
}
@media (min-width: 768px) {
  .ai-impact-grid .field { padding-right: .75rem; }
  .ai-impact-grid .field:last-child { padding-right: 0; }
}

/* Shared alignment for earlier sections */
.aligned-grid { align-items: stretch; }
.aligned-grid .field { display:flex; flex-direction:column; }
.aligned-grid label { margin-bottom:.5rem; font-weight:500; }

/* Ensure the two management columns align on one row with labels equalized */
.mgmt-grid { align-items: stretch; }
.mgmt-grid .field { justify-content: flex-start; }
@media (min-width: 768px) {
  /* Normalize label heights so different text lengths don't push buttons down */
  .mgmt-grid .field label {
    min-height: 3rem; /* tweak if needed based on font-size/line-height */
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
}

/* Centered variant for specific fields */
.centered-field { align-items:center; text-align:center; }
.centered-field label { text-align:center; width:100%; }
:deep(.centered-field .p-selectbutton) { justify-content:center; }
/* Constrain width a bit on large screens so buttons aren't overly wide */
@media (min-width:768px) {
  :deep(.centered-field .p-selectbutton) { max-width:480px; }
}

:deep(.centered-field .p-selectbutton .p-button) {
  white-space: nowrap;
}

/* Center fieldset legends */
:deep(.p-fieldset-legend) { display:flex; justify-content:center; margin-left:auto; margin-right:auto; }
:deep(.p-fieldset-legend .p-fieldset-legend-text) { text-align:center; width:100%; }

/* Warning style */
.p-warning { display:block; color: var(--accent-primary); }
/* Toggle groups (Change Diagnosis / Change Management) vertically stacked & centered */
.change-diagnosis-toggle,
.change-management-toggle {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.change-diagnosis-toggle label,
.change-management-toggle label {
  display: block;
  width: 100%;
  text-align: center;
}
:deep(.change-diagnosis-toggle .p-selectbutton),
:deep(.change-management-toggle .p-selectbutton) {
  margin-top: .25rem;
  justify-content: center;
  width: 100%;
  max-width: 320px;
}
:deep(.change-diagnosis-toggle .p-selectbutton .p-button),
:deep(.change-management-toggle .p-selectbutton .p-button),
:deep(.ai-impact .p-selectbutton .p-button) {
  text-align: center;
  justify-content: center;
}

/* Reuse the original autocomplete input visual style */
.da-input {
  width: 100%;
  padding: .5rem .65rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: .95rem;
  background: var(--bg-surface-card);
  color: var(--text-color);
  transition: background .15s, color .15s, border-color .15s;
}
.da-input::placeholder { color: var(--text-color-muted); opacity: .75; }
.da-input:focus { outline: 2px solid var(--accent-primary); outline-offset: 1px; border-color: var(--accent-primary); }
</style>
