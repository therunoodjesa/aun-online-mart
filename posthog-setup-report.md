# PostHog post-wizard report

The wizard integrated PostHog into the Expo Router application with environment-backed configuration, lifecycle and touch autocapture defaults, manual route screen tracking, authenticated user identification, client-side commerce events, exception capture, and correlated server-side payment and vendor-operation events. The React Native SDK and required SVG peer dependency were installed, and TypeScript verification passes.

| Event | Description | File |
|---|---|---|
| `user_logged_in` | A user successfully logs in with email and password. | `app/(auth)/login.tsx` |
| `user_signed_up` | A user successfully creates a buyer or vendor account. | `app/(auth)/signup.tsx` |
| `product_added_to_cart` | A buyer adds a marketplace product to the cart. | `store/cartstore.ts` |
| `product_removed_from_cart` | A buyer removes a marketplace product from the cart. | `store/cartstore.ts` |
| `checkout_started` | A buyer proceeds from the cart into delivery or payment. | `app/(buyer)/cart.tsx` |
| `payment_started` | A buyer starts Paystack checkout or submits a bank transfer. | `app/(buyer)/payment.tsx` |
| `payment_completed` | The server verifies a successful Paystack payment and creates an order. | `supabase/functions/paystack-verify/index.ts` |
| `bank_transfer_submitted` | The server records a buyer bank transfer for confirmation. | `supabase/functions/bank-transfer-submit/index.ts` |
| `favourite_updated` | A buyer adds or removes a product, cafeteria item, or vendor favourite. | `components/FavouriteButton.tsx` |
| `vendor_order_status_updated` | A vendor accepts, prepares, readies, or rejects an order. | `supabase/functions/vendor-order-update/index.ts` |

## Next steps

We've built insights and a dashboard to monitor the newly instrumented behavior:

- [Analytics basics dashboard](https://us.posthog.com/project/522117/dashboard/1882018)
- [Purchase conversion funnel](https://us.posthog.com/project/522117/insights/FlAgdmHk)
- [Signup and login activity](https://us.posthog.com/project/522117/insights/uiUrXhEx)
- [Payment starts by method](https://us.posthog.com/project/522117/insights/cy7nyDGK)
- [Cart removals and favourites](https://us.posthog.com/project/522117/insights/0dSHfDnn)
- [Vendor order status updates](https://us.posthog.com/project/522117/insights/CmaJntil)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add the exact PostHog env var names added here to `.env.example` and any monorepo/bootstrap scripts so collaborators know what to set.
- [ ] Confirm the returning-visitor path also calls `identify` — a handler that only identifies on fresh login can leave returning sessions on anonymous distinct IDs.
- [ ] Configure `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` as Supabase Edge Function secrets before deploying the instrumented server functions.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
