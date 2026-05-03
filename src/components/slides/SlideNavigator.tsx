import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Check, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SlideInfo {
  index: number;
  elementCount: number;
  mappedCount: number;
}

interface SlideNavigatorProps {
  slides: SlideInfo[];
  currentSlideIndex: number;
  onSlideChange: (index: number) => void;
}

export function SlideNavigator({
  slides,
  currentSlideIndex,
  onSlideChange,
}: SlideNavigatorProps) {
  const currentSlide = slides[currentSlideIndex];
  const totalElements = slides.reduce((sum, s) => sum + s.elementCount, 0);
  const totalMapped = slides.reduce((sum, s) => sum + s.mappedCount, 0);
  const progressPercent = totalElements > 0 ? (totalMapped / totalElements) * 100 : 0;

  const handlePrev = () => {
    if (currentSlideIndex > 0) {
      onSlideChange(currentSlideIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentSlideIndex < slides.length - 1) {
      onSlideChange(currentSlideIndex + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSlideChange(index);
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      onSlideChange(index - 1);
    } else if (e.key === 'ArrowRight' && index < slides.length - 1) {
      e.preventDefault();
      onSlideChange(index + 1);
    }
  };

  return (
    <div className="space-y-3">
      {/* Navigation controls */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrev}
          disabled={currentSlideIndex === 0}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>

        <span className="text-sm text-muted-foreground">
          Slide {currentSlideIndex + 1} of {slides.length}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={handleNext}
          disabled={currentSlideIndex === slides.length - 1}
          className="gap-1"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Slide thumbnails */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {slides.map((slide) => {
          const isCurrent = slide.index === currentSlideIndex;
          const isFullyMapped = slide.elementCount > 0 && slide.mappedCount === slide.elementCount;
          const hasPartialMappings = slide.mappedCount > 0 && slide.mappedCount < slide.elementCount;

          return (
            <Tooltip key={slide.index}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSlideChange(slide.index)}
                  onKeyDown={(e) => handleKeyDown(e, slide.index)}
                  className={cn(
                    'relative flex-shrink-0 w-10 h-10 rounded-md border-2 transition-all',
                    'flex items-center justify-center text-xs font-medium',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isCurrent && 'border-primary bg-primary/10 text-primary',
                    !isCurrent && isFullyMapped && 'border-green-500/60 bg-green-500/10 text-green-600',
                    !isCurrent && hasPartialMappings && 'border-yellow-500/60 bg-yellow-500/10 text-yellow-600',
                    !isCurrent && !isFullyMapped && !hasPartialMappings && 'border-muted bg-muted/50 text-muted-foreground hover:border-muted-foreground/40'
                  )}
                  aria-label={`Go to slide ${slide.index + 1}`}
                  aria-current={isCurrent ? 'true' : undefined}
                >
                  {slide.index + 1}

                  {/* Status indicator */}
                  <span className="absolute -top-1 -right-1">
                    {isFullyMapped ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : hasPartialMappings ? (
                      <Circle className="h-2 w-2 fill-yellow-500 text-yellow-500" />
                    ) : null}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  Slide {slide.index + 1}: {slide.mappedCount}/{slide.elementCount} elements mapped
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Progress indicator */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Overall Progress</span>
          <span>{totalMapped} of {totalElements} elements mapped</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Current slide info */}
      {currentSlide && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>This slide:</span>
          <span className={cn(
            'font-medium',
            currentSlide.mappedCount === currentSlide.elementCount && currentSlide.elementCount > 0 && 'text-green-600',
            currentSlide.mappedCount > 0 && currentSlide.mappedCount < currentSlide.elementCount && 'text-yellow-600',
          )}>
            {currentSlide.mappedCount}/{currentSlide.elementCount} mapped
          </span>
        </div>
      )}
    </div>
  );
}
