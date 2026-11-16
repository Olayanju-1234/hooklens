/** The body the ingress answers a sender with: the endpoint's configured JSON, else `{ status: 'ok' }`. */
export function ingressResponseBody(
  configured: string | null,
): Record<string, unknown> {
  if (!configured) return { status: 'ok' };
  try {
    const value: unknown = JSON.parse(configured);
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : { status: 'ok' };
  } catch {
    return { status: 'ok' };
  }
}
