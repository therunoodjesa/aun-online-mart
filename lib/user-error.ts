type ErrorLike = { message?: string | null; code?: string | null; status?: number | null } | string | null | undefined;

const textOf = (error: ErrorLike) => {
  if (typeof error === 'string') return error;
  return error?.message ?? '';
};

/** Converts backend/auth/network errors into instructions a customer or vendor can act on. */
export function friendlyError(error: ErrorLike, fallback = 'Something went wrong. Please try again.') {
  const raw = textOf(error).trim();
  const value = raw.toLowerCase();
  const code = typeof error === 'object' && error ? String(error.code ?? '') : '';
  const status = typeof error === 'object' && error ? Number(error.status ?? 0) : 0;

  if (!raw) return fallback;
  if (/invalid login credentials|invalid credentials/.test(value)) return 'That email or password is incorrect. Check both fields and try again.';
  if (/email not confirmed|email verification/.test(value)) return 'Confirm the verification email sent to this account, then return and sign in.';
  if (/user already registered|already been registered|email.*already/.test(value)) return 'An account already uses this email. Sign in instead, or reset the password if you cannot remember it.';
  if (/password/.test(value) && /least|characters|weak/.test(value)) return 'Choose a stronger password with at least 8 characters, including a number.';
  if (/session.*expired|refresh token|jwt.*expired|not authenticated|auth session missing|no current user/.test(value) || status === 401) return 'Your session has expired. Sign in again, then repeat this action.';
  if (/failed to fetch|network request failed|networkerror|timeout|timed out|load failed|connection/.test(value)) return 'We could not reach AOM. Check your internet connection and try again.';
  if (/row-level security|violates row-level|permission denied|not allowed|unauthorized/.test(value) || code === '42501' || status === 403) return 'This account does not have permission to make that change. Sign out and back in. Vendors should also confirm that AOM has linked the correct store to their account.';
  if (/vendor_applications_category_check/.test(value)) return 'Enter a store category of at least two letters, such as Bakery, Groceries, Lashes, or Native pot.';
  if (/operating_location|on campus or off campus/.test(value)) return 'Choose whether the business operates on campus or off campus before submitting.';
  if (/check constraint|violates check constraint/.test(value) || code === '23514') return 'One of the details entered is not accepted. Review the highlighted choices and required fields, then try again.';
  if (/not-null|null value in column/.test(value) || code === '23502') return 'A required detail is missing. Complete every required field and try again.';
  if (/duplicate key|unique constraint|already exists/.test(value) || code === '23505') return 'This information has already been saved. Refresh the page before trying to add it again.';
  if (/foreign key|still referenced|violates foreign key/.test(value) || code === '23503') return 'This record is already being used elsewhere. Hide it instead of deleting it so past orders remain accurate.';
  if (/invalid input syntax.*uuid|invalid uuid/.test(value)) return 'This link or record is no longer valid. Return to the previous page and open it again.';
  if (/storage|bucket|object.*not found/.test(value)) return 'The image could not be saved. Use a JPG or PNG file, or paste a public image link.';
  if (/edge function.*non-2xx|functionshttperror|function returned/.test(value)) return 'AOM could not complete that request right now. Wait a moment and try again.';
  if (/payment.*amount|amount.*mismatch|could not be verified safely/.test(value)) return 'The amount received does not match this checkout. Return to your cart and start a fresh payment.';
  if (/payment.*not found|reference.*not found/.test(value)) return 'We could not find that payment. Return to checkout and start a fresh payment attempt.';

  return fallback;
}
