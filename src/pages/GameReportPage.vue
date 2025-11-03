<template>
  <div class="u-page u-page-standard report-container u-surface-card border-round">
    <Toast />
    <Card v-if="loading" class="mb-4"><template #title>{{ $t('report.loading') }}</template><template #content><ProgressBar mode="indeterminate" style="height:.5rem" /></template></Card>
    <Card v-else-if="!canView">
      <template #title>{{ $t('report.notReady') }}</template>
      <template #content>
  <p class="text-600">{{ $t('report.notReady') }}</p>
        <Button :label="$t('report.retry')" icon="pi pi-refresh" class="mr-2" :loading="checking" @click="checkAvailability" />
        <Button :label="$t('report.back')" icon="pi pi-arrow-left" severity="secondary" @click="goBack" />
      </template>
    </Card>
    <Card v-else class="mb-4">
      <template #title>
        <div class="flex align-items-center gap-2">
          <i class="pi pi-file" /> {{ $t('report.gameReport') }} #{{ blockIndex + 1 }}
        </div>
      </template>
      <template #content>
        <div class="grid">
          <div class="col-12" v-if="report?.cases && report.cases.length">
            <div class="font-medium mb-2 flex justify-content-between">
              <span>{{ $t('report.gameReport') }}</span>
              <span class="text-xs text-500">{{ $t('report.casesCount', { n: report.total_cases }) }}</span>
            </div>
            <GameReportCaseTable :cases="report.cases" :termMap="termMap" />
          </div>
          <div class="col-12">
            <Divider />
            <div class="flex gap-2 flex-wrap">
              <Button :label="$t('report.startNext')" icon="pi pi-play" @click="startNext" />
              <Button :label="$t('report.dashboard')" icon="pi pi-home" severity="secondary" @click="goDashboard" />
            </div>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Toast from 'primevue/toast';
import ProgressBar from 'primevue/progressbar';
import Divider from 'primevue/divider';
import { useToast } from 'primevue/usetoast';
import { useGamesStore } from '../stores/gamesStore';
import { getGame, canViewReport, type CanViewReportResponse } from '../api/games';
import { listAssignmentAssessments, listBlockAssessments } from '../api/assessments';
import { fetchDiagnosisTerms } from '../api/diagnosisTerms';
import GameReportCaseTable from '../components/GameReportCaseTable.vue';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '../stores/userStore';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const gamesStore = useGamesStore();
const userStore = useUserStore();
const blockIndex = computed(()=> {
  const raw = route.params.block as string | undefined;
  const parsed = raw != null ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : -1;
});

const loading = ref(true);
const checking = ref(false);
const canView = ref(false);
const polling = ref(false);
const pollIntervalId = ref<number | null>(null);
const report: any = ref({});
// Diagnosis term label cache
const termMap = ref<Record<number,string>>({});
const termsLoaded = ref(false);
async function ensureTerms(){
  if(termsLoaded.value) return;
  try {
    const list = await fetchDiagnosisTerms();
    const map:Record<number,string> = {};
    list.forEach((t:any)=>{ if(t && typeof t.id==='number') map[t.id]=t.name; });
    termMap.value = map; termsLoaded.value = true;
  } catch(e){ /* ignore */ }
}

useI18n();


async function fetchReport(){
  if(!Number.isInteger(blockIndex.value) || blockIndex.value < 0){
    console.warn('fetchReport guard hit invalid blockIndex', blockIndex.value);
    return;
  }
  loading.value = true;
  try {
    // As a safe guard, check availability first to avoid unnecessary 404s
    const avail: CanViewReportResponse = await canViewReport(blockIndex.value);
    const ready = !!(avail?.available ?? avail?.ready);
    if (!ready) {
      canView.value = false;
      const rem = avail?.remaining_cases;
      const reason = avail?.reason === 'block_incomplete'
        ? `${typeof rem === 'number' ? rem : '若干'} 个病例尚未完成。`
        : '报告暂不可用。';
      toast.add({ severity:'warn', summary:'提示', detail: reason, life:3000 });
      return;
    }
  const data = await getGame(blockIndex.value);
  report.value = data;
  // Try to make assignments available for mapping (if this block is or was active we may have them cached)
  try { gamesStore.ensureAssignmentsLoaded(blockIndex.value); } catch(_) { /* best effort */ }
  // Hydrate user inputs (pre/post) from assessments if the report lacks them
  try { await fillInputsFromAssessments(); } catch(_) { /* non-fatal */ }
    // Add/update store summary cache
  // Optionally integrate into store (skipped: upsertGame not exported)
  } catch(e:any){
    // Handle 404 with structured detail
    const status = e?.response?.status;
    const detail = e?.response?.data?.detail || e?.message;
    if (status === 404) {
      const code = typeof detail === 'object' ? detail?.error : undefined;
      const rem = typeof detail === 'object' ? detail?.remaining_cases : undefined;
      if (code === 'block_incomplete') {
        toast.add({ severity:'warn', summary:'未就绪', detail:`报告生成中，尚有 ${typeof rem==='number'? rem : '若干'} 个病例未完成。`, life:3000 });
      } else {
        toast.add({ severity:'warn', summary:'未找到', detail:'完成本轮全部病例后会生成报告。', life:3000 });
      }
      canView.value = false;
    } else {
      toast.add({ severity:'error', summary:'错误', detail: '报告加载失败。', life:3000 });
    }
  } finally { loading.value = false; }
}

async function checkAvailability(){
  if(!Number.isInteger(blockIndex.value) || blockIndex.value < 0){
    console.warn('checkAvailability guard invalid blockIndex', blockIndex.value);
    return;
  }
  checking.value = true;
  try {
  const res = await canViewReport(blockIndex.value);
  canView.value = !!(res?.available ?? res?.ready);
  if(canView.value){ await fetchReport(); }
  } catch(e){ canView.value = false; } finally { checking.value=false; }
}

function clearPolling(){
  if (pollIntervalId.value != null) {
    clearInterval(pollIntervalId.value);
    pollIntervalId.value = null;
  }
  polling.value = false;
}

function startPolling(){
  if(polling.value || canView.value) return;
  polling.value = true;
  if (pollIntervalId.value != null) {
    clearInterval(pollIntervalId.value);
    pollIntervalId.value = null;
  }
  pollIntervalId.value = window.setInterval(async ()=>{
    console.debug('Report poll blockIndex=', blockIndex.value, typeof blockIndex.value);
    if(!Number.isInteger(blockIndex.value) || blockIndex.value < 0){
      clearPolling();
      return;
    }
    await checkAvailability();
    if(canView.value){
      clearPolling();
    }
  }, 3000);
}

async function startNext(){
  try {
    const r = await gamesStore.advanceToNext();
    if(r.status === 'exhausted') {
      toast.add({ severity:'info', summary:'Finished', detail:'No more cases remaining.', life:4000 });
      return;
    }
    if(r.assignment){ router.push(`/case/${r.assignment.case_id}`); }
  } catch(e:any){ toast.add({ severity:'error', summary:'Error', detail:e.message||'Failed to start next block.', life:4000 }); }
}
function goDashboard(){ router.push('/'); }
function goBack(){ router.back(); }
// helper functions now encapsulated in GameReportCaseTable

onMounted(async () => { await ensureTerms(); await checkAvailability(); if(!canView.value) startPolling(); });

onUnmounted(() => {
  clearPolling();
});

// Populate missing pre/post user input fields using assessment diagnosis_entries
async function fillInputsFromAssessments(){
  const r:any = report.value;
  if(!r || !Array.isArray(r.cases) || !r.cases.length) return;
  // For each case, attempt to fetch assessments via assignment id
  for(const c of r.cases){
    const caseAny:any = c;
    const hasPre = !!(caseAny.pre_top1_raw_text || caseAny.pre_top1_diagnosis_term_id);
    const hasPost = !!(caseAny.post_top1_raw_text || caseAny.post_top1_diagnosis_term_id);
    if(hasPre && hasPost) continue;
    // Try common assignment id fields present in report payloads
    const candIds:number[] = [];
    ['assignment_id','pre_assignment_id','post_assignment_id'].forEach((k)=>{
      if(typeof caseAny[k] === 'number') candIds.push(caseAny[k]);
    });
    // If none present, try mapping from store assignments by case_id for this block
    if(!candIds.length && Number.isInteger(blockIndex.value) && blockIndex.value >= 0){
      const storeAssignments:any[] = gamesStore.getBlockAssignments(blockIndex.value) as any[];
      const match = storeAssignments?.find(a=>a.case_id === caseAny.case_id);
      if(match && typeof match.id === 'number') candIds.push(match.id);
    }
    if(!candIds.length) continue;
    try {
      const assessments = await listAssignmentAssessments(candIds[0]);
      const pre = assessments.find(a=>a.phase === 'PRE');
      const post = assessments.find(a=>a.phase === 'POST');
      const pickTop1Text = (a:any)=> Array.isArray(a?.diagnosis_entries) ? [...a.diagnosis_entries].sort((x:any,y:any)=>(x.rank||99)-(y.rank||99))[0]?.raw_text || null : null;
      const pickTop1Id = (a:any)=> Array.isArray(a?.diagnosis_entries) ? [...a.diagnosis_entries].sort((x:any,y:any)=>(x.rank||99)-(y.rank||99))[0]?.diagnosis_term_id ?? null : null;
      if(pre && !hasPre){
        caseAny.pre_top1_raw_text = pickTop1Text(pre) || undefined;
        caseAny.pre_top1_diagnosis_term_id = pickTop1Id(pre) || undefined;
      }
      if(post && !hasPost){
        caseAny.post_top1_raw_text = pickTop1Text(post) || undefined;
        caseAny.post_top1_diagnosis_term_id = pickTop1Id(post) || undefined;
      }
    } catch(_e){ /* ignore individual failures */ }
  }
  // Fallback: if some cases still missing, fetch all assessments for this user+block and join by case_id
  try {
    const missing = (r.cases as any[]).filter(c=>!(c.pre_top1_raw_text || c.pre_top1_diagnosis_term_id) || !(c.post_top1_raw_text || c.post_top1_diagnosis_term_id));
    const uid = typeof r.user_id === 'number' ? r.user_id : userStore.user?.id;
    if(missing.length && typeof uid === 'number' && Number.isInteger(blockIndex.value) && blockIndex.value >= 0){
      const all = await listBlockAssessments(uid, blockIndex.value);
      const byCase: Record<string, { pre?: any; post?: any }> = {};
      // Build a map from assignment_id -> case_id from report payload if available
      // Build assignment->case map from r.cases
      const assignmentToCase: Record<number, number> = {};
      for(const c of r.cases){
        const ids:number[] = [];
        ['assignment_id','pre_assignment_id','post_assignment_id'].forEach(k=>{ if(typeof (c as any)[k] === 'number') ids.push((c as any)[k]); });
        ids.forEach(id=>{ assignmentToCase[id] = (c as any).case_id; });
      }
      // Enrich mapping with store assignments if available
      if(Number.isInteger(blockIndex.value) && blockIndex.value >= 0){
        const storeAssignments:any[] = gamesStore.getBlockAssignments(blockIndex.value) as any[];
        if(Array.isArray(storeAssignments)){
          for(const a of storeAssignments){ if(typeof a?.id==='number' && typeof a?.case_id==='number') assignmentToCase[a.id] = a.case_id; }
        }
      }
      // Group assessments by case via assignment mapping
      const pickTop1Text = (a:any)=> Array.isArray(a?.diagnosis_entries) ? [...a.diagnosis_entries].sort((x:any,y:any)=>(x.rank||99)-(y.rank||99))[0]?.raw_text || null : null;
      const pickTop1Id = (a:any)=> Array.isArray(a?.diagnosis_entries) ? [...a.diagnosis_entries].sort((x:any,y:any)=>(x.rank||99)-(y.rank||99))[0]?.diagnosis_term_id ?? null : null;
      for(const a of all){
        const cid = assignmentToCase[a.assignment_id];
        if(!cid) continue;
        const bucket = (byCase[cid] ||= {} as any);
        if(a.phase==='PRE') bucket.pre = a; else if(a.phase==='POST') bucket.post = a;
      }
      // If we still couldn't map anything, fall back to positional zipping by assignment_id order
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
        const n = Math.min(r.cases.length, groupArr.length);
        for(let i=0;i<n;i++){
          const caseAny:any = r.cases[i];
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
      for(const c of r.cases){
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
  } catch(_e){ /* ignore fallback errors */ }
}
</script>

<style scoped>
/* Max width handled by .u-page-standard; .report-container retained as a hook */
.congrats-banner { position:relative; overflow:hidden; }
.congrats-banner .emoji { font-size:1.75rem; line-height:1; }
.congrats-banner::after { content:''; position:absolute; inset:0; pointer-events:none; border:1px solid var(--border-color); border-radius:inherit; }

/* table styles moved into GameReportCaseTable */
</style>
