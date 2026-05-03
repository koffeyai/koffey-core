import React, { useCallback, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, Trash2, Upload } from 'lucide-react';

interface PhotoUploadProps {
  photoUrl: string | null;
  fallbackInitial: string;
  onUpload: (file: File) => Promise<string | null>;
  onDelete: () => Promise<void>;
  isUploading?: boolean;
}

export const PhotoUpload: React.FC<PhotoUploadProps> = ({
  photoUrl,
  fallbackInitial,
  onUpload,
  onDelete,
  isUploading = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      return;
    }
    await onUpload(file);
  }, [onUpload]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    await onDelete();
    setIsDeleting(false);
  }, [onDelete]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={`relative group cursor-pointer rounded-full transition-all ${
          isDragging ? 'ring-2 ring-primary ring-offset-2' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Avatar className="h-32 w-32 border-2 border-border">
          <AvatarImage src={photoUrl || undefined} alt="Profile photo" />
          <AvatarFallback className="text-3xl bg-muted">
            {fallbackInitial}
          </AvatarFallback>
        </Avatar>
        
        {/* Overlay */}
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
          {isUploading ? (
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          ) : (
            <Camera className="h-8 w-8 text-white" />
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Upload Photo
        </Button>
        
        {photoUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-destructive hover:text-destructive"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        JPG, PNG or WebP. Max 2MB.<br />
        Click or drag to upload.
      </p>
    </div>
  );
};
