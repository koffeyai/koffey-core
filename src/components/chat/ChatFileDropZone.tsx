import React, { useCallback, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatFileDropZoneProps {
  children: React.ReactNode;
  onFilesDrop?: (files: File[]) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  overlayClassName?: string;
  label?: string;
  description?: string;
}

const hasDraggedFiles = (event: React.DragEvent<HTMLDivElement>) => {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
};

export const ChatFileDropZone: React.FC<ChatFileDropZoneProps> = ({
  children,
  onFilesDrop,
  disabled = false,
  className,
  overlayClassName,
  label = 'Drop document to import',
  description = 'PDF, Word, text, email, or image files up to 20MB',
}) => {
  const [dragDepth, setDragDepth] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const canDrop = Boolean(onFilesDrop) && !disabled;

  const resetDragState = useCallback(() => {
    setDragDepth(0);
    setIsDragActive(false);
  }, []);

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!canDrop || !hasDraggedFiles(event)) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setDragDepth((current) => current + 1);
    setIsDragActive(true);
  }, [canDrop]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!canDrop || !hasDraggedFiles(event)) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, [canDrop]);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!canDrop || !hasDraggedFiles(event)) return;

    event.preventDefault();
    event.stopPropagation();
    setDragDepth((current) => {
      const next = Math.max(0, current - 1);
      if (next === 0) setIsDragActive(false);
      return next;
    });
  }, [canDrop]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!canDrop || !hasDraggedFiles(event)) return;

    event.preventDefault();
    event.stopPropagation();
    resetDragState();

    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) {
      void onFilesDrop?.(files);
    }
  }, [canDrop, onFilesDrop, resetDragState]);

  return (
    <div
      className={cn('relative', className)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {canDrop && isDragActive && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/90 p-4 text-center shadow-lg backdrop-blur-sm',
            overlayClassName
          )}
          aria-live="polite"
        >
          <div className="flex max-w-sm flex-col items-center gap-2">
            <UploadCloud className="h-7 w-7 text-primary" />
            <div className="text-sm font-semibold text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground">{description}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatFileDropZone;
