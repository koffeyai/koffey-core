import React, { useState, useRef, useCallback } from 'react';
import { Info, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface StakeholderQuadrantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName: string;
  initialSupport?: number | null;
  initialInfluence?: number | null;
  onSave: (support: number, influence: number) => void;
  isSaving?: boolean;
}

interface Position {
  x: number; // -1 to 1 (Adversarial to Champion)
  y: number; // -1 to 1 (Peripheral to Influential)
}

const QUADRANT_LABELS = {
  topLeft: { title: 'Blocker', subtitle: 'Adversarial & Influential', color: 'bg-red-500/20' },
  topRight: { title: 'Champion', subtitle: 'Champion & Influential', color: 'bg-green-500/20' },
  bottomLeft: { title: 'Tactical Blocker', subtitle: 'Adversarial & Peripheral', color: 'bg-yellow-500/20' },
  bottomRight: { title: 'Supporter', subtitle: 'Champion & Peripheral', color: 'bg-emerald-500/20' },
};

export function StakeholderQuadrant({
  open,
  onOpenChange,
  contactName,
  initialSupport,
  initialInfluence,
  onSave,
  isSaving = false,
}: StakeholderQuadrantProps) {
  const [position, setPosition] = useState<Position>({
    x: initialSupport ?? 0,
    y: initialInfluence ?? 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Convert pixel coordinates to -1 to 1 range
  const pixelToPosition = useCallback((clientX: number, clientY: number): Position => {
    if (!gridRef.current) return { x: 0, y: 0 };
    
    const rect = gridRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1); // Invert Y
    
    return {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
    };
  }, []);

  // Handle mouse/touch events
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const pos = pixelToPosition(e.clientX, e.clientY);
    setPosition(pos);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pixelToPosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const pos = pixelToPosition(e.clientX, e.clientY);
    setPosition(pos);
  }, [isDragging, pixelToPosition]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Quick-select quadrant center
  const selectQuadrant = (quadrant: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight') => {
    const positions: Record<string, Position> = {
      topLeft: { x: -0.5, y: 0.5 },
      topRight: { x: 0.5, y: 0.5 },
      bottomLeft: { x: -0.5, y: -0.5 },
      bottomRight: { x: 0.5, y: -0.5 },
    };
    setPosition(positions[quadrant]);
  };

  const handleSave = () => {
    onSave(position.x, position.y);
  };

  // Convert position to percentage for marker placement
  const markerStyle = {
    left: `${((position.x + 1) / 2) * 100}%`,
    top: `${((1 - position.y) / 2) * 100}%`, // Invert Y for CSS
  };

  // Determine current quadrant for label
  const currentQuadrant = position.x >= 0
    ? position.y >= 0 ? 'Champion (Influential)' : 'Supporter (Peripheral)'
    : position.y >= 0 ? 'Blocker (Influential)' : 'Tactical Blocker (Peripheral)';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Rank Stakeholder
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">
                    Ranking stakeholders helps SCOUTPAD assess your political coverage and deal strength.
                    Champions with influence are your best assets; adversaries with influence are risks to address.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription>
            Click or drag to position <span className="font-medium text-foreground">{contactName}</span> on the influence map
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick Select Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="justify-start text-red-400 hover:bg-red-500/10"
              onClick={() => selectQuadrant('topLeft')}
            >
              🔴 Blocker
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="justify-start text-green-400 hover:bg-green-500/10"
              onClick={() => selectQuadrant('topRight')}
            >
              🟢 Champion
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="justify-start text-yellow-400 hover:bg-yellow-500/10"
              onClick={() => selectQuadrant('bottomLeft')}
            >
              ⚪ Tactical Blocker
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="justify-start text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => selectQuadrant('bottomRight')}
            >
              🟡 Supporter
            </Button>
          </div>

          {/* Interactive Quadrant Grid */}
          <div className="relative aspect-square select-none">
            {/* Axis Labels */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-muted-foreground font-medium">
              INFLUENTIAL
            </div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-muted-foreground font-medium">
              PERIPHERAL
            </div>
            <div className="absolute -left-2 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-muted-foreground font-medium whitespace-nowrap">
              ADVERSARIAL
            </div>
            <div className="absolute -right-2 top-1/2 -translate-y-1/2 rotate-90 text-xs text-muted-foreground font-medium whitespace-nowrap">
              CHAMPION
            </div>

            {/* Grid Container */}
            <div
              ref={gridRef}
              className="w-full h-full rounded-lg border border-border overflow-hidden cursor-crosshair touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {/* Quadrant Backgrounds */}
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                <div className={cn("border-r border-b border-border/50", QUADRANT_LABELS.topLeft.color)} />
                <div className={cn("border-b border-border/50", QUADRANT_LABELS.topRight.color)} />
                <div className={cn("border-r border-border/50", QUADRANT_LABELS.bottomLeft.color)} />
                <div className={QUADRANT_LABELS.bottomRight.color} />
              </div>

              {/* Axis Lines */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-border" />

              {/* Quadrant Labels */}
              <div className="absolute top-2 left-2 text-xs font-medium text-red-400/70">Blocker</div>
              <div className="absolute top-2 right-2 text-xs font-medium text-green-400/70">Champion</div>
              <div className="absolute bottom-2 left-2 text-xs font-medium text-yellow-400/70">Tactical Blocker</div>
              <div className="absolute bottom-2 right-2 text-xs font-medium text-emerald-400/70">Supporter</div>

              {/* Position Marker */}
              <div
                className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={markerStyle}
              >
                <div className={cn(
                  "w-full h-full rounded-full border-2 flex items-center justify-center transition-all",
                  isDragging ? "scale-125 border-primary bg-primary/30" : "border-primary bg-primary/20"
                )}>
                  <Target className="w-3 h-3 text-primary" />
                </div>
              </div>
            </div>
          </div>

          {/* Current Position Display */}
          <div className="text-center">
            <span className="text-sm text-muted-foreground">Current position: </span>
            <span className="text-sm font-medium text-foreground">{currentQuadrant}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Ranking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
