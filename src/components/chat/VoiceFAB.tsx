import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceFABProps {
  isRecording: boolean;
  isSupported: boolean;
  onPress: () => void;
  onRelease: () => void;
  disabled?: boolean;
}

export const VoiceFAB: React.FC<VoiceFABProps> = ({
  isRecording,
  isSupported,
  onPress,
  onRelease,
  disabled = false
}) => {
  if (!isSupported) return null;
  
  return (
    <button
      className={cn(
        "fixed bottom-24 right-6 w-16 h-16 rounded-full shadow-xl z-50",
        "flex items-center justify-center transition-all duration-200",
        "active:scale-95 touch-none select-none",
        isRecording 
          ? "bg-destructive animate-pulse" 
          : "bg-primary hover:bg-primary/90",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      onTouchStart={(e) => {
        e.preventDefault();
        if (!disabled) onPress();
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        if (!disabled) onRelease();
      }}
      onMouseDown={() => {
        if (!disabled) onPress();
      }}
      onMouseUp={() => {
        if (!disabled) onRelease();
      }}
      onMouseLeave={() => {
        if (isRecording && !disabled) onRelease();
      }}
      disabled={disabled}
      aria-label={isRecording ? "Release to send" : "Hold to speak"}
    >
      {isRecording ? (
        <MicOff className="w-8 h-8 text-destructive-foreground" />
      ) : (
        <Mic className="w-8 h-8 text-primary-foreground" />
      )}
      
      {/* Recording indicator ring */}
      {isRecording && (
        <span className="absolute inset-0 rounded-full border-4 border-destructive-foreground/50 animate-ping" />
      )}
    </button>
  );
};

export default VoiceFAB;
