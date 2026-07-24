<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { authClient } from '$lib/auth-client';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { routes } from '$lib/routes';

	// CL-693 admin split: email/password sign-in plus a create-account flow for invited admins
	// (admin-invite mechanism — see the main repo's src/convex/adminInvites.ts). Creating an
	// account here grants nothing by itself: admin access only materializes when the /admin
	// layout's claimAdminInvite call finds a pending invite matching the verified email.
	// Reuses the main repo's better-auth client flows (signIn.email / signUp.email / emailOtp),
	// stripped of the member app's Google/username/consent steps which don't apply here.
	const auth = useAuth();

	type Mode = 'signIn' | 'signUp' | 'verify';
	let mode = $state<Mode>('signIn');

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let otp = $state('');
	let pending = $state(false);
	let googlePending = $state(false);
	let errorMessage = $state('');
	let infoMessage = $state('');

	let nextPath = $derived(page.url.searchParams.get('next') ?? routes.admin);

	$effect(() => {
		if (!auth.isLoading && auth.isAuthenticated) {
			void goto(nextPath, { replaceState: true });
		}
	});

	const switchMode = (next: Mode) => {
		mode = next;
		errorMessage = '';
		infoMessage = '';
		otp = '';
	};

	// Better Auth blocks unverified email/password sign-ins (requireEmailVerification). Same
	// string-match caveat as the main app's sign-up page: these are Better Auth client errors,
	// not Convex server errors, so matching on message text is the established pattern.
	const isUnverifiedError = (message: string | undefined) => /verif/i.test(message ?? '');

	const sendOtpAndVerify = async (sanitizedEmail: string) => {
		const { error } = await authClient.emailOtp.sendVerificationOtp({
			email: sanitizedEmail,
			type: 'email-verification'
		});
		if (error) {
			errorMessage = error.message ?? 'Could not send a verification code.';
			return;
		}
		switchMode('verify');
		infoMessage = `We sent a 6-digit code to ${sanitizedEmail}.`;
	};

	const signIn = async () => {
		errorMessage = '';
		pending = true;
		try {
			const sanitizedEmail = email.trim().toLowerCase();
			const { error } = await authClient.signIn.email({
				email: sanitizedEmail,
				password
			});
			if (error) {
				if (isUnverifiedError(error.message)) {
					await sendOtpAndVerify(sanitizedEmail);
					return;
				}
				errorMessage = error.message ?? 'Invalid email or password.';
				return;
			}
			await goto(nextPath, { replaceState: true });
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Sign-in failed.';
		} finally {
			pending = false;
		}
	};

	const signUp = async () => {
		errorMessage = '';
		pending = true;
		try {
			const sanitizedEmail = email.trim().toLowerCase();
			const { error } = await authClient.signUp.email({
				name: name.trim() || sanitizedEmail.split('@')[0],
				email: sanitizedEmail,
				password
			});
			if (error) {
				errorMessage = error.message ?? 'Could not create the account.';
				return;
			}
			// sendOnSignUp already emailed an OTP (emailOTP overrides default verification).
			switchMode('verify');
			infoMessage = `We sent a 6-digit code to ${sanitizedEmail}.`;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Account creation failed.';
		} finally {
			pending = false;
		}
	};

	const verify = async () => {
		errorMessage = '';
		pending = true;
		try {
			const { error } = await authClient.emailOtp.verifyEmail({
				email: email.trim().toLowerCase(),
				otp: otp.trim()
			});
			if (error) {
				errorMessage = error.message ?? 'Invalid verification code.';
				return;
			}
			// autoSignInAfterVerification signs the user in; the /admin layout claims any
			// pending admin invite for this email from here.
			await goto(nextPath, { replaceState: true });
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Verification failed.';
		} finally {
			pending = false;
		}
	};

	// Google sign-in for admins whose account was created with Google in the member app (no
	// password credential exists for them). callbackURL/errorCallbackURL are ABSOLUTE on this
	// app's origin: the auth server's baseURL is the member app, so a relative path would
	// bounce the OAuth return to the wrong origin. This origin must be in the backend's
	// trustedOrigins (ADMIN_APP_ORIGIN / localhost:4174). Implicit sign-UP via Google is
	// disabled server-side — invitees without any account use the create-account flow instead.
	const signInWithGoogle = async () => {
		errorMessage = '';
		googlePending = true;
		try {
			const { data, error } = await authClient.signIn.social({
				provider: 'google',
				callbackURL: `${window.location.origin}${nextPath}`,
				errorCallbackURL: `${window.location.origin}${routes.signIn}`
			});
			if (error) {
				errorMessage = error.message ?? 'Google sign-in failed.';
				return;
			}
			if (data?.url) {
				window.location.href = data.url;
				return;
			}
			errorMessage = 'Google sign-in could not start.';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Google sign-in failed.';
		} finally {
			googlePending = false;
		}
	};

	const resendOtp = async () => {
		errorMessage = '';
		infoMessage = '';
		pending = true;
		try {
			await sendOtpAndVerify(email.trim().toLowerCase());
		} finally {
			pending = false;
		}
	};
</script>

<div class="flex min-h-screen items-center justify-center bg-neutral-100 px-4">
	<div class="w-full max-w-sm rounded-lg border border-neutral-300 bg-white p-6 shadow-sm">
		<h1 class="text-lg font-semibold text-neutral-900">Curiosity Admin</h1>
		{#if mode === 'signIn'}
			<p class="mt-1 text-sm text-neutral-500">Sign in with your admin account.</p>
		{:else if mode === 'signUp'}
			<p class="mt-1 text-sm text-neutral-500">
				Create your account. Use the email address your admin invitation was sent to.
			</p>
		{:else}
			<p class="mt-1 text-sm text-neutral-500">Verify your email to continue.</p>
		{/if}

		{#if mode === 'verify'}
			<form
				class="mt-6 flex flex-col gap-4"
				onsubmit={(event) => {
					event.preventDefault();
					void verify();
				}}
			>
				<div class="flex flex-col gap-1.5">
					<label for="otp" class="text-sm font-medium text-neutral-700">Verification code</label>
					<Input
						id="otp"
						type="text"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength={6}
						bind:value={otp}
						required
						placeholder="123456"
					/>
				</div>

				{#if infoMessage}
					<p
						class="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600"
					>
						{infoMessage}
					</p>
				{/if}
				{#if errorMessage}
					<p class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
						{errorMessage}
					</p>
				{/if}

				<Button type="submit" disabled={pending || otp.trim().length !== 6} class="w-full">
					{pending ? 'Verifying…' : 'Verify'}
				</Button>
				<button
					type="button"
					class="text-sm text-neutral-500 underline-offset-2 hover:underline"
					onclick={() => void resendOtp()}
					disabled={pending}
				>
					Resend code
				</button>
			</form>
		{:else}
			<form
				class="mt-6 flex flex-col gap-4"
				onsubmit={(event) => {
					event.preventDefault();
					void (mode === 'signIn' ? signIn() : signUp());
				}}
			>
				{#if mode === 'signUp'}
					<div class="flex flex-col gap-1.5">
						<label for="name" class="text-sm font-medium text-neutral-700">Name</label>
						<Input
							id="name"
							type="text"
							bind:value={name}
							autocomplete="name"
							placeholder="Your name"
						/>
					</div>
				{/if}

				<div class="flex flex-col gap-1.5">
					<label for="email" class="text-sm font-medium text-neutral-700">Email</label>
					<Input
						id="email"
						type="email"
						bind:value={email}
						autocomplete="username"
						required
						placeholder="you@curiositylearning.org"
					/>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="password" class="text-sm font-medium text-neutral-700">Password</label>
					<Input
						id="password"
						type="password"
						bind:value={password}
						autocomplete={mode === 'signIn' ? 'current-password' : 'new-password'}
						required
					/>
				</div>

				{#if errorMessage}
					<p class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
						{errorMessage}
					</p>
				{/if}

				<Button type="submit" disabled={pending || !email.trim() || !password} class="w-full">
					{#if pending}
						{mode === 'signIn' ? 'Signing in…' : 'Creating account…'}
					{:else}
						{mode === 'signIn' ? 'Sign in' : 'Create account'}
					{/if}
				</Button>

				{#if mode === 'signIn'}
					<div class="flex items-center gap-3">
						<div class="h-px flex-1 bg-neutral-200"></div>
						<span class="text-xs text-neutral-400">or</span>
						<div class="h-px flex-1 bg-neutral-200"></div>
					</div>
					<Button
						type="button"
						variant="outline"
						class="w-full"
						disabled={googlePending}
						onclick={() => void signInWithGoogle()}
					>
						{googlePending ? 'Redirecting…' : 'Sign in with Google'}
					</Button>
				{/if}

				<button
					type="button"
					class="text-sm text-neutral-500 underline-offset-2 hover:underline"
					onclick={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}
				>
					{mode === 'signIn' ? 'Invited? Create an account' : 'Already have an account? Sign in'}
				</button>
			</form>
		{/if}
	</div>
</div>
