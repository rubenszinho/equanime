import type { Phase } from "@rubrion/agent-kit-react";

// The assistant: the balance inside a notary seal, the same stamp the verdicts carry. The beam is
// the circumflex of "Equânime"; thinking weighs (the beam rocks, the pans rise and fall), a tool
// turns the seal's milled edge, speaking pulses the pivot. Still when idle.
export default function Seal({ phase = "idle", size = 28, label }: { phase?: Phase; size?: number; label?: string }) {
	return (
		<svg className={`eq-seal eq-seal--${phase}`} width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
			<circle cx="32" cy="32" r="29.5" strokeWidth="2.6" />
			<circle className="eq-seal__edge" cx="32" cy="32" r="25.5" strokeWidth="1.4" strokeDasharray="7 3.13" strokeLinecap="butt" />
			<g strokeWidth="2.6">
				<path d="M32 18v26M25 45h14" />
				<path className="eq-seal__beam" d="M19 28 32 18l13 10" />
				{/* The pans hang plumb: they follow the beam's ends instead of turning with it. */}
				<g className="eq-seal__pan eq-seal__pan--left">
					<path d="M19 28 15.5 35M19 28 22.5 35" strokeWidth="1.6" />
					<path d="M14 35h10a5 4.2 0 0 1-10 0Z" fill="currentColor" fillOpacity="0.16" />
				</g>
				<g className="eq-seal__pan eq-seal__pan--right">
					<path d="M45 28 41.5 35M45 28 48.5 35" strokeWidth="1.6" />
					<path d="M40 35h10a5 4.2 0 0 1-10 0Z" fill="currentColor" fillOpacity="0.16" />
				</g>
				<circle className="eq-seal__pivot" cx="32" cy="18" r="2.4" fill="currentColor" stroke="none" />
			</g>
		</svg>
	);
}
