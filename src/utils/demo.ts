import type { Router } from 'vue-router';
import { useCaseStore } from '../stores/caseStore';

type CaseStore = ReturnType<typeof useCaseStore>;

interface DemoOptions {
  curatedIds?: number[];
  replace?: boolean;
}

export async function pickDemoCase(caseStore: CaseStore, curatedIds?: number[]) {
  if (!caseStore.cases.length) {
    await caseStore.loadCases();
  }
  let pool = caseStore.cases;
  if (curatedIds?.length) {
    const set = new Set(curatedIds);
    pool = pool.filter(c => set.has(c.id));
  }
  if (!pool.length) {
    throw new Error('No demo cases available');
  }
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

export async function navigateToDemoCase(router: Router, caseStore: CaseStore, options: DemoOptions = {}) {
  const selected = await pickDemoCase(caseStore, options.curatedIds);
  const navigation = {
    path: `/case/${selected.id}`,
    query: { demo: '1' }
  } as const;
  if (options.replace) {
    await router.replace(navigation);
  } else {
    await router.push(navigation);
  }
  return selected;
}
