import React from 'react';
import { cn } from '@/lib/utils';

export type DealGrade = 'A' | 'B' | 'C' | 'D' | 'F';

interface DealGradeBadgeProps {
  grade: DealGrade;
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showScore?: boolean;
  className?: string;
}

const gradeConfig: Record<DealGrade, { bg: string; text: string; ring: string }> = {
  A: { 
    bg: 'bg-gradient-to-br from-emerald-500 to-green-600', 
    text: 'text-white',
    ring: 'ring-emerald-500/30'
  },
  B: { 
    bg: 'bg-gradient-to-br from-blue-500 to-indigo-600', 
    text: 'text-white',
    ring: 'ring-blue-500/30'
  },
  C: { 
    bg: 'bg-gradient-to-br from-amber-500 to-yellow-600', 
    text: 'text-white',
    ring: 'ring-amber-500/30'
  },
  D: { 
    bg: 'bg-gradient-to-br from-orange-500 to-red-500', 
    text: 'text-white',
    ring: 'ring-orange-500/30'
  },
  F: { 
    bg: 'bg-gradient-to-br from-red-600 to-rose-700', 
    text: 'text-white',
    ring: 'ring-red-500/30'
  },
};

const sizeConfig = {
  sm: {
    container: 'h-8 w-8',
    grade: 'text-sm font-bold',
    score: 'text-[8px]',
  },
  md: {
    container: 'h-16 w-16',
    grade: 'text-2xl font-bold',
    score: 'text-xs',
  },
  lg: {
    container: 'h-24 w-24',
    grade: 'text-4xl font-bold',
    score: 'text-sm',
  },
};

export function DealGradeBadge({ 
  grade, 
  score, 
  size = 'md', 
  showScore = true,
  className 
}: DealGradeBadgeProps) {
  const config = gradeConfig[grade];
  const sizes = sizeConfig[size];

  return (
    <div 
      className={cn(
        'relative rounded-full flex flex-col items-center justify-center ring-4 shadow-lg transition-transform hover:scale-105',
        config.bg,
        config.text,
        config.ring,
        sizes.container,
        className
      )}
    >
      <span className={sizes.grade}>{grade}</span>
      {showScore && size !== 'sm' && (
        <span className={cn('opacity-90', sizes.score)}>({score})</span>
      )}
    </div>
  );
}

export function calculateDealGrade(averageScore: number): { grade: DealGrade; score: number; summary: string } {
  const score = Math.round(averageScore * 10);
  
  if (score >= 90) {
    return { grade: 'A', score, summary: 'Excellent deal health - high probability of closing' };
  } else if (score >= 80) {
    return { grade: 'B', score, summary: 'Strong deal - minor gaps to address' };
  } else if (score >= 70) {
    return { grade: 'C', score, summary: 'Moderate deal health - action required' };
  } else if (score >= 60) {
    return { grade: 'D', score, summary: 'At risk - significant gaps identified' };
  } else {
    return { grade: 'F', score, summary: 'Critical attention needed - major risks present' };
  }
}
