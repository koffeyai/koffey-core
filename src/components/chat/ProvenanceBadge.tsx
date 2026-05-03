import React from 'react';

interface ProvenanceBadgeProps {
  source: string;
  confidence: string;
  recordsFound?: number;
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  source, confidence, recordsFound
}) => {
  if (!source || source === 'general_chat') return null;

  const config = {
    database: {
      label: 'From your CRM data',
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
    },
    database_empty: {
      label: 'No matching records found',
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
    },
    llm_general: {
      label: 'General knowledge',
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    clarification_needed: {
      label: 'Needs clarification',
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
    },
    mixed: {
      label: 'CRM data + analysis',
      color: 'text-cyan-400',
      bg: 'bg-cyan-400/10',
    },
  }[source] || { label: source, color: 'text-gray-400', bg: 'bg-gray-400/10' };

  return (
    <div className={`inline-flex items-center gap-1.5 text-[10px] font-mono mt-1 px-2 py-0.5 rounded-full ${config.bg} ${config.color} opacity-70 hover:opacity-100 transition-opacity cursor-default`}>
      <span>{config.label}</span>
      {recordsFound != null && recordsFound > 0 && (
        <span className="opacity-60">({recordsFound} records)</span>
      )}
    </div>
  );
};
