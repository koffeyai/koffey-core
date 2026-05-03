import { useState, useCallback, useRef, useEffect } from 'react';
import { useBrowserCapabilities } from './useBrowserCapabilities';

// Web Speech API types
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface UseVoiceInputOptions {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  continuous?: boolean;
  autoSend?: boolean;
}

interface UseVoiceInputReturn {
  transcript: string;
  isRecording: boolean;
  isSupported: boolean;
  browserWarning: string | null;
  provider: 'web-speech' | 'whisper' | 'none';
  startRecording: () => void;
  stopRecording: () => void;
  clearTranscript: () => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { onTranscript, onError, continuous = false } = options;
  
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  
  const capabilities = useBrowserCapabilities();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  
  // Initialize Speech Recognition
  useEffect(() => {
    if (!capabilities.supportsVoiceInput) return;
    
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;
    
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      
      const currentTranscript = finalTranscript || interimTranscript;
      setTranscript(currentTranscript);
      
      if (finalTranscript && onTranscript) {
        onTranscript(finalTranscript);
      }
    };
    
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      
      if (onError) {
        switch (event.error) {
          case 'not-allowed':
            onError('Microphone access denied. Please allow microphone access in your browser settings.');
            break;
          case 'no-speech':
            onError('No speech detected. Please try again.');
            break;
          case 'network':
            onError('Network error. Please check your connection.');
            break;
          default:
            onError(`Voice recognition error: ${event.error}`);
        }
      }
    };
    
    recognition.onend = () => {
      setIsRecording(false);
    };
    
    recognitionRef.current = recognition;
    
    return () => {
      recognition.abort();
    };
  }, [capabilities.supportsVoiceInput, continuous, onTranscript, onError]);
  
  const startRecording = useCallback(() => {
    if (!recognitionRef.current || !capabilities.supportsVoiceInput) {
      if (capabilities.warning && onError) {
        onError(capabilities.warning);
      }
      return;
    }
    
    setTranscript('');
    setIsRecording(true);
    
    try {
      recognitionRef.current.start();
    } catch (error) {
      // Recognition might already be running
      console.warn('Speech recognition start error:', error);
      setIsRecording(false);
    }
  }, [capabilities.supportsVoiceInput, capabilities.warning, onError]);
  
  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);
  
  const clearTranscript = useCallback(() => {
    setTranscript('');
  }, []);
  
  return {
    transcript,
    isRecording,
    isSupported: capabilities.supportsVoiceInput,
    browserWarning: capabilities.warning,
    provider: capabilities.voiceProvider,
    startRecording,
    stopRecording,
    clearTranscript
  };
}
