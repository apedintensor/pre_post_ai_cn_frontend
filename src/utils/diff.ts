import type { PrePostComparableSubset } from '../types/domain';
import { normalizeInvestigationPlan, normalizeNextStepAction } from './assessmentEnums';

// Compute whether POST assessment differs from PRE snapshot.
// Differences: any diagnosis (by rank) changed (id or raw_text), or any tracked field changed.
export function computeWasUpdated(pre: PrePostComparableSubset, post: PrePostComparableSubset): boolean {
  if (!pre || !post) return false;

  const fieldKeys: (keyof PrePostComparableSubset)[] = [
    'diagnostic_confidence',
    'management_confidence',
    'investigation_action',
    'next_step_action',
  ];

  for (const key of fieldKeys) {
    if (pre[key] !== post[key]) return true;
  }

  // Compare diagnoses by rank (treat missing as undefined)
  const ranks = [1, 2, 3];
  for (const r of ranks) {
    const preDiag = pre.diagnoses.find(d => d.rank === r);
    const postDiag = post.diagnoses.find(d => d.rank === r);
    // If one exists and the other doesn't
    if (!!preDiag !== !!postDiag) return true;
    if (preDiag && postDiag) {
      if (preDiag.diagnosis_id !== postDiag.diagnosis_id) return true;
      if (preDiag.raw_text !== undefined && postDiag.raw_text !== undefined && preDiag.raw_text !== postDiag.raw_text) return true;
    }
  }
  return false;
}

// Helper to build comparable subset from legacy assessment + diagnoses arrays
export function buildComparableSubset(args: {
  diagnostic_confidence?: number;
  management_confidence?: number;
  investigation_plan?: string | null;
  investigation_action?: string | null;
  next_step?: string | null;
  next_step_action?: string | null;
  diagnoses: Array<{ rank: number; diagnosis_id?: number; raw_text?: string } | undefined | null>;
}): PrePostComparableSubset {
  const resolvedInvestigation = normalizeInvestigationPlan(
    args.investigation_action ?? args.investigation_plan,
  ) ?? null;
  const resolvedNextStep = normalizeNextStepAction(
    args.next_step_action ?? args.next_step,
  ) ?? null;
  return {
    diagnostic_confidence: args.diagnostic_confidence,
    management_confidence: args.management_confidence,
    investigation_action: resolvedInvestigation,
    next_step_action: resolvedNextStep,
    diagnoses: args.diagnoses.filter(Boolean).map(d => ({
      rank: (d as any).rank,
      diagnosis_id: (d as any).diagnosis_id,
      raw_text: (d as any).raw_text,
    })),
  };
}
