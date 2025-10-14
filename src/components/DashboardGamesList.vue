<template>
  <Card class="mb-4 blocks-wrapper">
    <template #title>
      <div class="flex flex-column align-items-center gap-3 w-full">
        <span class="title-line games-intro">
          <span class="line">{{ $t('dashboard.introLine1') }}</span>
          <span class="line">{{ $t('dashboard.introLine2') }}</span>
        </span>
        <div class="start-btn-container">
          <Button
            v-if="!allExhausted"
            :label="startButtonLabel"
            :icon="startButtonIcon"
            class="p-button-rounded big-start-btn cta-start-btn"
            :loading="startButtonLoading"
            :disabled="startButtonDisabled"
            @click="onAdvance"
          />
          <Tag v-else severity="success" :value="$t('dashboard.allDone')" />
        </div>
      </div>
    </template>
    <template #content>
      <div v-if="!isNewUser && !games.length && !incompleteBlockExists && !advancing && !allExhausted" class="text-600 text-sm text-center py-3">{{ $t('dashboard.noGamesYet') }}</div>
      <div v-if="!isNewUser" class="blocks-list flex flex-column gap-3">
  <div v-for="g in gamesSorted" :key="g.block_index" class="block-row u-surface-overlay u-card-pad border-round u-elev-1">
          <div class="row-head flex justify-content-between align-items-center">
            <div class="flex align-items-center gap-2">
              <span class="font-medium">{{ $t('dashboard.gameN', { n: g.block_index + 1 }) }}</span>
            </div>
            <div class="flex align-items-center gap-2">
              <Button :label="$t('dashboard.details')" text size="small" icon="pi pi-list" @click="toggleDetails(g.block_index)" />
              <Button text size="small" :label="$t('dashboard.openReport')" icon="pi pi-chart-line" @click="viewReport(g.block_index)" />
            </div>
          </div>
            <div class="summary mt-2">
              <div v-if="g.top1_accuracy_pre == null && g.top1_accuracy_post == null" class="text-xs text-500">
                <template v-if="assignmentsByBlock[g.block_index] && assignmentsByBlock[g.block_index].some(a=>!a.completed_post_at)">
                  {{ $t('dashboard.inProgress') }}
                </template>
                <template v-else>
                  {{ $t('common.complete') }}
                </template>
              </div>
              <div v-else class="text-xs text-500">{{ $t('dashboard.reportReady') }}</div>
              <!-- Removed per-game progress bar for a cleaner, more compact card -->
            </div>
          <transition name="fade">
            <div v-if="expandedBlock === g.block_index" class="details mt-3 border-top-1 surface-border pt-2">
              <div class="flex flex-column gap-2">
                <div v-if="reportState[g.block_index]?.loading" class="text-xs text-500">{{ $t('dashboard.loadingReport') }}</div>
                <div v-else-if="reportState[g.block_index]?.data" class="report-cases text-sm">
                  <div class="font-medium mb-2 flex justify-content-between">
                    <span>{{ $t('report.gameReport') }}</span>
                    <span class="text-xs text-500">{{ $t('report.casesCount', { n: reportState[g.block_index].data.total_cases }) }}</span>
                  </div>
                  <GameReportCaseTable :cases="reportState[g.block_index].data.cases" :termMap="termMap" />
                </div>
                <div v-else class="text-xs text-500">{{ $t('dashboard.reportNotReadyYet') }}</div>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useGamesStore } from '../stores/gamesStore';
import { useToast } from 'primevue/usetoast';
import { getGame, canViewReport, type CanViewReportResponse } from '../api/games';
import { listAssignmentAssessments, listBlockAssessments } from '../api/assessments';
import { fetchDiagnosisTerms } from '../api/diagnosisTerms';
import GameReportCaseTable from './GameReportCaseTable.vue';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '../stores/userStore';

const props = defineProps<{ isNewUser?: boolean; startDemoLoading?: boolean }>();
const emit = defineEmits<{ (e: 'start-demo'): void }>();

const gamesStore = useGamesStore();
const toast = useToast();
const router = useRouter();
const { t } = useI18n();
const userStore = useUserStore();

const games = computed(()=>gamesStore.games);
// expose assignments map for quick status checks
const assignmentsByBlock = computed(()=> gamesStore.assignmentsByBlock);
// Diagnosis terms cache
const termMap = ref<Record<number,string>>({});
const termsLoaded = ref(false);
async function ensureTerms(){
  if(termsLoaded.value) return;
  try {
    const list = await fetchDiagnosisTerms();
    const map:Record<number,string> = {};
    list.forEach(t=>{ if(t && typeof t.id==='number') map[t.id]=t.name; });
    termMap.value = map; termsLoaded.value = true;
  } catch(e){ /* silent fail; ids will show */ }
}
onMounted(()=>{ ensureTerms(); gamesStore.hydrateActiveGame().catch(()=>{}); });
// Display newest / largest block first (descending order)
const gamesSorted = computed(()=>[...games.value].sort((a,b)=> (b.block_index ?? 0) - (a.block_index ?? 0)));
const advancing = ref(false);
const isNewUser = computed(() => !!props.isNewUser);
// Identify an in-progress (incomplete) block (has assignments & some not finished)
const incompleteBlockIndex = computed(()=>{
  const map:any = gamesStore.assignmentsByBlock || {};
  const keys = Object.keys(map).map(k=>Number(k)).sort((a,b)=>a-b);
  for(const k of keys){
    const list = map[k];
    if(Array.isArray(list) && list.length && list.some(a=>!a.completed_post_at)) return k;
  }
  return null;
});
const incompleteBlockExists = computed(()=> incompleteBlockIndex.value != null);
const nextActionLabel = computed(()=>{
  if(incompleteBlockIndex.value != null) return 'resume';
  return 'start';
});
const nextActionLabelLocalized = computed(()=> t(`dashboard.${nextActionLabel.value}`));
const allExhausted = computed(()=>gamesStore.activeStatus === 'exhausted');
const expandedBlock = ref<number|null>(null);
const startButtonLabel = computed(() => isNewUser.value ? t('dashboard.startDemo') : nextActionLabelLocalized.value);
const startButtonIcon = computed(() => isNewUser.value ? 'pi pi-compass' : 'pi pi-play');
const startButtonLoading = computed(() => isNewUser.value ? !!props.startDemoLoading : advancing.value);
const startButtonDisabled = computed(() => isNewUser.value ? !!props.startDemoLoading : advancing.value);
interface ReportState { loading:boolean; data:any|null; attempts:number; poller?:any }
const reportState = ref<Record<number, ReportState>>({});

// Removed per-game progress Tag display helpers

async function onAdvance(){
  if(isNewUser.value){
    emit('start-demo');
    return;
  }
  if(advancing.value) return; advancing.value = true;
  try {
    const r = await gamesStore.advanceToNext();
    if(r.status === 'exhausted') {
      toast.add({ severity:'success', summary: t('dashboard.completedToastTitle'), detail: t('dashboard.completedToastDetail'), life:5000 });
      return;
    }
    if(r.assignment){
      router.push(`/case/${r.assignment.case_id}`);
      // Expand block and ensure assignments loaded
      if(r.block_index!=null){
        expandedBlock.value = r.block_index;
        gamesStore.ensureAssignmentsLoaded(r.block_index);
        gamesStore.startSummaryPolling(r.block_index);
      }
    }
  } catch(e:any){
    toast.add({ severity:'error', summary: t('common.error'), detail: e.message || t('dashboard.failedAdvance'), life:4000 });
  } finally { advancing.value = false; }
}

function clearPoller(block:number){
  const st = reportState.value[block];
  if(st?.poller){ clearInterval(st.poller); delete st.poller; }
}

async function loadReport(block:number){
  const existing = reportState.value[block];
  if(existing?.loading || existing?.data) return;
  reportState.value[block] = { loading:true, data:null, attempts: (existing?.attempts||0) };
  try {
    // Avoid 404 churn: check availability before fetching
    try {
      const can: CanViewReportResponse = await canViewReport(block);
      const ok = !!(can?.available ?? can?.ready);
      if (!ok) {
        // If block is incomplete, mark not ready and return (poller may continue)
        reportState.value[block] = { loading:false, data:null, attempts: existing?.attempts||0 };
        return;
      }
    } catch(_) { /* on can_view error, fall through to getGame attempt */ }
  const data:any = await getGame(block);
  // Try to load assignments to improve mapping case_id<->assignment_id
  try { gamesStore.ensureAssignmentsLoaded(block); } catch(_) { /* best effort */ }
  // try to hydrate missing user inputs from assessments
  await fillInputsFromAssessments(data, block);
  reportState.value[block] = { loading:false, data, attempts: existing?.attempts||0 };
    clearPoller(block);
  } catch(e:any){
    // Assume 404 => not ready yet
    const attempts = (existing?.attempts||0)+1;
    reportState.value[block] = { loading:false, data:null, attempts };
    if(attempts === 1){
      // start a lightweight poll every 5s until success or 20 attempts
      const poller = setInterval(()=>{
        const st = reportState.value[block];
        if(!st || st.data || st.loading || st.attempts>20){ clearPoller(block); return; }
        loadReport(block);
      },5000);
      reportState.value[block].poller = poller;
    }
  }
}

function toggleDetails(block:number){
  if(expandedBlock.value === block){ expandedBlock.value = null; clearPoller(block); return; }
  expandedBlock.value = block;
  loadReport(block);
}


// (Removed duplicate toggleDetails override; merged report case loading into primary function)

function viewReport(block:number){ router.push(`/game/report/${block}`); }

// No summary polling needed; report fetched on demand.

onUnmounted(()=>{
  // Clear any active pollers on component teardown
  Object.keys(reportState.value).forEach(k=>{
    const st = reportState.value[Number(k)];
    if(st?.poller){ clearInterval(st.poller); delete st.poller; }
  });
});

// helper to populate pre/post input fields from assessments per assignment if report lacks them
async function fillInputsFromAssessments(report:any, block:number){
  if(!report || !Array.isArray(report.cases)) return;
  for(const c of report.cases){
    const caseAny:any = c;
    const hasPre = !!(caseAny.pre_top1_raw_text || caseAny.pre_top1_diagnosis_term_id);
    const hasPost = !!(caseAny.post_top1_raw_text || caseAny.post_top1_diagnosis_term_id);
    if(hasPre && hasPost) continue;
    const ids:number[] = [];
    ['assignment_id','pre_assignment_id','post_assignment_id'].forEach((k)=>{ if(typeof caseAny[k]==='number') ids.push(caseAny[k]); });
    // If missing, derive assignment id by matching case_id from store assignments
    if(!ids.length){
      const storeAssignments:any[] = gamesStore.getBlockAssignments(block) as any[];
      const match = storeAssignments?.find(a=>a.case_id === caseAny.case_id);
      if(match && typeof match.id === 'number') ids.push(match.id);
    }
    if(!ids.length) continue;
    try {
      const assessments = await listAssignmentAssessments(ids[0]);
      const pre = assessments.find(a=>a.phase==='PRE');
      const post = assessments.find(a=>a.phase==='POST');
      const pickTop1Text = (a:any)=> Array.isArray(a?.diagnosis_entries) ? [...a.diagnosis_entries].sort((x:any,y:any)=>(x.rank||99)-(y.rank||99))[0]?.raw_text || null : null;
      const pickTop1Id = (a:any)=> Array.isArray(a?.diagnosis_entries) ? [...a.diagnosis_entries].sort((x:any,y:any)=>(x.rank||99)-(y.rank||99))[0]?.diagnosis_term_id ?? null : null;
      if(pre && !hasPre){ caseAny.pre_top1_raw_text = pickTop1Text(pre) || undefined; caseAny.pre_top1_diagnosis_term_id = pickTop1Id(pre) || undefined; }
      if(post && !hasPost){ caseAny.post_top1_raw_text = pickTop1Text(post) || undefined; caseAny.post_top1_diagnosis_term_id = pickTop1Id(post) || undefined; }
    } catch(_) { /* ignore */ }
  }
  // Fallback: fetch all assessments for user+block and join by case_id via assignment mapping
  try {
    const missing = (report.cases as any[]).filter(c=>!(c.pre_top1_raw_text || c.pre_top1_diagnosis_term_id) || !(c.post_top1_raw_text || c.post_top1_diagnosis_term_id));
    const uid = userStore.user?.id;
    if(missing.length && typeof uid === 'number'){
      const all = await listBlockAssessments(uid, block);
      const assignmentToCase: Record<number, number> = {};
      for(const c of report.cases){
        const ids:number[] = [];
        ['assignment_id','pre_assignment_id','post_assignment_id'].forEach(k=>{ if(typeof (c as any)[k] === 'number') ids.push((c as any)[k]); });
        ids.forEach(id=>{ assignmentToCase[id] = (c as any).case_id; });
      }
      // Add mapping from store assignments for this block as well
      const storeAssignments:any[] = gamesStore.getBlockAssignments(block) as any[];
      if(Array.isArray(storeAssignments)){
        for(const a of storeAssignments){ if(typeof a?.id==='number' && typeof a?.case_id==='number') assignmentToCase[a.id] = a.case_id; }
      }
      const byCase: Record<string, { pre?: any; post?: any }> = {};
      const pickTop1Text = (a:any)=> Array.isArray(a?.diagnosis_entries) ? [...a.diagnosis_entries].sort((x:any,y:any)=>(x.rank||99)-(y.rank||99))[0]?.raw_text || null : null;
      const pickTop1Id = (a:any)=> Array.isArray(a?.diagnosis_entries) ? [...a.diagnosis_entries].sort((x:any,y:any)=>(x.rank||99)-(y.rank||99))[0]?.diagnosis_term_id ?? null : null;
      for(const a of all){
        const cid = assignmentToCase[a.assignment_id];
        if(!cid) continue;
        const bucket = (byCase[cid] ||= {} as any);
        if(a.phase==='PRE') bucket.pre = a; else if(a.phase==='POST') bucket.post = a;
      }
      // Fallback: positional zipping by assignment id order if no mapping resolved
      if(Object.keys(byCase).length === 0 && all.length){
        const groups: Record<number, { pre?: any; post?: any }> = {};
        for(const a of all){
          const g = (groups[a.assignment_id] ||= {} as any);
          if(a.phase==='PRE') g.pre = a; else if(a.phase==='POST') g.post = a;
        }
        const groupArr = Object.keys(groups).map(k=>({ key: Number(k), ...groups[Number(k)] }))
          .sort((a,b)=>a.key-b.key);
        const pickTop1Text = (a:any)=> Array.isArray(a?.diagnosis_entries) ? [...a.diagnosis_entries].sort((x:any,y:any)=>(x.rank||99)-(y.rank||99))[0]?.raw_text || null : null;
        const pickTop1Id = (a:any)=> Array.isArray(a?.diagnosis_entries) ? [...a.diagnosis_entries].sort((x:any,y:any)=>(x.rank||99)-(y.rank||99))[0]?.diagnosis_term_id ?? null : null;
        const n = Math.min(report.cases.length, groupArr.length);
        for(let i=0;i<n;i++){
          const caseAny:any = report.cases[i];
          const g = groupArr[i];
          if(!(caseAny.pre_top1_raw_text || caseAny.pre_top1_diagnosis_term_id) && g.pre){
            caseAny.pre_top1_raw_text = pickTop1Text(g.pre) || undefined;
            caseAny.pre_top1_diagnosis_term_id = pickTop1Id(g.pre) || undefined;
          }
          if(!(caseAny.post_top1_raw_text || caseAny.post_top1_diagnosis_term_id) && g.post){
            caseAny.post_top1_raw_text = pickTop1Text(g.post) || undefined;
            caseAny.post_top1_diagnosis_term_id = pickTop1Id(g.post) || undefined;
          }
        }
      }
      for(const c of report.cases){
        const caseAny:any = c;
        const bucket = byCase[caseAny.case_id];
        if(!bucket) continue;
        if(!(caseAny.pre_top1_raw_text || caseAny.pre_top1_diagnosis_term_id) && bucket.pre){
          caseAny.pre_top1_raw_text = pickTop1Text(bucket.pre) || undefined;
          caseAny.pre_top1_diagnosis_term_id = pickTop1Id(bucket.pre) || undefined;
        }
        if(!(caseAny.post_top1_raw_text || caseAny.post_top1_diagnosis_term_id) && bucket.post){
          caseAny.post_top1_raw_text = pickTop1Text(bucket.post) || undefined;
          caseAny.post_top1_diagnosis_term_id = pickTop1Id(bucket.post) || undefined;
        }
      }
    }
  } catch(_) { /* ignore */ }
}
</script>

<style scoped>
.h-half { height: .5rem; }
.blocks-wrapper { width:100%; }
.start-btn-container { display:flex; justify-content:center; width:100%; }
.big-start-btn { padding:1rem 2.75rem; font-size:1.15rem; font-weight:600; }
.title-line { font-size:1.25rem; font-weight:600; }
.games-intro { display:flex; flex-direction:column; gap:.35rem; max-width:860px; text-align:center; line-height:1.35; font-weight:500; font-size:1.05rem; color:var(--text-color); }
.games-intro .line { display:block; }
.start-btn-container { margin-top:.75rem; margin-bottom:1.75rem; }
.cta-start-btn {
  background: linear-gradient(90deg, var(--accent-cta-start, var(--accent-primary)), var(--accent-cta-end, var(--accent-alt)));
  box-shadow: 0 4px 8px -2px rgba(0,0,0,.4), 0 2px 4px -1px rgba(0,0,0,.3);
  transition: transform var(--motion-base, .18s) var(--easing-standard, ease), box-shadow var(--motion-base, .18s) var(--easing-standard, ease), filter var(--motion-base, .18s) var(--easing-standard, ease);
  letter-spacing:.5px;
  color: var(--color-white, #fff);
}
.cta-start-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow:0 8px 18px -4px rgba(0,0,0,.55), 0 4px 8px -2px rgba(0,0,0,.4); filter:brightness(1.05); }
.cta-start-btn:active:not(:disabled) { transform: translateY(0); box-shadow:0 4px 10px -2px rgba(0,0,0,.5); }
.cta-start-btn.p-button:disabled { filter:grayscale(.4); opacity:.7; }
.blocks-list .block-row { position:relative; }
.metrics { width:100%; }
.acc-group { min-width: 220px; background: var(--surface-overlay); padding:.5rem .75rem; border:1px solid var(--surface-border); border-radius:4px; }
.group-title { font-size:.7rem; text-transform:uppercase; letter-spacing:.05em; color: var(--text-color-secondary); margin-bottom:.25rem; font-weight:600; }
.stat-row span:last-child { font-variant-numeric: tabular-nums; }
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity:0; }
.report-cases { font-size:.75rem; }
.report-cases li { line-height:1.2; }


/* Dark overrides removed: token system supplies correct surfaces & text */
</style>
