import React from 'react';
import { cn } from '@/lib/utils';
import { Check, Sparkles } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SlideElementType, SlotMappingType } from '@/types/slides';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ElementOverlayProps {
  elementId: string;
  elementType: SlideElementType;
  boundingBox: BoundingBox;
  content?: string;
  mappingType?: SlotMappingType;
  slotName?: string;
  isSelected: boolean;
  isMapped: boolean;
  previewWidth: number;
  previewHeight: number;
  slideWidth: number;
  slideHeight: number;
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  tabIndex?: number;
}

export function ElementOverlay({
  elementId,
  elementType,
  boundingBox,
  content,
  mappingType,
  slotName,
  isSelected,
  isMapped,
  previewWidth,
  previewHeight,
  slideWidth,
  slideHeight,
  onClick,
  onKeyDown,
  tabIndex = 0,
}: ElementOverlayProps) {
  // Scale bounding box to preview dimensions
  const scaleX = previewWidth / slideWidth;
  const scaleY = previewHeight / slideHeight;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: boundingBox.x * scaleX,
    top: boundingBox.y * scaleY,
    width: boundingBox.width * scaleX,
    height: boundingBox.height * scaleY,
    minWidth: 24,
    minHeight: 24,
  };

  const getStatusIcon = () => {
    if (!isMapped) return null;
    if (mappingType === 'ai_generated') {
      return <Sparkles className="h-3 w-3 text-purple-400" />;
    }
    return <Check className="h-3 w-3 text-primary" />;
  };

  const getStatusLabel = () => {
    if (!isMapped) return 'Click to map';
    switch (mappingType) {
      case 'direct':
        return `Direct: ${slotName || 'Mapped'}`;
      case 'ai_generated':
        return `AI: ${slotName || 'Generated'}`;
      case 'static':
        return `Static: ${slotName || 'Fixed'}`;
      case 'conditional':
        return `Conditional: ${slotName || 'Logic'}`;
      default:
        return 'Mapped';
    }
  };

  const getElementTypeLabel = () => {
    switch (elementType) {
      case 'text':
        return 'Text Element';
      case 'image':
        return 'Image Element';
      case 'shape':
        return 'Shape Element';
      case 'chart':
        return 'Chart Element';
      default:
        return 'Element';
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          style={style}
          onClick={onClick}
          onKeyDown={onKeyDown}
          tabIndex={tabIndex}
          className={cn(
            'group cursor-pointer rounded transition-all duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            // Unmapped state
            !isMapped && !isSelected && [
              'border-2 border-dashed border-muted-foreground/40',
              'bg-muted/20 hover:bg-muted/40',
              'hover:border-muted-foreground/60',
            ],
            // Mapped (Direct) state
            isMapped && mappingType === 'direct' && !isSelected && [
              'border-2 border-solid border-primary/60',
              'bg-primary/10 hover:bg-primary/20',
            ],
            // Mapped (AI) state
            isMapped && mappingType === 'ai_generated' && !isSelected && [
              'border-2 border-solid border-purple-500/60',
              'bg-purple-500/10 hover:bg-purple-500/20',
            ],
            // Mapped (Static) state
            isMapped && mappingType === 'static' && !isSelected && [
              'border-2 border-solid border-green-500/60',
              'bg-green-500/10 hover:bg-green-500/20',
            ],
            // Selected state
            isSelected && [
              'border-2 border-solid border-accent-foreground',
              'bg-accent/30',
              'ring-2 ring-accent ring-offset-2 ring-offset-background',
              'shadow-lg shadow-accent/20',
            ]
          )}
          aria-label={`${getElementTypeLabel()}: ${content?.slice(0, 50) || 'Empty'}`}
          aria-pressed={isSelected}
        >
          {/* Status indicator badge */}
          <span
            className={cn(
              'absolute -top-2 -right-2 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              isSelected && 'opacity-100',
              !isMapped && 'bg-muted text-muted-foreground',
              isMapped && mappingType === 'direct' && 'bg-primary text-primary-foreground',
              isMapped && mappingType === 'ai_generated' && 'bg-purple-500 text-white',
              isMapped && mappingType === 'static' && 'bg-green-500 text-white',
            )}
          >
            {getStatusIcon()}
            <span className="max-w-[80px] truncate">{isMapped ? 'Mapped' : 'Map'}</span>
          </span>

          {/* Element type icon for images */}
          {elementType === 'image' && !content && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/60">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <div className="space-y-1">
          <p className="font-medium text-xs">{getElementTypeLabel()}</p>
          {content && (
            <p className="text-xs text-muted-foreground truncate">{content.slice(0, 60)}{content.length > 60 ? '...' : ''}</p>
          )}
          <p className="text-xs text-muted-foreground">{getStatusLabel()}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
