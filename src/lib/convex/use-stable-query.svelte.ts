import { useQuery as useConvexQuery } from 'convex-svelte';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

// Simplified port of the main app's $lib/convex/use-stable-query.svelte — keeps queries showing
// their previous result while new args are loading, without the main app's memory-cache/error-
// reporting extras (Sentry-backed monitoring isn't ported to this admin app).
export type UseStableQueryOptions<Query extends FunctionReference<'query'>> = {
	initialData?: FunctionReturnType<Query>;
};

export function useStableQuery<Query extends FunctionReference<'query'>>(
	query: Query,
	args?: FunctionArgs<Query> | 'skip' | (() => FunctionArgs<Query> | 'skip'),
	options?: UseStableQueryOptions<Query> | (() => UseStableQueryOptions<Query>)
) {
	const resolvedOptions = $derived(typeof options === 'function' ? options() : (options ?? {}));

	return useConvexQuery(query, args, () => ({
		initialData: resolvedOptions.initialData,
		keepPreviousData: true
	}));
}
