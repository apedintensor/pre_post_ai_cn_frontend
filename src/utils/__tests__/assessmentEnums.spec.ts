import { describe, it, expect } from 'vitest';
import {
  INVESTIGATION_PLANS,
  NEXT_STEP_ACTIONS,
  normalizeInvestigationPlan,
  normalizeNextStepAction,
  formatInvestigationPlanZh,
  formatNextStepActionZh
} from '../assessmentEnums';

describe('assessmentEnums', () => {
  it('exposes investigation plan enum values', () => {
    expect(INVESTIGATION_PLANS).toEqual(['NONE', 'BIOPSY', 'OTHER']);
  });

  it('exposes next step enum values', () => {
    expect(NEXT_STEP_ACTIONS).toEqual(['REASSURE', 'MANAGE_MYSELF', 'REFER']);
  });

  it('normalizes investigation plan strings', () => {
    expect(normalizeInvestigationPlan('none')).toBe('NONE');
    expect(normalizeInvestigationPlan('BIOPSY')).toBe('BIOPSY');
    expect(normalizeInvestigationPlan('Other')).toBe('OTHER');
    expect(normalizeInvestigationPlan('invalid')).toBeNull();
    expect(normalizeInvestigationPlan(null)).toBeNull();
  });

  it('normalizes next step action strings', () => {
    expect(normalizeNextStepAction('reassure')).toBe('REASSURE');
    expect(normalizeNextStepAction('MANAGE_MYSELF')).toBe('MANAGE_MYSELF');
    expect(normalizeNextStepAction('manage')).toBe('MANAGE_MYSELF');
    expect(normalizeNextStepAction('REFER')).toBe('REFER');
    expect(normalizeNextStepAction(undefined)).toBeNull();
  });

  it('formats investigation plan labels in zh-CN', () => {
    expect(formatInvestigationPlanZh('NONE')).toBe('不需要');
    expect(formatInvestigationPlanZh('BIOPSY')).toBe('活检');
    expect(formatInvestigationPlanZh('OTHER')).toBe('其他');
    expect(formatInvestigationPlanZh(null)).toBe('—');
    // @ts-expect-error intentional invalid enum value
    expect(formatInvestigationPlanZh('UNKNOWN')).toBe('—');
  });

  it('formats next step labels in zh-CN', () => {
    expect(formatNextStepActionZh('REASSURE')).toBe('安抚随访');
    expect(formatNextStepActionZh('MANAGE_MYSELF')).toBe('自行处理');
    expect(formatNextStepActionZh('REFER')).toBe('转诊');
    expect(formatNextStepActionZh(undefined)).toBe('—');
    // @ts-expect-error intentional invalid enum value
    expect(formatNextStepActionZh('SOMETHING_ELSE')).toBe('—');
  });
});
