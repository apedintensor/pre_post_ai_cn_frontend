export const INVESTIGATION_PLANS = ['NONE', 'BIOPSY', 'OTHER'] as const;
export type InvestigationPlan = typeof INVESTIGATION_PLANS[number];

export const NEXT_STEP_ACTIONS = ['REASSURE', 'MANAGE_MYSELF', 'REFER'] as const;
export type NextStepAction = typeof NEXT_STEP_ACTIONS[number];

const legacyInvestigationMap: Record<string, InvestigationPlan> = {
  none: 'NONE',
  NONE: 'NONE',
  biopsy: 'BIOPSY',
  BIOPSY: 'BIOPSY',
  other: 'OTHER',
  OTHER: 'OTHER'
};

const legacyNextStepMap: Record<string, NextStepAction> = {
  reassure: 'REASSURE',
  REASSURE: 'REASSURE',
  manage: 'MANAGE_MYSELF',
  MANAGE: 'MANAGE_MYSELF',
  manage_myself: 'MANAGE_MYSELF',
  MANAGE_MYSELF: 'MANAGE_MYSELF',
  refer: 'REFER',
  REFER: 'REFER'
};

function resolveLegacyValue<T extends string>(map: Record<string, T>, raw: string): T | null {
  if (raw in map) return map[raw];
  const upper = raw.toUpperCase();
  if (upper in map) return map[upper];
  const lower = raw.toLowerCase();
  if (lower in map) return map[lower];
  return null;
}

export function normalizeInvestigationPlan(value: string | null | undefined): InvestigationPlan | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return resolveLegacyValue(legacyInvestigationMap, trimmed);
}

export function normalizeNextStepAction(value: string | null | undefined): NextStepAction | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return resolveLegacyValue(legacyNextStepMap, trimmed);
}

const investigationLabelsZh: Record<InvestigationPlan, string> = {
  NONE: '不需要',
  BIOPSY: '活检',
  OTHER: '其他'
};

const nextStepLabelsZh: Record<NextStepAction, string> = {
  REASSURE: '安抚随访',
  MANAGE_MYSELF: '自行处理',
  REFER: '转诊'
};

export function formatInvestigationPlanZh(value: InvestigationPlan | null | undefined): string {
  if (!value) return '—';
  return investigationLabelsZh[value] ?? '—';
}

export function formatNextStepActionZh(value: NextStepAction | null | undefined): string {
  if (!value) return '—';
  return nextStepLabelsZh[value] ?? '—';
}
