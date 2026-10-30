/** Plans above this size or with risk=high need a human sign-off before coding; at most 2 revise rounds. */
export const PLAN_GATE = { maxSteps: 6, approvalTimeoutMin: 240, maxRevisions: 2 } as const;
