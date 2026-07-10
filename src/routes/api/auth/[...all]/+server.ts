import { createSvelteKitHandler } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import type { RequestHandler } from './$types';

// Ported from the main repo's src/routes/api/auth/[...all]/+server.ts. This is a thin,
// secret-free proxy: it forwards better-auth requests to PUBLIC_CONVEX_SITE_URL (a public env
// var), which is where better-auth's routes actually live (in the shared Convex deployment).
// Without this route, authClient's default same-origin POSTs to /api/auth/* 404.
const handler = createSvelteKitHandler();

const isAbortError = (error: unknown) =>
	error instanceof DOMException
		? error.name === 'AbortError'
		: error instanceof Error && error.name === 'AbortError';

const wrapHandler = (requestHandler: RequestHandler): RequestHandler => {
	return async (event) => {
		try {
			return await requestHandler(event);
		} catch (error) {
			if (isAbortError(error)) {
				return new Response(null, { status: 204 });
			}
			throw error;
		}
	};
};

export const GET = wrapHandler(handler.GET);
export const POST = wrapHandler(handler.POST);
