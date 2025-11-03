<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useUserStore } from '../stores/userStore';
import { useCaseStore } from '../stores/caseStore';
import { useGamesStore } from '../stores/gamesStore';
import { useGameStore } from '../stores/gameStore';
import { enableBlockFeedback } from '../featureFlags';
import BlockFeedbackPanel from '../components/BlockFeedbackPanel.vue';
import apiClient from '../api';
import type { MenuItem } from 'primevue/menuitem';

// Import new components
import CaseProgressSteps from '../components/CaseProgressSteps.vue';
import CaseImageViewer from '../components/CaseImageViewer.vue';
import AIPredictionsTable from '../components/AIPredictionsTable.vue';
import AssessmentForm from '../components/AssessmentForm.vue';
import ProgressBar from 'primevue/progressbar';
import Message from 'primevue/message';

import Toast from 'primevue/toast'; // Keep Toast here for page-level messages
import { useI18n } from 'vue-i18n';
import type { AssessmentCreatePayload, DiagnosisEntryCreate } from '../types/domain';
import type { InvestigationPlan, NextStepAction } from '../utils/assessmentEnums';
import { normalizeInvestigationPlan, normalizeNextStepAction } from '../utils/assessmentEnums';

// --- Interfaces (Keep necessary interfaces here or move to a central types file) ---
interface ImageRead {
  id: number;
  image_url: string; // relative
  full_url?: string; // absolute provided by API
  case_id: number;
}



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

type AssessmentCreate = AssessmentCreatePayload;

// New extended response metadata returned by backend after submitting an assessment
interface AssessmentSubmitResponse {
  block_index: number | null;
  block_complete: boolean;
  report_available: boolean;
  remaining_in_block: number; // unfinished POST assessments after this submission
  // Allow any additional fields (original assessment) without strict typing
  [key: string]: any;
}

// Legacy Diagnosis/Management interfaces removed (free-text capture pending backend support)

interface Case {
  id: number;
  ground_truth_diagnosis_id: number | null;
  typical_diagnosis: boolean;
  created_at: string | null;
  ground_truth_diagnosis: DiagnosisTermRead | null;
  images: ImageRead[];
  ai_outputs: AIOutputRead[];
}

// --- Component Setup ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const userStore = useUserStore();
const caseStore = useCaseStore();
const gameStore = useGameStore();
const gamesStore = useGamesStore();
const { t } = useI18n();

const caseId = computed(() => parseInt(route.params.id as string, 10));
const userId = computed(() => userStore.user?.id);
const submitted = ref(false);

const isDemoMode = computed(() => route.query.demo === '1');
const demoPhase = ref<'pre' | 'post'>('pre');

// --- State ---
const images = ref<ImageRead[]>([]);
// Free-text mode: terms list no longer required
// const diagnosisTerms = ref<DiagnosisTermRead[]>([]);
const aiOutputs = ref<AIOutputRead[]>([]);
const loading = ref(false);
const submitting = ref(false);
// Track if this case was last remaining when entered
const wasFinalInBlock = ref(false);
// Track selected diagnosis term objects (from autocomplete select events)
// Free-text mode: no selected canonical items

function buildDiagnosisEntries(phase: 'PRE' | 'POST'): DiagnosisEntryCreate[] {
  const src = phase === 'PRE' ? preAiFormData : postAiFormData;
  const raw = [
    { rank: 1, text: src.diagnosisRank1Text },
    { rank: 2, text: src.diagnosisRank2Text },
    { rank: 3, text: src.diagnosisRank3Text }
  ].filter(e => e.text && e.text.trim().length);
  const mapped = raw.map(e => ({ rank: e.rank as 1 | 2 | 3, raw_text: e.text!.trim() }));
  console.debug('buildDiagnosisEntries (free-text)', mapped);
  return mapped as DiagnosisEntryCreate[];
}

// --- Phase Detection ---
// Phase logic:
//  activeStep 0: Pre-AI (no pre assessment yet)
//  activeStep 1: Post-AI phase (preCompleted true, post not yet) -> show post form
//  activeStep 2: Complete (postCompleted true) -> treat as post phase for display/completion
const isPostAiPhase = computed(() => {
  if (isDemoMode.value) {
    return demoPhase.value !== 'pre';
  }
  const progress = caseStore.caseProgress[caseId.value];
  if (!progress) return false;
  if (progress.postCompleted) return true;
  if (progress.preCompleted && !progress.postCompleted) return true;
  return false;
});

// --- Steps for Progress Indicator ---
const items = computed<MenuItem[]>(() => [
  { label: 'Pre-AI Assessment', command: () => console.log('Pre-AI step clicked (current phase: ' + (isPostAiPhase.value ? 'post' : 'pre') + ')')},
  { label: 'Post-AI Assessment', command: () => console.log('Post-AI step clicked (current phase: ' + (isPostAiPhase.value ? 'post' : 'pre') + ')') },
  { label: 'Complete', command: () => console.log('Complete step clicked') }
]);

const activeStep = computed(() => {
  if (isDemoMode.value) {
    return demoPhase.value === 'pre' ? 0 : 1;
  }
  const progress = caseStore.caseProgress[caseId.value];
  if (progress?.postCompleted) return 2; // Complete
  if (progress?.preCompleted) return 1;  // Post-AI phase
  return 0;                               // Pre-AI
});

// --- Game (Block) Progress Bar ---
// Determine current block index for this case by scanning assignments
const currentBlockIndex = computed(() => {
  for (const [blockStr, list] of Object.entries(gamesStore.assignmentsByBlock || {})) {
    const block = Number(blockStr);
    if (list.some(a => a.case_id === caseId.value)) return block;
  }
  return null;
});

const blockProgress = computed(() => {
  if (currentBlockIndex.value == null) return null;
  return gamesStore.blockProgress(currentBlockIndex.value);
});

// Ensure we have the full assignment list for this block; hydrateActiveGame can seed only the current assignment,
// which makes total=1 and shows 50% after first PRE submission. Force-load the block once we know its index.
watch(currentBlockIndex, async (block) => {
  if (block != null) {
    try {
  await gamesStore.loadAssignments(block, { force: true, verbose: false });
    } catch (_) { /* non-fatal */ }
  }
}, { immediate: false });

// Percent with partial credit for Pre-AI: each pre-only case counts as 0.5, post counts as 1
// Use block-provided total so UI reflects backend block size dynamically
const gameProgressPercent = computed(() => {
  const prog = blockProgress.value;
  if (!prog) return 0;
  const { pre = 0, post = 0, total = 0 } = prog as any;
  const denominator = total || Math.max(pre, post, 1);
  const preOnly = Math.max(0, pre - post);
  const weighted = Math.min(denominator, post + preOnly * 0.5);
  return Math.round((weighted / denominator) * 100);
});

// Label for inside bar: show completed and in-progress counts
const gameProgressBarLabel = computed(() => {
  const prog = blockProgress.value;
  if (!prog) return '';
  const { pre = 0, post = 0, total = 0 } = prog as any;
  const denominator = total || Math.max(pre, post, 0);
  if (!denominator) return '';
  const preOnly = Math.max(0, pre - post);
  return preOnly > 0
    ? `${post}/${denominator} 已完成 • ${preOnly} 个仅完成 Pre-AI`
    : `${post}/${denominator} 已完成`;
});


// --- Form Data ---
const preAiFormData = reactive({
  diagnosisRank1Text: null as string | null,
  diagnosisRank2Text: null as string | null,
  diagnosisRank3Text: null as string | null,
  confidenceScore: 3,
  certaintyScore: 3,
  investigationPlan: null as InvestigationPlan | null,
  nextStep: null as NextStepAction | null,
});

const postAiFormData = reactive({
  diagnosisRank1Text: null as string | null,
  diagnosisRank2Text: null as string | null,
  diagnosisRank3Text: null as string | null,
  confidenceScore: 3,
  certaintyScore: 3,
  changeDiagnosis: null as boolean | null,
  changeManagement: null as boolean | null,
  aiUsefulness: null as string | null,
  investigationPlan: null as InvestigationPlan | null,
  nextStep: null as NextStepAction | null,
});

const currentFormData = computed(() => isPostAiPhase.value ? postAiFormData : preAiFormData);

const preAiLocalStorageKey = computed(() => `preAiFormData_${caseId.value}_${userId.value}`);
const postAiLocalStorageKey = computed(() => `postAiFormData_${caseId.value}_${userId.value}`);

// --- AI Usefulness Options ---
// Labels localized to Chinese per request
const aiUsefulnessOptions = ref([
  { label: '非常有用', value: 'very' },
  { label: '较有用', value: 'somewhat' },
  { label: '没什么用', value: 'not' },
]);

const changeOptions = ref([
  { label: '是', value: true },
  { label: '否', value: false },
]);

// Display highest confidence first (5 → 1)
const scoreOptions = ref([
  { label: '5', value: 5 },
  { label: '4', value: 4 },
  { label: '3', value: 3 },
  { label: '2', value: 2 },
  { label: '1', value: 1 }
]);

// --- Data Fetching ---
const fetchData = async () => {
  if (!caseId.value || !userId.value) return; // Ensure userId is also available
  loading.value = true;
  aiOutputs.value = [];

  console.log(`Fetching data for case ${caseId.value}, user ${userId.value}, isPostAiPhase: ${isPostAiPhase.value}`);

  try {
    const commonFetches = [
      apiClient.get<ImageRead[]>(`/api/images/case/${caseId.value}`),
      apiClient.get<Case>(`/api/cases/${caseId.value}`)
    ];

    const [imagesResponse, caseResponse] = await Promise.all(commonFetches);

    images.value = imagesResponse.data as ImageRead[];
    const caseData = caseResponse.data as Case;
    if (!caseData) {
      throw new Error('Failed to load case data');
    }
  // metadata removed
  // diagnosis terms not needed in free-text mode

    if (isPostAiPhase.value) {
      console.log(`Fetching AI outputs for case ${caseId.value}`);
      try {
        const aiResponse = await apiClient.get<AIOutputRead[]>(`/api/ai_outputs/case/${caseId.value}`);
        aiOutputs.value = aiResponse.data.sort((a: AIOutputRead, b: AIOutputRead) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 5);
        console.log(`Loaded ${aiOutputs.value.length} AI outputs.`);
        if (!isDemoMode.value) {
          loadFromLocalStorage(postAiLocalStorageKey.value, postAiFormData);
        }
      } catch (aiError) {
        console.error('Failed to fetch AI outputs:', aiError);
        aiOutputs.value = [];
        if (!isDemoMode.value) {
          loadFromLocalStorage(postAiLocalStorageKey.value, postAiFormData);
        }
      }
    } else {
      aiOutputs.value = [];
      if (!isDemoMode.value) {
        loadFromLocalStorage(preAiLocalStorageKey.value, preAiFormData);
      }
    }
     // Check if current phase form data is empty and if previous phase data exists
    if (isPostAiPhase.value && !Object.values(postAiFormData).some(val => val !== null && val !== '' && val !== 3)) {
        const savedPreAiData = localStorage.getItem(preAiLocalStorageKey.value);
        if (savedPreAiData) {
            try {
                const parsedPreAi = JSON.parse(savedPreAiData);
                postAiFormData.diagnosisRank1Text = parsedPreAi.diagnosisRank1Text;
                postAiFormData.diagnosisRank2Text = parsedPreAi.diagnosisRank2Text;
                postAiFormData.diagnosisRank3Text = parsedPreAi.diagnosisRank3Text;
                postAiFormData.confidenceScore = parsedPreAi.confidenceScore;
                postAiFormData.certaintyScore = parsedPreAi.certaintyScore;
                if (postAiFormData.investigationPlan == null) {
                  postAiFormData.investigationPlan = normalizeInvestigationPlan(parsedPreAi.investigationPlan);
                }
                if (postAiFormData.nextStep == null) {
                  postAiFormData.nextStep = normalizeNextStepAction(parsedPreAi.nextStep);
                }
                 console.log('Copied Pre-AI data to Post-AI form');
            } catch (e) {
                console.error('Failed to parse pre-AI data for copying:', e);
            }
        }
    }


  } catch (error: any) {
    console.error('Failed to fetch case data:', error);
    if (error.response?.status === 404) {
      toast.add({
        severity: 'error',
        summary: '未找到病例',
        detail: '无法找到请求的病例。',
        life: 5000
      });
      router.push('/');
    } else {
      toast.add({
        severity: 'error',
        summary: '错误',
        detail: '加载病例数据失败，请稍后重试。',
        life: 3000
      });
    }
  } finally {
    loading.value = false;
  }
};

// --- Local Storage ---
const saveToLocalStorage = (key: string, data: object) => {
  localStorage.setItem(key, JSON.stringify(data));
};

const loadFromLocalStorage = (key: string, target: object) => {
  const savedData = localStorage.getItem(key);
  if (savedData) {
    try {
      const parsedData = JSON.parse(savedData);
      Object.assign(target, parsedData);
      coerceManagementFields(target as any);
    } catch (e) {
      console.error(`Failed to parse saved form data for key ${key}:`, e);
      localStorage.removeItem(key);
    }
  }
};

function coerceManagementFields(obj: { investigationPlan?: any; nextStep?: any }) {
  if ('investigationPlan' in obj) {
    obj.investigationPlan = normalizeInvestigationPlan(obj.investigationPlan);
  }
  if ('nextStep' in obj) {
    obj.nextStep = normalizeNextStepAction(obj.nextStep);
  }
}

const clearLocalStorage = (key: string) => {
  localStorage.removeItem(key);
};

const resetFormData = () => {
  Object.assign(preAiFormData, {
  diagnosisRank1Text: null, diagnosisRank2Text: null, diagnosisRank3Text: null,
  confidenceScore: 3, certaintyScore: 3, investigationPlan: null, nextStep: null,
  });
  Object.assign(postAiFormData, {
  diagnosisRank1Text: null, diagnosisRank2Text: null, diagnosisRank3Text: null,
  confidenceScore: 3, certaintyScore: 3,
    changeDiagnosis: null, changeManagement: null, aiUsefulness: null,
  investigationPlan: null, nextStep: null,
  });
};

watch(preAiFormData, () => {
  if (isDemoMode.value) return;
  saveToLocalStorage(preAiLocalStorageKey.value, preAiFormData);
}, { deep: true });
watch(postAiFormData, () => {
  if (isDemoMode.value) return;
  saveToLocalStorage(postAiLocalStorageKey.value, postAiFormData);
}, { deep: true });

watch(() => route.params.id, async (newIdStr, oldIdStr) => {
  const newId = newIdStr ? parseInt(newIdStr as string, 10) : null;
  const oldId = oldIdStr ? parseInt(oldIdStr as string, 10) : null;
  console.log(`Route ID changed from ${oldId} to ${newId}`);
  if (newId !== null && newId !== oldId) {
    resetFormData(); // Reset forms for the new case
    // The phase will be determined by caseStore progress, which is re-evaluated by isPostAiPhase
    // Ensure progress loaded for new case before fetching so phase detection is correct
    if (isDemoMode.value) {
      demoPhase.value = 'pre';
    }
    if (!caseStore.cases.length && userId.value) {
      await caseStore.loadCases();
    } else if (userId.value) {
      // Make sure assessments loaded at least once (idempotent)
      await caseStore.loadAssessmentsAndProgress(userId.value);
    }
    await fetchData(); // Fetch data for the new case after ensuring progress
  }
}, { immediate: true });

watch(isDemoMode, (flag) => {
  if (!flag) {
    demoPhase.value = 'pre';
  }
});


watch(isPostAiPhase, async (newPhase, oldPhase) => {
  console.log(`Phase changed from ${oldPhase ? 'Post-AI' : 'Pre-AI'} to ${newPhase ? 'Post-AI' : 'Pre-AI'} for case ${caseId.value}`);
  // Refetch data if the phase changes for the *same* case,
  // e.g., after pre-AI submission, isPostAiPhase becomes true.
  // Avoid refetch if it's part of navigating to a new case (handled by route.params.id watcher)
  if (newPhase !== oldPhase && route.params.id && parseInt(route.params.id as string, 10) === caseId.value) {
      console.log('Phase changed for current case, refetching data...');
      await fetchData();
      // After fetch, ensure management binary choices are carried over if not yet set
      if (newPhase) {
        if (postAiFormData.investigationPlan == null && preAiFormData.investigationPlan != null) {
          postAiFormData.investigationPlan = normalizeInvestigationPlan(preAiFormData.investigationPlan);
        }
        if (postAiFormData.nextStep == null && preAiFormData.nextStep != null) {
          postAiFormData.nextStep = normalizeNextStepAction(preAiFormData.nextStep);
        }
        // Always carry over diagnosis text fields if post-AI fields are still empty
        if (!postAiFormData.diagnosisRank1Text && preAiFormData.diagnosisRank1Text) {
          postAiFormData.diagnosisRank1Text = preAiFormData.diagnosisRank1Text;
        }
        if (!postAiFormData.diagnosisRank2Text && preAiFormData.diagnosisRank2Text) {
          postAiFormData.diagnosisRank2Text = preAiFormData.diagnosisRank2Text;
        }
        if (!postAiFormData.diagnosisRank3Text && preAiFormData.diagnosisRank3Text) {
          postAiFormData.diagnosisRank3Text = preAiFormData.diagnosisRank3Text;
        }
      }
  }
}, { immediate: false }); // `immediate: false` to avoid running on initial load before route watcher

// Auto-set changeManagement when either management choice differs between pre and post
watch([
  () => postAiFormData.investigationPlan,
  () => postAiFormData.nextStep
], ([invPost, stepPost]) => {
  if (!isPostAiPhase.value) return;
  const changed = (preAiFormData.investigationPlan !== invPost) || (preAiFormData.nextStep !== stepPost);
  postAiFormData.changeManagement = changed;
});

// --- Auto-set change flags in Post-AI when user changes diagnosis or management compared to Pre-AI ---
watch(() => postAiFormData.diagnosisRank1Text, (newVal) => {
  if (!isPostAiPhase.value) return;
  const pre = (preAiFormData.diagnosisRank1Text || '').trim().toLowerCase();
  const post = (newVal || '').trim().toLowerCase();
  // Set true when different, false when same/empty match
  postAiFormData.changeDiagnosis = pre !== post;
});

// (legacy biopsy/referral watcher removed; replaced by investigation/nextStep watcher above)

// Ensure cases & assessments are loaded on direct navigation / refresh
onMounted(async () => {
  if (!userId.value) return; // wait for user login if needed
  if (!caseStore.cases.length) {
    await caseStore.loadCases();
  } else {
    // Still ensure assessments loaded (idempotent)
    await caseStore.loadAssessmentsAndProgress(userId.value);
  }
  // Hydrate active game assignments if user refreshed directly on a case page
  await gamesStore.hydrateActiveGame();
  // After hydrating, force-load assignments for the current block so progress totals are accurate
  if (currentBlockIndex.value != null) {
    try { await gamesStore.loadAssignments(currentBlockIndex.value, { force: true, verbose: false }); } catch(_) {}
  }
  // Determine if this case was the final remaining based on activeRemaining (set when navigated via advanceToNext)
  if ((gamesStore as any).activeRemaining === 1) {
    wasFinalInBlock.value = true;
  }
  // Refined fallback: only infer final if we have a fully loaded block (more than 1 assignment) and exactly one incomplete post assessment.
  if (!wasFinalInBlock.value) {
    const assignment = Object.values(gamesStore.assignmentsByBlock || {})
      .flat()
      .find((a: any) => a.case_id === caseId.value && a.user_id === userId.value);
    if (assignment) {
      const blockIdx = assignment.block_index;
      const list = (gamesStore.assignmentsByBlock as any)[blockIdx] || [];
      if (list.length > 1) {
        const remainingInBlock = list.filter((a: any) => !a.completed_post_at).length; // post not finished
        if (remainingInBlock === 1) wasFinalInBlock.value = true;
      }
    }
  }
  // After loading, if URL explicitly has phase=post and preCompleted true, re-run fetch to include AI outputs
  if (route.query.phase === 'post' && isPostAiPhase.value) {
    await fetchData();
  }
});

// --- Submission Logic ---
const handleSubmit = async () => {
  if (isPostAiPhase.value) {
    await handlePostAiSubmit();
  } else {
    await handlePreAiSubmit();
  }
};

const handlePreAiSubmit = async () => {
  if (submitting.value) return; // prevent double submit
  submitted.value = true;
  if (!userId.value || !caseId.value) {
    toast.add({ severity: 'warn', summary: '缺少信息', detail: '未找到用户或病例 ID。', life: 3000 });
    return;
  }
  if (!preAiFormData.diagnosisRank1Text) {
    toast.add({ severity: 'warn', summary: '验证错误', detail: '请至少填写一个主要诊断（Rank 1 必填）。', life: 3000 });
    return;
  }
  if (!preAiFormData.investigationPlan || !preAiFormData.nextStep) {
    toast.add({ severity: 'warn', summary: '验证错误', detail: '请选择「检查计划」与「下一步」。', life: 3000 });
    return;
  }
  // management strategy removed

  if (isDemoMode.value) {
    submitting.value = true;
    try {
      submitted.value = false;
      demoPhase.value = 'post';
      toast.add({ severity: 'success', summary: t('case.demoPreSuccessTitle'), detail: t('case.demoPreSuccessDetail'), life: 2500 });
    } finally {
      submitting.value = false;
    }
    return;
  }

  submitting.value = true;
  try {
    // Find assignment for this user+case in any loaded block
    const assignment = Object.values(gamesStore.assignmentsByBlock || {})
      .flat()
      .find((a: any) => a.case_id === caseId.value && a.user_id === userId.value);
    if (!assignment) {
      throw new Error('No assignment found for this case. Start or hydrate the game block first.');
    }
    // Build diagnosis debug info (not yet sent to backend)
    const diagnosisEntries = buildDiagnosisEntries('PRE');
    const primary = diagnosisEntries.find(e => e.rank === 1);
    if (!primary) {
      toast.add({ severity: 'warn', summary: '验证错误', detail: '主要诊断为必填项。', life: 4000 });
      submitting.value = false;
      return;
    }
    const normalizedInvestigation = normalizeInvestigationPlan(preAiFormData.investigationPlan);
    const normalizedNextStep = normalizeNextStepAction(preAiFormData.nextStep);
    const assessmentPayload: AssessmentCreate = {
      assignment_id: assignment.id,
      phase: 'PRE',
      diagnostic_confidence: preAiFormData.confidenceScore,
      management_confidence: preAiFormData.certaintyScore,
      investigation_action: normalizedInvestigation,
      next_step_action: normalizedNextStep,
      diagnosis_entries: diagnosisEntries,
    };
    console.debug('Submitting PRE assessment payload', assessmentPayload);
  // Explicit JSON log for inspection
  try { console.log('[ASSESSMENT_SUBMIT_PRE] /api/assessment/ body=' + JSON.stringify(assessmentPayload, null, 2)); } catch(_) {}
    const { data } = await apiClient.post<AssessmentSubmitResponse>('/api/assessment/', assessmentPayload);
    console.debug('PRE submit response meta', {
      block_index: data?.block_index,
      block_complete: data?.block_complete,
      report_available: data?.report_available,
      remaining_in_block: data?.remaining_in_block
    });

  // Free-text only: backend should store raw_text; term IDs omitted

  // Mark assignment pre completion locally for dashboard progress
  (assignment as any).completed_pre_at = new Date().toISOString();

  await caseStore.markProgress(caseId.value, false); // Mark pre-AI as complete
    // clearLocalStorage(preAiLocalStorageKey.value); // Keep pre-AI data for potential copy to post-AI
    submitted.value = false;
    toast.add({ severity: 'success', summary: '成功', detail: 'Pre-AI 评估已保存，正在进入 AI 建议阶段。', life: 2000 });
    // isPostAiPhase will become true, triggering the watcher to refetch data including AI outputs.
  } catch (error: any) {
    console.error('Failed to submit pre-AI assessment:', error);
    handleApiError(error, 'Pre-AI 提交出错');
  } finally {
    submitting.value = false;
  }
};

const handlePostAiSubmit = async () => {
  if (submitting.value) return; // prevent double submit
  submitted.value = true;
  if (!userId.value || !caseId.value) {
    toast.add({ severity: 'warn', summary: '缺少信息', detail: '未找到用户或病例 ID。', life: 3000 });
    return;
  }
  if (!postAiFormData.diagnosisRank1Text) {
  toast.add({ severity: 'warn', summary: '验证错误', detail: '主要诊断为必填项。', life: 3000 });
    return;
  }
  // Validate required POST fields individually to provide accurate feedback
  const missing: string[] = [];
  if (postAiFormData.changeDiagnosis === null) missing.push('AI 建议是否改变了你的主要诊断？');
  if (postAiFormData.changeManagement === null) missing.push('AI 建议是否改变了你的管理方案？');
  if (postAiFormData.aiUsefulness === null) missing.push('AI 建议对你有多大帮助？');
  if (missing.length) {
    const detail = missing.length === 1 ? missing[0] : `请完成：${missing.join('；')}`;
    toast.add({ severity: 'warn', summary: '验证错误', detail, life: 4000 });
    return;
  }
  if (!postAiFormData.investigationPlan || !postAiFormData.nextStep) {
    toast.add({ severity: 'warn', summary: '验证错误', detail: '请选择「检查计划」与「下一步」。', life: 3000 });
    return;
  }

  if (isDemoMode.value) {
    submitting.value = true;
    try {
      toast.add({ severity: 'success', summary: t('case.demoPostSuccessTitle'), detail: t('case.demoPostSuccessDetail'), life: 3000 });
      submitted.value = false;
      resetFormData();
      demoPhase.value = 'pre';
      await router.push('/demo-complete');
    } catch (error: any) {
      console.error('Failed to complete demo post-AI assessment:', error);
    } finally {
      submitting.value = false;
    }
    return;
  }

  submitting.value = true;
  try {
    const assignment = Object.values(gamesStore.assignmentsByBlock || {})
      .flat()
      .find((a: any) => a.case_id === caseId.value && a.user_id === userId.value);
    if (!assignment) {
      throw new Error('No assignment found for this case. Start or hydrate the game block first.');
    }
    const diagnosisEntries = buildDiagnosisEntries('POST');
    const primary = diagnosisEntries.find(e => e.rank === 1);
    if (!primary) {
      toast.add({ severity: 'warn', summary: '验证错误', detail: '主要诊断为必填项。', life: 4000 });
      submitting.value = false;
      return;
    }
    const normalizedInvestigation = normalizeInvestigationPlan(postAiFormData.investigationPlan);
    const normalizedNextStep = normalizeNextStepAction(postAiFormData.nextStep);
    const assessmentPayload: AssessmentCreate = {
      assignment_id: assignment.id,
      phase: 'POST',
      diagnostic_confidence: postAiFormData.confidenceScore,
      management_confidence: postAiFormData.certaintyScore,
      changed_primary_diagnosis: postAiFormData.changeDiagnosis,
      changed_management_plan: postAiFormData.changeManagement,
      ai_usefulness: postAiFormData.aiUsefulness,
      investigation_action: normalizedInvestigation,
      next_step_action: normalizedNextStep,
      diagnosis_entries: diagnosisEntries,
    };
    console.debug('Submitting POST assessment payload', assessmentPayload);
  try { console.log('[ASSESSMENT_SUBMIT_POST] /api/assessment/ body=' + JSON.stringify(assessmentPayload, null, 2)); } catch(_) {}
    const { data } = await apiClient.post<AssessmentSubmitResponse>('/api/assessment/', assessmentPayload);
    console.debug('POST submit response meta', {
      block_index: data?.block_index,
      block_complete: data?.block_complete,
      report_available: data?.report_available,
      remaining_in_block: data?.remaining_in_block
    });

  // Free-text only: backend should store raw_text; term IDs omitted

  // Mark assignment post completion locally so dashboard reflects completion
  (assignment as any).completed_post_at = new Date().toISOString();

    await caseStore.markProgress(caseId.value, true); // Mark post-AI as complete
    clearLocalStorage(preAiLocalStorageKey.value); // Clear pre-AI after successful post-AI
    clearLocalStorage(postAiLocalStorageKey.value);
    resetFormData();
    submitted.value = false;

    // Navigation logic now driven by backend flags
    try {
      if (data?.block_complete && data?.block_index != null) {
        console.debug('Backend indicates block complete; redirecting to trust feedback', {
          block_index: data.block_index,
          report_available: data.report_available
        });
        gamesStore.startSummaryPolling(data.block_index);
        router.push({ path: `/game/trust/${data.block_index}` });
        return; // stop further advancement calls
      }
      // Not complete yet -> request next assignment via unified flow
      const resp = await gamesStore.advanceToNext();
      if (resp.status === 'exhausted') {
        toast.add({ severity: 'success', summary: '所有病例已完成', detail: '你已完成所有可用病例。', life: 5000 });
        router.push('/');
      } else if (resp.assignment) {
        router.push({ path: `/case/${resp.assignment.case_id}` });
      }
    } catch (e) {
      console.error('Post-submit navigation error', e);
      navigateToNextCase();
    }
  } catch (error: any) {
    console.error('Failed to submit post-AI assessment:', error);
    handleApiError(error, 'Post-AI 提交出错');
  } finally {
    submitting.value = false;
  }
};

function handleApiError(error: any, summary: string) {
  let detail = '发生未知错误，请稍后重试。';
  if (error.response?.data?.detail) {
    if (typeof error.response.data.detail === 'string') {
      detail = error.response.data.detail;
    } else if (Array.isArray(error.response.data.detail)) {
      detail = error.response.data.detail.map((err: any) => `${err.loc?.join('.')} - ${err.msg}`).join('; ');
    } else if (typeof error.response.data.detail === 'object') {
      detail = JSON.stringify(error.response.data.detail);
    }
  } else if (error.message) {
    detail = error.message;
  }
  toast.add({ severity: 'error', summary: summary, detail: detail, life: 5000 });
}

// --- Computed Functions for Labels (passed to AssessmentForm) ---
const getConfidenceLabel = (score: number) => {
  switch (score) {
    case 1: return '信心很低'; case 2: return '信心较低';
    case 3: return '信心一般'; case 4: return '信心较高';
    case 5: return '信心很高'; default: return '选择诊断信心';
  }
};

const getCertaintyLabel = (score: number) => {
  switch (score) {
    case 1: return '把握很低'; case 2: return '把握较低';
    case 3: return '把握一般'; case 4: return '把握较高';
    case 5: return '把握很高'; default: return '选择把握程度';
  }
};

function navigateToNextCase() {
  const nextCase = caseStore.getNextIncompleteCase();
  if (nextCase) {
    router.push({ path: `/case/${nextCase.id}` });
  } else {
    toast.add({ severity: 'success', summary: '所有病例已完成', detail: '你已完成所有可用病例。', life: 4000 });
    router.push('/');
  }
}

function handleBlockContinue() {
  gameStore.closeFeedback();
  navigateToNextCase();
}

// ^ CasePage logic end helpers

</script>

<template>
  <div class="u-page u-page-wide case-container u-surface-ground border-round case-page-green">
    <Toast />
    <BlockFeedbackPanel
      v-if="enableBlockFeedback && !isDemoMode"
      :visible="gameStore.blockFeedbackVisible"
      :stats="gameStore.currentBlockFeedback"
      :loading="gameStore.loadingFeedback"
      @continue="handleBlockContinue"
    />
    <CaseProgressSteps :items="items" :activeStep="activeStep" />
    <Message v-if="isDemoMode" severity="info" class="demo-banner mb-3">
      {{ $t('case.demoBanner') }}
    </Message>

    <div class="grid">
      <!-- Left Column -->
      <div class="col-12 lg:col-5">
  <!-- Game Progress Bar (moved above image card) -->
  <div v-if="blockProgress && blockProgress.total" class="mb-3">
    <ProgressBar :value="gameProgressPercent" :showValue="false" class="game-progress-bar">
      <span class="gp-label">{{ gameProgressBarLabel }}</span>
    </ProgressBar>
  </div>
  <!-- Post-AI caution reminder -->
  <div v-if="isPostAiPhase" class="ai-accuracy-note mb-3">
    <strong class="mr-1">{{ $t('case.aiCautionLabel') }}</strong>
    {{ $t('case.aiAccuracyNote') }}
  </div>
  <AIPredictionsTable :aiOutputs="aiOutputs" :isPostAiPhase="isPostAiPhase" />
  <CaseImageViewer :images="images" :loading="loading" :caseId="caseId" />
  <!-- Metadata display removed -->
      </div>

      <!-- Right Column - Assessment Form -->
      <div class="col-12 lg:col-7">
  <!-- Pre-AI quick guidance -->
  <div v-if="!isPostAiPhase" class="preai-help-note mb-3">
    先完病症评估：填写诊断（第一诊断必填），选择处理方法和对诊断的信心。提交后即可查看 AI 建议。
  </div>
  <!-- Post-AI guidance: prompt to update Rank 1 if changed by AI -->
  <div v-if="isPostAiPhase" class="preai-help-note mb-3">
    如AI建议改变了你的诊断，请更新改变的诊断，并完成其余问题后提交。
  </div>
  <AssessmentForm
          :formData="currentFormData"
    :diagnosisTerms="[]"
          :scoreOptions="scoreOptions"
          :submitted="submitted"
          :submitting="submitting"
          :isPostAiPhase="isPostAiPhase"
          :aiUsefulnessOptions="aiUsefulnessOptions"
          :changeOptions="changeOptions"
          :getConfidenceLabel="getConfidenceLabel"
          :getCertaintyLabel="getCertaintyLabel"
          @submit-form="handleSubmit"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Width now driven by .u-page-wide; keep hook class if future overrides needed */
.case-page-green {
  /* Override accent (purple) tokens with success green for this page only */
  --accent-primary: var(--success-color);
  --accent-primary-alt: var(--success-color);
  --accent-cta-start: var(--success-color);
  --accent-cta-end: var(--success-color);
  --focus-ring: var(--success-color);
  --highlight-bg: var(--highlight-success-bg);
}

/* Force progress bar value to green inside this page (PrimeVue uses .p-progressbar-value) */
.case-page-green :deep(.p-progressbar .p-progressbar-value) {
  background: var(--success-color) !important;
}

/* Tag/info elements also inherit green if they relied on accent */
.case-page-green :deep(.p-tag) {
  background: var(--highlight-success-bg) !important;
  color: var(--success-color) !important;
  border-color: var(--success-color) !important;
}

/* Inline game progress label */
.game-progress-bar { position:relative; }
.game-progress-bar .gp-label { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:.75rem; font-weight:600; letter-spacing:.5px; color:var(--color-white); mix-blend-mode:normal; }
.dark .game-progress-bar .gp-label { color:#fff; }

/* Subtle caution banner for Post-AI phase */
.ai-accuracy-note {
  padding: 0.75rem 0.875rem;
  border-radius: 8px;
  border: 1px solid var(--warning-color, #d97706);
  background: var(--highlight-warning-bg, rgba(245, 158, 11, 0.08));
  color: var(--text-color, #374151);
  font-size: 0.875rem;
  line-height: 1.4;
}
/* Subtle info banner for Pre-AI phase */
.preai-help-note {
  padding: 0.75rem 0.875rem;
  border-radius: 8px;
  border: 1px solid var(--accent-primary, #6366f1);
  background: var(--highlight-bg, rgba(99,102,241,0.08));
  color: var(--text-color, #374151);
  font-size: 0.875rem;
  line-height: 1.4;
}

.demo-banner {
  font-size: 0.9rem;
  line-height: 1.5;
}
</style>
