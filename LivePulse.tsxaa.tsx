import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ArrowPathIcon, ExclamationCircleIcon, MicrophoneIcon } from '@heroicons/react/24/solid';

interface LivePulseProps {
  apiKey: string;
  onClose: () => void;
  language: string;
}

const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';

const LivePulse: React.FC<LivePulseProps> = ({ apiKey, onClose, language }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0); 
  
  // Refs for audio processing
  const volumeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Visualizer Refs
  const ring1Ref = useRef<HTMLDivElement>(null);
  const ring2Ref = useRef<HTMLDivElement>(null);
  const ring3Ref = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    let cleanup = () => {};

    const startSession = async () => {
      // 1. API Key Validation
      if (!apiKey) {
          setStatus('error');
          setErrorMessage("Authorization Failed: API Key is missing.");
          return;
      }

      setStatus('connecting');
      setErrorMessage(null);

      try {
        const ai = new GoogleGenAI({ apiKey });
        
        // ------------------------------------------------------------
        // 2. Audio System Initialization (Crystal Clear Output)
        // ------------------------------------------------------------
        let inputAudioContext: AudioContext;
        let outputAudioContext: AudioContext;

        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) {
                throw new Error("Your browser does not support Web Audio API.");
            }

            // Input: Force 16kHz for Gemini compatibility
            inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
            
            // Output: Use system native sample rate for high fidelity
            outputAudioContext = new AudioContextClass();
            audioContextRef.current = outputAudioContext;

            if (outputAudioContext.state === 'suspended') {
                await outputAudioContext.resume().catch(() => {
                     throw new Error("Audio playback blocked. Please click the page and try again.");
                });
            }
        } catch (e: any) {
            throw new Error(`Audio System Error: ${e.message}`);
        }

        // Add Dynamics Compressor for broadcast-quality consistent volume
        const compressor = outputAudioContext.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, outputAudioContext.currentTime);
        compressor.knee.setValueAtTime(30, outputAudioContext.currentTime);
        compressor.ratio.setValueAtTime(12, outputAudioContext.currentTime);
        compressor.attack.setValueAtTime(0.003, outputAudioContext.currentTime);
        compressor.release.setValueAtTime(0.25, outputAudioContext.currentTime);
        compressor.connect(outputAudioContext.destination);

        const outputNode = outputAudioContext.createGain();
        outputNode.gain.value = 1.0; // Master volume
        outputNode.connect(compressor);
        
        // ------------------------------------------------------------
        // 3. Microphone Setup (Robust Error Handling)
        // ------------------------------------------------------------
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true, // Balances soft/loud voices
                    channelCount: 1,
                    sampleRate: 16000 
                } 
            });
            streamRef.current = stream;
        } catch (err: any) {
            let msg = "Microphone error.";
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                msg = "Access Denied: Please allow microphone permissions in your browser settings.";
            } else if (err.name === 'NotFoundError') {
                msg = "No Microphone Detected: Please check your audio input device.";
            } else if (err.name === 'NotReadableError') {
                msg = "Hardware Error: Microphone is busy or invalid.";
            } else if (err.name === 'OverconstrainedError') {
                 msg = "Audio Config Error: The requested microphone settings are not supported.";
            }
            throw new Error(msg);
        }
        
        // Audio Scheduling Cursor
        let nextStartTime = 0;

        // Helper: Base64 Decode
        const decode = (base64: string) => {
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes;
        };

        // Helper: Convert PCM Float32 to AudioBuffer correctly
        const decodeAudioData = (data: Uint8Array, ctx: AudioContext) => {
          // Gemini returns 16-bit PCM at 24kHz
          const int16Data = new Int16Array(data.buffer);
          const float32Data = new Float32Array(int16Data.length);
          
          for (let i = 0; i < int16Data.length; i++) {
             float32Data[i] = int16Data[i] / 32768.0;
          }
          
          // CRITICAL: Tell the AudioBuffer that this content is 24kHz.
          const buffer = ctx.createBuffer(1, float32Data.length, 24000);
          buffer.getChannelData(0).set(float32Data);
          return buffer;
        };

        // Helper: Create PCM Blob for sending (Float32 -> Int16)
        const createPcmBlob = (data: Float32Array) => {
            const int16 = new Int16Array(data.length);
            for (let i = 0; i < data.length; i++) {
                // Soft clipping to prevent harsh distortion
                let s = Math.max(-1, Math.min(1, data[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            // Convert to Base64 manually for efficiency
            let binary = '';
            const bytes = new Uint8Array(int16.buffer);
            const len = bytes.byteLength;
            for(let i=0; i<len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return {
                data: btoa(binary),
                mimeType: 'audio/pcm;rate=16000'
            };
        };

        // ------------------------------------------------------------
        // 4. Connect to Gemini Live
        // ------------------------------------------------------------
        const sessionPromise = ai.live.connect({
          model: LIVE_MODEL,
          callbacks: {
            onopen: () => {
              setStatus('connected');
              setErrorMessage(null);
              
              const source = inputAudioContext.createMediaStreamSource(stream);
              
              // Reduced buffer size (2048) for lower latency (~128ms at 16k)
              const scriptProcessor = inputAudioContext.createScriptProcessor(2048, 1, 1);
              
              scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Calculate RMS Volume for Visualizer
                let sum = 0;
                // Sample every 4th point for performance
                for(let i=0; i<inputData.length; i+=4) { 
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / (inputData.length / 4));
                volumeRef.current = rms;

                const pcmData = createPcmBlob(inputData);
                sessionPromise.then(session => session.sendRealtimeInput({ media: pcmData }));
              };
              
              source.connect(scriptProcessor);
              scriptProcessor.connect(inputAudioContext.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
              // Handle Interruption
              if (message.serverContent?.interrupted) {
                  sourcesRef.current.forEach(source => {
                      try { source.stop(); } catch(e) {}
                  });
                  sourcesRef.current.clear();
                  nextStartTime = 0; 
                  return;
              }

              // Handle Audio Output
              const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
              if (audioData) {
                 const audioBuffer = decodeAudioData(decode(audioData), outputAudioContext);
                 
                 const currentTime = outputAudioContext.currentTime;
                 
                 // Jitter Handling:
                 // If next scheduled time is in the past, reset it to "now" + small buffer
                 if (nextStartTime < currentTime) {
                     nextStartTime = currentTime + 0.05; // 50ms buffer
                 }
                 // If next scheduled time is WAY in the future (>500ms), probably a drift error, clamp it.
                 if (nextStartTime > currentTime + 0.5) {
                     nextStartTime = currentTime + 0.05;
                 }

                 const source = outputAudioContext.createBufferSource();
                 source.buffer = audioBuffer;
                 source.connect(outputNode);
                 
                 source.start(nextStartTime);
                 nextStartTime += audioBuffer.duration;
                 
                 sourcesRef.current.add(source);
                 source.onended = () => sourcesRef.current.delete(source);
              }
            },
            onclose: (e) => {
                console.log("Session closed", e);
                // We don't trigger error on normal close, but could handle unexpected closes here
            },
            onerror: (e: any) => {
                console.error("Session error:", e);
                setStatus('error');
                
                let displayMsg = "Connection to NexusAI Lost.";
                const errStr = e.message || e.toString();

                if (errStr.includes("403") || errStr.includes("401")) {
                    displayMsg = "Authentication Error: Invalid API Key or Permissions.";
                } else if (errStr.includes("404")) {
                    displayMsg = "Service Not Found: The selected model is unavailable.";
                } else if (errStr.includes("503")) {
                    displayMsg = "Server Busy: High traffic on Gemini Live API. Please retry.";
                } else if (errStr.includes("network") || errStr.includes("fetch")) {
                    displayMsg = "Network Error: Please check your internet connection.";
                }
                
                setErrorMessage(displayMsg);
            }
          },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            systemInstruction: `You are NexusAI Live. Have a natural, flowing conversation. 
            Be concise. Do not use markdown formatting in your speech. 
            React with empathy. Speak in ${language}.`,
          }
        });

        cleanup = () => {
             if (streamRef.current) {
                 streamRef.current.getTracks().forEach(track => track.stop());
             }
             if (inputAudioContext) inputAudioContext.close();
             if (outputAudioContext) outputAudioContext.close();
             sessionPromise.then(s => s.close());
             if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };

      } catch (err: any) {
        console.error("Initialization Error:", err);
        setStatus('error');
        setErrorMessage(err.message || "An unexpected error occurred while connecting.");
      }
    };

    startSession();

    return () => cleanup();
  }, [apiKey, language, retryCount]); 

  // Visualizer Loop
  useEffect(() => {
      const animate = () => {
          const rawVol = volumeRef.current;
          const vol = Math.min(Math.pow(rawVol * 5, 0.8), 1); 

          if (ring1Ref.current && ring2Ref.current && ring3Ref.current) {
              ring1Ref.current.style.transform = `scale(${1 + vol * 0.4})`;
              ring1Ref.current.style.borderColor = `rgba(34, 211, 238, ${0.4 + vol * 0.6})`;
              
              ring2Ref.current.style.transform = `scale(${1 + vol * 0.8})`;
              ring2Ref.current.style.borderColor = `rgba(168, 85, 247, ${0.3 + vol * 0.4})`;
              
              ring3Ref.current.style.transform = `scale(${1 + vol * 1.5})`;
              ring3Ref.current.style.opacity = `${0.1 + vol * 0.4}`;
          }
          
          if (coreRef.current) {
              const glowSize = 40 + vol * 60;
              const opacity = 0.5 + vol * 0.5;
              coreRef.current.style.boxShadow = `0 0 ${glowSize}px rgba(139, 92, 246, ${opacity})`;
          }

          animationFrameRef.current = requestAnimationFrame(animate);
      };
      
      animate();
      return () => cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 flex flex-col items-center justify-center text-white backdrop-blur-xl transition-all duration-500">
      <div className="absolute top-6 right-6">
        <button 
            onClick={onClose} 
            className="group bg-white/5 hover:bg-white/10 p-3 rounded-full text-white transition-all border border-white/10 hover:border-white/20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 group-hover:rotate-90 transition-transform">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="text-center mb-16 space-y-2 animate-fade-in-up">
        <h2 className="text-4xl font-bold bg-gradient-to-r from-nexus to-cyan-400 bg-clip-text text-transparent tracking-tight">
            NexusAI Live
        </h2>
        <p className="text-slate-400 font-medium">Real-time Neural Voice Interface</p>
      </div>

      <div className="relative w-80 h-80 flex items-center justify-center">
         <div 
            ref={ring3Ref}
            className={`absolute inset-0 rounded-full border border-indigo-500/20 shadow-[0_0_80px_rgba(99,102,241,0.1)] transition-transform duration-100 ease-out will-change-transform ${status === 'error' ? 'opacity-10' : ''}`}
         ></div>
         <div 
            ref={ring2Ref}
            className={`absolute inset-8 rounded-full border border-purple-500/30 shadow-[0_0_60px_rgba(168,85,247,0.2)] transition-transform duration-100 ease-out will-change-transform ${status === 'error' ? 'opacity-10' : ''}`}
         ></div>
         <div 
            ref={ring1Ref}
            className={`absolute inset-16 rounded-full border border-cyan-400/40 shadow-[0_0_40px_rgba(34,211,238,0.3)] transition-transform duration-100 ease-out will-change-transform ${status === 'error' ? 'opacity-10' : ''}`}
         ></div>
         
         <div 
            ref={coreRef}
            className={`w-36 h-36 rounded-full bg-gradient-to-br shadow-[0_0_60px_rgba(139,92,246,0.5)] flex items-center justify-center z-10 relative overflow-hidden transition-all duration-500 
            ${status === 'connecting' ? 'from-nexus to-cyan-600 scale-90 opacity-80' : ''}
            ${status === 'connected' ? 'from-nexus to-cyan-600 scale-100 opacity-100' : ''}
            ${status === 'error' ? 'from-red-600 to-red-800 scale-100 opacity-100 shadow-[0_0_60px_rgba(220,38,38,0.5)]' : ''}`}
         >
             <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
             
             {status === 'connecting' && (
                 <div className="absolute inset-0 flex items-center justify-center">
                     <div className="w-24 h-24 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                 </div>
             )}
             
             {status === 'connected' && (
                 <div className="animate-pulse-slow">
                     <MicrophoneIcon className="w-12 h-12 text-white drop-shadow-lg" />
                 </div>
             )}
             
             {status === 'error' && (
                 <div className="flex flex-col items-center animate-bounce-small">
                     <ExclamationCircleIcon className="w-12 h-12 text-white drop-shadow-lg" />
                 </div>
             )}
         </div>
      </div>

      <div className="mt-16 flex flex-col items-center gap-4 w-full max-w-lg px-6">
          <div className={`flex flex-col items-center justify-center gap-2 px-6 py-3 rounded-2xl border backdrop-blur-md transition-colors duration-300 w-full text-center ${
              status === 'error' ? 'bg-red-500/10 border-red-500/20' : 'bg-white/5 border-white/10'
          }`}>
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status === 'connected' ? 'bg-green-500 animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                <span className={`text-sm font-bold tracking-wide uppercase ${status === 'error' ? 'text-red-300' : 'text-slate-300'}`}>
                    {status === 'connected' ? 'Listening Active' : status === 'error' ? 'System Error' : 'Initializing Uplink...'}
                </span>
            </div>
            {status === 'error' && (
                <p className="text-sm text-red-200 mt-1">{errorMessage || 'Unknown Connection Error'}</p>
            )}
          </div>

          {status === 'error' && (
            <button 
                onClick={handleRetry}
                className="flex items-center gap-2 px-6 py-2 bg-white text-slate-900 rounded-full font-semibold hover:bg-slate-200 transition-colors shadow-lg shadow-white/10"
            >
                <ArrowPathIcon className="w-4 h-4" />
                Retry Connection
            </button>
          )}
      </div>
    </div>
  );
};

export default LivePulse;