<template>
  <div v-if="cases && cases.length" class="overflow-auto case-table-wrap">
    <table class="case-table w-full">
      <thead>
        <tr>
          <th>{{ $t('report.caseLabel') }}</th>
          <th>{{ $t('report.groundTruth') }}</th>
          <th>{{ $t('report.yourPre') }}</th>
          <th>{{ $t('report.yourPost') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in cases" :key="c.case_id">
          <td>#{{ c.case_id }}</td>
          <td>{{ idLabel(c.ground_truth_diagnosis_id) }}</td>
          <td>
            <span>{{ displayInput(c, 'pre') }}</span>
          </td>
          <td>
            <span>{{ displayInput(c, 'post') }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-else class="text-500 text-xs">—</div>
  
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

useI18n();

const props = defineProps<{
  cases: any[];
  termMap?: Record<number, string>;
}>()

function idLabel(id?:number|null){
  if(id==null) return '—';
  return props.termMap?.[id] || `#${id}`;
}
function displayInput(c:any, phase:'pre'|'post') : string {
  // Prefer raw_text if backend includes it; otherwise fallback to Top1 term id label
  const raw = phase==='pre' ? c.pre_top1_raw_text : c.post_top1_raw_text;
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  const id = phase==='pre' ? c.pre_top1_diagnosis_term_id : c.post_top1_diagnosis_term_id;
  return idLabel(id);
}
</script>

<style scoped>
.case-table-wrap { border:1px solid var(--surface-border); border-radius:6px; overflow:hidden; background: var(--surface-card); }
.case-table { border-collapse: separate; border-spacing: 0; text-align:center; }
.case-table thead th { position:sticky; top:0; background: var(--surface-ground); color: var(--text-color); font-weight:600; font-size:.75rem; padding:.5rem; border-bottom:1px solid var(--surface-border); }
.case-table tbody td { padding:.5rem; border-top:1px solid var(--surface-border); }
.case-table tbody tr:nth-child(odd) td { background: color-mix(in srgb, var(--surface-overlay) 50%, transparent); }
.case-table tbody tr:hover td { background: color-mix(in srgb, var(--surface-overlay) 80%, transparent); }
.case-table td:first-child, .case-table th:first-child { border-left: none; }
.case-table td:last-child, .case-table th:last-child { border-right: none; }
</style>
