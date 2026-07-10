import { createAuthClient } from 'better-auth/svelte';
import { convexClient } from '@convex-dev/better-auth/client/plugins';

// Mirrors the main app's src/lib/auth-client.ts. The admin app only needs email/password
// sign-in (see src/routes/sign-in/+page.svelte) so the emailOTP/username client plugins used
// by the member app aren't ported here.
export const authClient = createAuthClient({
	plugins: [convexClient()]
});
