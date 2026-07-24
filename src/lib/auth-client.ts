import { createAuthClient } from 'better-auth/svelte';
import { convexClient } from '@convex-dev/better-auth/client/plugins';
import { emailOTPClient } from 'better-auth/client/plugins';

// Mirrors the main app's src/lib/auth-client.ts. The admin app needs email/password sign-in
// plus the emailOTP plugin for the create-account verification step (invited admins can create
// their account directly on this portal — see src/routes/sign-in/+page.svelte). The member
// app's username client plugin is still not needed here.
export const authClient = createAuthClient({
	plugins: [convexClient(), emailOTPClient()]
});
