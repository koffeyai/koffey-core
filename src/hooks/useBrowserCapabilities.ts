// Browser capability detection for voice features
export interface BrowserCapabilities {
  isIOS: boolean;
  isSafari: boolean;
  isWebKit: boolean;
  hasSpeechRecognition: boolean;
  hasMediaRecorder: boolean;
  supportsVoiceInput: boolean;
  voiceProvider: 'web-speech' | 'whisper' | 'none';
  warning: string | null;
}

export function useBrowserCapabilities(): BrowserCapabilities {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  
  // Detect iOS (all browsers on iOS use WebKit)
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  // Detect Safari
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  
  // Detect WebKit (iOS forces all browsers to use WebKit)
  const isWebKit = /AppleWebKit/.test(userAgent) && !/Chrome/.test(userAgent);
  
  // Check for Speech Recognition API
  const hasSpeechRecognition = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  
  // Check for MediaRecorder (needed for Whisper fallback)
  const hasMediaRecorder = typeof window !== 'undefined' && 'MediaRecorder' in window;
  
  // Determine if voice input is supported
  // iOS WebKit doesn't reliably support Web Speech API
  const supportsVoiceInput = hasSpeechRecognition && !isIOS;
  
  // Determine which provider to use
  let voiceProvider: 'web-speech' | 'whisper' | 'none' = 'none';
  let warning: string | null = null;
  
  if (supportsVoiceInput) {
    voiceProvider = 'web-speech';
  } else if (isIOS) {
    warning = 'Voice input is optimized for Desktop Chrome & Android. iOS support coming soon!';
    // Future: if hasMediaRecorder, we could use Whisper
    voiceProvider = 'none';
  } else if (!hasSpeechRecognition) {
    warning = 'Your browser doesn\'t support voice input. Try Chrome or Edge for the best experience.';
    voiceProvider = 'none';
  }
  
  return {
    isIOS,
    isSafari,
    isWebKit,
    hasSpeechRecognition,
    hasMediaRecorder,
    supportsVoiceInput,
    voiceProvider,
    warning
  };
}
