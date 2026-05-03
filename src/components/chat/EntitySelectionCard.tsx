/**
 * EntitySelectionCard - Clickable entity disambiguation for chat
 * 
 * Renders a list of CRM entities for user selection when multiple
 * matches are found. Designed for sales users who prefer visual
 * UI navigation over typing.
 * 
 * Features:
 * - Visual entity type indicators (icons + colors)
 * - Subtitle and metadata for context (industry, pipeline value, etc.)
 * - Keyboard accessible
 * - Falls back to typing ("Or type the name to select")
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Building2, Briefcase, User, CheckSquare, ChevronRight, LucideIcon } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface SelectableEntity {
  id: string;
  type: 'account' | 'deal' | 'contact' | 'task';
  name: string;
  subtitle?: string;   // e.g., Industry, Stage, Role
  metadata?: string;   // e.g., Pipeline value, Last activity
}

export interface EntitySelectionData {
  entities: SelectableEntity[];
  prompt?: string;
}

interface EntitySelectionCardProps {
  entities: SelectableEntity[];
  prompt?: string;
  onSelect: (entity: SelectableEntity) => void;
  disabled?: boolean;
  className?: string;
}

// ============================================================================
// STYLING CONFIG
// ============================================================================

const entityConfig: Record<SelectableEntity['type'], { icon: LucideIcon; colorClass: string }> = {
  account: {
    icon: Building2,
    colorClass: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/50'
  },
  deal: {
    icon: Briefcase,
    colorClass: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/50'
  },
  contact: {
    icon: User,
    colorClass: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/50'
  },
  task: {
    icon: CheckSquare,
    colorClass: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/50'
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

export function EntitySelectionCard({
  entities,
  prompt,
  onSelect,
  disabled = false,
  className
}: EntitySelectionCardProps) {
  if (!entities || entities.length === 0) return null;

  return (
    <div className={cn(
      "rounded-lg border border-border bg-card p-3 max-w-md",
      className
    )}>
      {prompt && (
        <p className="text-sm text-muted-foreground mb-3">{prompt}</p>
      )}
      
      <div className="space-y-2">
        {entities.map((entity) => {
          const config = entityConfig[entity.type] || entityConfig.account;
          const Icon = config.icon;
          
          return (
            <button
              key={entity.id}
              onClick={() => onSelect(entity)}
              disabled={disabled}
              className={cn(
                // Base styles
                "w-full text-left px-3 py-2.5 rounded-lg border transition-all",
                // Interactive states
                "hover:border-primary/50 hover:bg-accent/50 hover:shadow-sm",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-1",
                "active:scale-[0.99]",
                // Disabled state
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none",
                // Default appearance
                "bg-background border-border"
              )}
            >
              <div className="flex items-center gap-3">
                {/* Entity Type Icon */}
                <div className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                  config.colorClass
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                
                {/* Entity Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate text-foreground">
                    {entity.name}
                  </div>
                  
                  {(entity.subtitle || entity.metadata) && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {entity.subtitle && (
                        <span className="truncate">
                          {entity.subtitle}
                        </span>
                      )}
                      {entity.subtitle && entity.metadata && (
                        <span>·</span>
                      )}
                      {entity.metadata && (
                        <span className="truncate font-medium">
                          {entity.metadata}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Selection Arrow */}
                <div className="flex-shrink-0 text-muted-foreground">
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
      
      {/* Hint for keyboard users / power users */}
      <p className="text-xs text-muted-foreground mt-3 text-center">
        💡 Or just type the name to select
      </p>
    </div>
  );
}
