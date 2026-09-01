// Cohort-season bucketing for analytics.
//
// The program runs four cohorts a year, one per calendar season:
//   Spring starts Mar 1, Summer Jun 1, Autumn Sep 1, Winter Dec 1.
// Applications for a cohort open 4 months before its start and stay open for 3 months, followed
// by 1 review month. Applications submitted during a review month count toward the NEXT cohort —
// which falls out naturally here, because the 3-month windows tile the whole year:
//   Nov–Jan -> Spring, Feb–Apr -> Summer, May–Jul -> Autumn, Aug–Oct -> Winter.
// So an application belongs to the calendar season 4 months after its submission month.

export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';

export type CohortSeason = {
	season: SeasonName;
	/** Year the cohort starts in (a Winter cohort starting Dec 2025 has startYear 2025). */
	startYear: number;
	/** Stable identifier, e.g. "2025-winter". */
	key: string;
	/** Display label, e.g. "Winter 2025/26". */
	label: string;
	/** Chronologically ordered numeric key (startYear * 4 + season index). */
	sortKey: number;
};

// Chronological order within a start year: Spring (Mar) < Summer (Jun) < Autumn (Sep) < Winter (Dec).
const SEASON_INDEX: Record<SeasonName, number> = { spring: 0, summer: 1, autumn: 2, winter: 3 };

const SEASON_LABEL: Record<SeasonName, string> = {
	spring: 'Spring',
	summer: 'Summer',
	autumn: 'Autumn',
	winter: 'Winter'
};

// Cohort-start month (0-based) per season.
const SEASON_START_MONTH: Record<SeasonName, number> = {
	spring: 2,
	summer: 5,
	autumn: 8,
	winter: 11
};

const seasonOfMonth = (month: number): SeasonName => {
	if (month >= 2 && month <= 4) return 'spring';
	if (month >= 5 && month <= 7) return 'summer';
	if (month >= 8 && month <= 10) return 'autumn';
	return 'winter';
};

const makeCohortSeason = (season: SeasonName, startYear: number): CohortSeason => ({
	season,
	startYear,
	key: `${startYear}-${season}`,
	// Winter spans the year boundary (Dec–Feb), so label both years to avoid ambiguity.
	label:
		season === 'winter'
			? `Winter ${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`
			: `${SEASON_LABEL[season]} ${startYear}`,
	sortKey: startYear * 4 + SEASON_INDEX[season]
});

/** The cohort an application submitted at `ms` counts toward (= its application window's cohort). */
export const cohortSeasonForTimestamp = (ms: number): CohortSeason => {
	const date = new Date(ms);
	// Shift by the 4-month lead: the shifted month lands inside the cohort's own season.
	const shifted = date.getFullYear() * 12 + date.getMonth() + 4;
	const shiftedMonth = shifted % 12;
	const shiftedYear = Math.floor(shifted / 12);
	const season = seasonOfMonth(shiftedMonth);
	// Winter's Jan/Feb tail belongs to the cohort that started the previous December.
	const startYear = season === 'winter' && shiftedMonth < 11 ? shiftedYear - 1 : shiftedYear;
	return makeCohortSeason(season, startYear);
};

/** Human description of a cohort's application window, e.g. "applications Aug 1 – Oct 31, cohort starts Dec 1". */
export const describeApplicationWindow = (cohort: CohortSeason): string => {
	const startMonth = SEASON_START_MONTH[cohort.season];
	const cohortStart = new Date(cohort.startYear, startMonth, 1);
	const windowOpen = new Date(cohort.startYear, startMonth - 4, 1);
	const windowClose = new Date(cohort.startYear, startMonth - 1, 0); // last day of window's 3rd month
	const fmt = (d: Date) =>
		d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	return `Applications ${fmt(windowOpen)} – ${fmt(windowClose)} · cohort starts ${fmt(cohortStart)}`;
};
