"use client";
import { useState } from "react";

export interface Segment {
  name: string;
  percentage: number;
  color: string;
  amount: number;
}

interface DonutChartProps {
  segments: Segment[];
  totalLabel: string;
  total: string;
  onSegmentClick?: (segment: Segment | null) => void;
  activeSegment?: string | null;
}

const RADIUS = 75;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 5;

export default function DonutChart({ segments, totalLabel, total, onSegmentClick, activeSegment }: DonutChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  let cumulativeDash = 0;

  function fmt(v: number) {
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const highlighted = hovered ?? activeSegment;
  const activeData = segments.find(s => s.name === highlighted);

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <svg
        viewBox="0 0 200 200"
        width={180}
        height={180}
        style={{ overflow: "visible", cursor: "pointer" }}
      >
        {/* Background track */}
        <circle
          cx="100" cy="100" r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="28"
        />

        {/* Segments */}
        {segments.map((seg, i) => {
          const actualDash = (seg.percentage / 100) * CIRCUMFERENCE;
          const displayDash = actualDash - GAP;
          const offset = CIRCUMFERENCE * 0.25 - cumulativeDash;
          cumulativeDash += actualDash;

          const isHighlighted = highlighted === seg.name;
          const isDimmed = highlighted !== null && !isHighlighted;

          return (
            <circle
              key={i}
              cx="100" cy="100"
              r={RADIUS}
              fill="none"
              stroke={seg.color}
              strokeWidth={isHighlighted ? 33 : 28}
              strokeDasharray={`${Math.max(displayDash, 0)} ${CIRCUMFERENCE}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
              opacity={isDimmed ? 0.25 : 1}
              style={{
                filter: isHighlighted ? `drop-shadow(0 0 10px ${seg.color}88)` : `drop-shadow(0 0 4px ${seg.color}44)`,
                transition: "all 0.2s ease",
                cursor: "pointer",
              }}
              onMouseEnter={() => setHovered(seg.name)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSegmentClick?.(isHighlighted && highlighted === activeSegment ? null : seg)}
            />
          );
        })}

        {/* Center content */}
        {activeData ? (
          <>
            <text x="100" y="88" textAnchor="middle" fill={activeData.color}
              fontSize="9" fontWeight="700" letterSpacing="1"
              style={{ fontFamily: "var(--font-jakarta, sans-serif)", textTransform: "uppercase" }}>
              {activeData.name}
            </text>
            <text x="100" y="107" textAnchor="middle" fill="#EEF2FF"
              fontSize="13" fontWeight="700"
              style={{ fontFamily: "var(--font-space-mono, monospace)" }}>
              {activeData.percentage}%
            </text>
            <text x="100" y="122" textAnchor="middle" fill="rgba(255,255,255,0.35)"
              fontSize="8.5"
              style={{ fontFamily: "var(--font-space-mono, monospace)" }}>
              R$ {fmt(activeData.amount)}
            </text>
          </>
        ) : (
          <>
            <text x="100" y="93" textAnchor="middle" fill="rgba(255,255,255,0.3)"
              fontSize="9" fontWeight="600" letterSpacing="1.5"
              style={{ fontFamily: "var(--font-jakarta, sans-serif)" }}>
              {totalLabel.toUpperCase()}
            </text>
            <text x="100" y="112" textAnchor="middle" fill="#EEF2FF"
              fontSize="15" fontWeight="700"
              style={{ fontFamily: "var(--font-space-mono, monospace)" }}>
              {total}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
