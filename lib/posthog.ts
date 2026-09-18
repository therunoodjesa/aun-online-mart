import PostHog from 'posthog-react-native';

// Optional app properties are intentionally allowed here. The SDK omits
// undefined properties during serialisation, which is preferable to forcing
// each caller to manufacture placeholder values.
type AomPostHog = PostHog & {
  capture: (event: string, properties?: Record<string, unknown>) => void;
};

const projectToken = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;

if (!projectToken || !host) {
  throw new Error('PostHog environment variables are required.');
}

export const posthog = new PostHog(projectToken, {
  host,
  captureAppLifecycleEvents: true,
}) as unknown as AomPostHog;

if (__DEV__) posthog.debug(true);
