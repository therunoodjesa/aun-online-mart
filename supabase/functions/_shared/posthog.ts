type Properties = Record<string, unknown>;

export async function captureServerEvent(distinctId: string, event: string, properties: Properties = {}) {
  const projectToken = Deno.env.get('POSTHOG_PROJECT_TOKEN');
  const host = Deno.env.get('POSTHOG_HOST');
  if (!projectToken || !host) {
    console.warn('PostHog server environment variables are not configured.');
    return;
  }

  const response = await fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: projectToken, event, properties: { distinct_id: distinctId, ...properties } }),
  });
  if (!response.ok) console.error('PostHog server capture failed', response.status);
}
