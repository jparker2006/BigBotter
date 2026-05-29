export async function withValidation<TDecision, TValid>(
  decideFn: () => Promise<TDecision>,
  validateFn: (decision: TDecision) => TValid | null,
  repairFn: (decision: TDecision | null) => TValid,
  maxRetries = 3,
): Promise<TValid> {
  let lastDecision: TDecision | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    lastDecision = await decideFn();
    const valid = validateFn(lastDecision);
    if (valid !== null) {
      return valid;
    }
  }
  return repairFn(lastDecision);
}

