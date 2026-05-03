/**
 * Extract the real error message from a Supabase Edge Function response.
 *
 * When an edge function returns a non-2xx status, the Supabase client wraps
 * the failure in a generic "Edge Function returned a non-2xx status code"
 * message. The actual error body (if the function returned JSON with an
 * `error` field) is available in `response.data`. This helper digs it out.
 */
export function extractEdgeFunctionError(response: {
  error: { message: string } | null;
  data: unknown;
}): string {
  // Try to get the real error from the response body
  try {
    const body =
      typeof response.data === 'string'
        ? JSON.parse(response.data)
        : response.data;
    if (body?.error && typeof body.error === 'string') {
      return body.error;
    }
  } catch {
    // response.data wasn't parseable JSON — fall through
  }

  return response.error?.message || 'An unexpected error occurred';
}
