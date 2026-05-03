import React from 'react';
import { Circle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DealTaskPreview } from '@/hooks/useDealTasksPreview';

interface DealNextStepsPreviewProps {
  tasks: DealTaskPreview[];
  totalCount: number;
  onClick?: () => void;
}

function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(dateString: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(dateString);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today;
}

export function DealNextStepsPreview({ tasks, totalCount, onClick }: DealNextStepsPreviewProps) {
  if (tasks.length === 0) return null;

  const remainingCount = totalCount - tasks.length;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="mt-3 pt-3 border-t border-border/50 cursor-pointer hover:bg-muted/30 -mx-4 px-4 pb-1 transition-colors group/steps"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Next Steps
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover/steps:opacity-100 transition-opacity" />
      </div>
      
      <div className="space-y-1.5">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-2 text-sm"
          >
            <Circle className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
            <span className="truncate flex-1 max-w-[200px] text-foreground/80">
              {task.title}
            </span>
            {task.due_date && (
              <span
                className={cn(
                  "flex-shrink-0 text-xs",
                  isOverdue(task.due_date) 
                    ? "text-destructive font-medium" 
                    : "text-muted-foreground"
                )}
              >
                {formatShortDate(task.due_date)}
              </span>
            )}
          </div>
        ))}
        
        {remainingCount > 0 && (
          <div className="text-xs text-muted-foreground pl-5">
            +{remainingCount} more step{remainingCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
