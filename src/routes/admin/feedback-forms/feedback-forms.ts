// Shared labels for the CL-790 feedback forms screen.
import type { Id } from '$convex/_generated/dataModel';
export type Audience = 'guide' | 'learner';
export type QuestionKind = 'scale_1_10' | 'text' | 'yes_no';

export const audienceLabel = (audience: Audience) => (audience === 'guide' ? 'Guides' : 'Learners');

export const kindOptions: Array<{ value: QuestionKind; label: string }> = [
	{ value: 'scale_1_10', label: 'Score 1–10' },
	{ value: 'text', label: 'Text' },
	{ value: 'yes_no', label: 'Yes / No' }
];

// Season moments are GMT-based (CL-770), so their calendar date is read in UTC.
export const formatDate = (ms: number) =>
	new Date(ms).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});

// Return shapes of the main repo's adminForms / seasons queries (the synced api is untyped here).
export type FormSummary = {
	_id: Id<'forms'>;
	title: string;
	audience: Audience;
	seasonId: Id<'seasons'>;
	seasonName: string;
	seasonEndDate: number | null;
	feedbackDeadline: number | null;
	questionCount: number;
	responseCount: number;
};

export type FormDetail = {
	_id: Id<'forms'>;
	title: string;
	audience: Audience;
	seasonId: Id<'seasons'>;
	seasonName: string;
	responseCount: number;
	questions: Array<{
		id: string;
		label: string;
		kind: QuestionKind;
		required: boolean;
		answerCount: number;
	}>;
};

export type SeasonOption = {
	_id: Id<'seasons'>;
	name: string;
	endDate: number;
	feedbackDeadline: number;
};
