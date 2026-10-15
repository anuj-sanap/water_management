'use client';

import * as React from 'react';
import { useId } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function ProjectSparkline({
  data = [],
  width = 100,
  height = 28,
  color = '#0284c7', // sky-600
  className = '',
}: SparklineProps) {
  const gradientId = `spark-grad-${useId().replaceAll(':', '')}`;
  // If insufficient or empty data, show a subtle flat guideline
  if (!data || data.length < 2) {
    return (
      <div
        className={`flex items-center justify-center text-[10px] text-slate-400 font-mono ${className}`}
        style={{ width, height }}
      >
        <svg width={width} height={height} className="overflow-visible">
          <line
            x1="0"
            y1={height / 2}
            x2={width}
            y2={height / 2}
            stroke="currentColor"
            strokeDasharray="2 2"
            strokeWidth="1"
            className="text-slate-300 dark:text-slate-700"
          />
        </svg>
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Add padding inside svg bounds
  const pad = 4;
  const drawHeight = height - pad * 2;
  const drawWidth = width;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * drawWidth;
    const y = pad + drawHeight - ((val - min) / range) * drawHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `${pathD} L ${drawWidth},${height} L 0,${height} Z`;

  return (
    <div className={`relative inline-block ${className}`}>
      <svg width={width} height={height} className="overflow-hidden">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${gradientId})`} />
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* End dot */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].split(',')[0]}
            cy={points[points.length - 1].split(',')[1]}
            r="2"
            fill={color}
          />
        )}
      </svg>
    </div>
  );
}
