import React, { useState, useEffect, useRef } from 'react';
import { MicrophoneIcon, StopIcon } from '@heroicons/react/24/solid';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  isProcessing: boolean;
  language: string;
}

const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, isProcessing, language }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = language;
      
      setIsSupported(true);
    }
  }, []);

  // Update language dynamically if it changes
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = language;
    }
  }, [language]);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        onTranscript(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [onTranscript]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
        setIsListening(false);
      }
    }
  };

  if (!isSupported) {
    return null; 
  }

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={isProcessing}
      className={`p-3 rounded-full transition-all duration-300 ${
        isListening
          ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50'
          : 'bg-slate-200 text-slate-600 hover:bg-nexus hover:text-white'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      title={isListening ? "Stop Dictation" : "Start Dictation"}
    >
      {isListening ? (
        <StopIcon className="h-6 w-6" />
      ) : (
        <MicrophoneIcon className="h-6 w-6" />
      )}
    </button>
  );
};

export default VoiceInput;
