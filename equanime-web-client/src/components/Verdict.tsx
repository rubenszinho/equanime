import { results } from "../data/copy";

export type ResultStatus = keyof typeof results;

// Each verdict has its own mark, so it reads without colour.
const marks: Record<ResultStatus, string> = {
	no_conflict_identified: "M3.5 8.5l3 3 6-7",
	potential_conflict: "M8 3v6M8 12.2v.3",
	inconclusive: "M6 6a2 2 0 1 1 3 1.7c-.7.4-1 .9-1 1.6M8 12.2v.3",
};

export default function Verdict({ status, label }: { status: ResultStatus; label?: string }) {
	return (
		<span className={`verdict verdict--${status}`}>
			<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d={marks[status]} />
			</svg>
			{label ?? results[status]}
		</span>
	);
}
