export function auditResult(input, exceptions, now = new Date()) {
  if (
    !input ||
    input.error ||
    !input.metadata?.vulnerabilities ||
    !input.vulnerabilities ||
    !Array.isArray(exceptions)
  )
    throw new Error('Dependency advisory service returned incomplete data')
  const severities = ['info', 'low', 'moderate', 'high', 'critical']
  const counts = input.metadata.vulnerabilities
  if (
    [...severities, 'total'].some((key) => !Number.isSafeInteger(counts[key]) || counts[key] < 0) ||
    Object.values(input.vulnerabilities).some(
      (v) => !v || !severities.includes(v.severity) || !Array.isArray(v.via),
    ) ||
    severities.some(
      (key) =>
        Object.values(input.vulnerabilities).filter((v) => v.severity === key).length !==
        counts[key],
    ) ||
    severities.reduce((sum, key) => sum + counts[key], 0) !== counts.total
  )
    throw new Error('Dependency advisory counts are inconsistent')
  const valid = new Set()
  for (const exception of exceptions) {
    if (
      !Number.isSafeInteger(exception.advisory) ||
      typeof exception.package !== 'string' ||
      !exception.reason?.trim() ||
      !exception.reviewer?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(exception.expires ?? '') ||
      !Number.isFinite(Date.parse(exception.expires)) ||
      Date.parse(exception.expires) <= now.getTime()
    )
      throw new Error('Invalid or expired dependency exception')
    const key = `${exception.package}:${exception.advisory}`
    if (valid.has(key)) throw new Error('Duplicate dependency exception')
    valid.add(key)
  }
  const blocked = []
  for (const [name, entry] of Object.entries(input.vulnerabilities)) {
    if (!['high', 'critical'].includes(entry.severity)) continue
    if (!Array.isArray(entry.via) || !entry.via.length)
      throw new Error('Incomplete advisory lineage')
    // Resolve meta-vulnerabilities through the audit graph; a missing edge fails closed.
    const visit = (packageName, seen = new Set()) => {
      if (seen.has(packageName)) return []
      seen.add(packageName)
      const record = input.vulnerabilities[packageName]
      if (!record || !Array.isArray(record.via)) throw new Error('Incomplete advisory lineage')
      return record.via.flatMap((v) =>
        typeof v === 'string'
          ? visit(v, seen)
          : Number.isSafeInteger(v.source)
            ? [{ name: packageName, id: v.source }]
            : (() => {
                throw new Error('Invalid advisory identity')
              })(),
      )
    }
    const causes = visit(name)
    if (!causes.length || causes.some((c) => !valid.has(`${c.name}:${c.id}`)))
      blocked.push({ package: name, severity: entry.severity })
  }
  return { counts: input.metadata.vulnerabilities, blocked }
}

export function safeFindings(input) {
  if (!Array.isArray(input)) throw new Error('Secret scanner returned invalid data')
  return input.map((f) => ({
    rule: f.RuleID,
    file: f.File,
    line: f.StartLine,
    fingerprint: f.Fingerprint,
  }))
}
