
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { runMultiAgentSystem, generateImage, editImage, analyzeVideo, generateVideo, transcribeAudio } from './services/geminiService';
import { memoryBank } from './services/memoryService';
import { AgentDomain, Message, Sentiment, ChartDataPoints, ExecutionMode, PausedState, UserContext, EvaluationResult, AgentMetric } from './types';
import Dashboard from './components/Dashboard';
import AgentVisualizer from './components/AgentVisualizer';
import VoiceInput from './components/VoiceInput';
import LivePulse from './components/LivePulse';
import { 
  PaperAirplaneIcon, 
  SparklesIcon,
  Bars3Icon,
  XMarkIcon,
  LightBulbIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  BoltIcon,
  PhotoIcon,
  VideoCameraIcon,
  ChatBubbleBottomCenterTextIcon,
  CpuChipIcon,
  MicrophoneIcon,
  FilmIcon,
  KeyIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  PauseIcon,
  PlayIcon,
  WrenchScrewdriverIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  Cog6ToothIcon,
  HeartIcon,
  AcademicCapIcon,
  GlobeAmericasIcon,
  CodeBracketIcon
} from '@heroicons/react/24/solid';

type InteractionMode = 'chat' | 'image' | 'image_edit' | 'video_analysis' | 'video_generation' | 'audio_transcription';

const getEnvApiKey = () => {
  try {
    return typeof process !== 'undefined' && process.env ? process.env.API_KEY : '';
  } catch (e) {
    return '';
  }
};

const LANGUAGES = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'es-ES', name: 'Spanish' },
    { code: 'fr-FR', name: 'French' },
    { code: 'de-DE', name: 'German' },
    { code: 'ja-JP', name: 'Japanese' },
    { code: 'ko-KR', name: 'Korean' },
    { code: 'zh-CN', name: 'Chinese' },
    { code: 'ru-RU', name: 'Russian' },
    { code: 'pt-BR', name: 'Portuguese' },
    { code: 'it-IT', name: 'Italian' },
    { code: 'nl-NL', name: 'Dutch' },
    { code: 'pl-PL', name: 'Polish' },
    { code: 'tr-TR', name: 'Turkish' },
    { code: 'ar-SA', name: 'Arabic' }
];

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAgents, setActiveAgents] = useState<AgentDomain[]>([AgentDomain.ORCHESTRATOR]);
  const [executionMode, setExecutionMode] = useState<ExecutionMode | undefined>(undefined);
  const [logs, setLogs] = useState<string[]>(["System initialized.", "Connecting to Memory Bank...", "Cloud agents online."]);
  const [showApiKeyModal, setShowApiKeyModal] = useState(true);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'dashboard'>('chat');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const [latestInsight, setLatestInsight] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<ChartDataPoints | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLiveChat, setShowLiveChat] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [language, setLanguage] = useState('en-US');
  
  // New Features State
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('chat');
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(false);
  const [isFastMode, setIsFastMode] = useState(false);
  const [imageConfig, setImageConfig] = useState({ size: '1K' as '1K'|'2K'|'4K', aspectRatio: '1:1' });
  const [videoConfig, setVideoConfig] = useState({ aspectRatio: '16:9' as '16:9' | '9:16' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [userContext, setUserContext] = useState<UserContext | null>(null);

  // Observability State
  const [currentEvaluation, setCurrentEvaluation] = useState<EvaluationResult | undefined>(undefined);
  const [currentMetrics, setCurrentMetrics] = useState<AgentMetric[] | undefined>(undefined);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  useEffect(() => {
    setUserContext(memoryBank.getContext());
  }, []);

  useEffect(() => {
    const initKey = async () => {
      const envKey = getEnvApiKey();
      if ((window as any).aistudio) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (hasKey && envKey) {
          setApiKey(envKey);
          setShowApiKeyModal(false);
        }
      } else if (envKey) {
        setApiKey(envKey);
        setShowApiKeyModal(false);
      }
    };
    initKey();
  }, []);

  const addLog = (text: string) => {
    setLogs(prev => [text, ...prev].slice(0, 50));
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const processResponse = (result: any) => {
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: result.response,
      timestamp: Date.now(),
      metadata: {
        activeAgents: result.activeAgents,
        executionMode: result.executionMode,
        sentiment: result.sentiment,
        reasoning: result.reasoning,
        crossDomainInsight: result.crossDomainInsight,
        isThinking: isThinkingEnabled && interactionMode === 'chat',
        chartData: result.chartData,
        pausedState: result.pausedState,
        toolCalls: result.toolCalls,
        evaluation: result.evaluation,
        metrics: result.metrics
      }
    };

    if (result.crossDomainInsight) setLatestInsight(result.crossDomainInsight);
    if (result.chartData) setDashboardData(result.chartData);
    if (result.evaluation) setCurrentEvaluation(result.evaluation);
    if (result.metrics) setCurrentMetrics(result.metrics);

    if (result.toolCalls) {
        result.toolCalls.forEach((tool: string) => {
           addLog(`Tool Execution: ${tool}`);
           if (tool === 'updateMemory') {
              setUserContext(memoryBank.getContext());
              addLog("System: Memory Bank updated.");
           }
        });
    }

    setMessages(prev => [...prev, assistantMsg]);
    setActiveAgents(result.activeAgents || [AgentDomain.ORCHESTRATOR]);
    setExecutionMode(result.executionMode);
    
    if (isTtsEnabled) speakResponse(result.response);
  };

  const handleSendMessage = async (text: string = inputText, resumeState?: PausedState) => {
    const envKey = getEnvApiKey();
    const effectiveApiKey = envKey || apiKey;

    if (!resumeState) {
        if ((!text.trim() && interactionMode !== 'video_analysis' && interactionMode !== 'audio_transcription') || !effectiveApiKey) {
            if (!effectiveApiKey && showApiKeyModal) return;
            if (!effectiveApiKey && (window as any).aistudio) {
                try {
                    await (window as any).aistudio.openSelectKey();
                    const newEnvKey = getEnvApiKey();
                    if (newEnvKey) setApiKey(newEnvKey);
                } catch (e) { console.error(e); }
                return;
            }
            return;
        }
    }
    
    if (!resumeState) {
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            timestamp: Date.now(),
            metadata: { activeAgents: [AgentDomain.ORCHESTRATOR] }
        };
        
        if (interactionMode === 'video_analysis' && selectedFile) {
            userMsg.content = `[Video Analysis Request] ${selectedFile.name}: ${text}`;
        } else if (interactionMode === 'audio_transcription' && selectedFile) {
            userMsg.content = `[Audio Transcription] ${selectedFile.name}`;
        } else if (interactionMode === 'image') {
            userMsg.content = `[Image Generation] ${text}`;
        } else if (interactionMode === 'image_edit' && selectedFile) {
            userMsg.content = `[Image Edit] ${text}`;
        } else if (interactionMode === 'video_generation') {
            userMsg.content = `[Video Generation] ${text}`;
        }
        
        setMessages(prev => [...prev, userMsg]);
        setInputText('');
    }

    setIsProcessing(true);
    setExecutionMode(resumeState ? ExecutionMode.SEQUENTIAL : ExecutionMode.PLANNING);

    try {
      if (interactionMode === 'image' && !resumeState) {
          addLog("System: Generating Image...");
          const base64Image = await generateImage(text, effectiveApiKey, imageConfig.size, imageConfig.aspectRatio);
          processResponse({
              response: "Here is the generated image based on your prompt.",
              activeAgents: [AgentDomain.ENVIRONMENT],
              sentiment: Sentiment.POSITIVE,
              executionMode: ExecutionMode.DIRECT,
              metadata: { generatedImage: base64Image }
          });
          setMessages(prev => {
              const last = prev[prev.length - 1];
              last.metadata = { ...last.metadata, generatedImage: base64Image };
              return [...prev.slice(0, -1), last];
          });
      }
      else if (interactionMode === 'image_edit' && selectedFile && !resumeState) {
          addLog("System: Editing Image...");
          const base64Image = await editImage(selectedFile, text, effectiveApiKey);
          processResponse({
              response: "Here is the edited image.",
              activeAgents: [AgentDomain.ENVIRONMENT],
              sentiment: Sentiment.POSITIVE,
              executionMode: ExecutionMode.DIRECT,
              metadata: { generatedImage: base64Image }
          });
          setMessages(prev => {
              const last = prev[prev.length - 1];
              last.metadata = { ...last.metadata, generatedImage: base64Image };
              return [...prev.slice(0, -1), last];
          });
      }
      else if (interactionMode === 'video_generation' && !resumeState) {
           addLog("System: Generating Video with Veo...");
           try {
               const videoUrl = await generateVideo(text, effectiveApiKey, videoConfig.aspectRatio);
               processResponse({
                  response: "Video generated successfully.",
                  activeAgents: [AgentDomain.ENVIRONMENT],
                  sentiment: Sentiment.POSITIVE,
                  executionMode: ExecutionMode.DIRECT
               });
               setMessages(prev => {
                  const last = prev[prev.length - 1];
                  last.metadata = { ...last.metadata, generatedVideo: videoUrl };
                  return [...prev.slice(0, -1), last];
               });
           } catch (e: any) {
               if (e.message.includes('404') || e.message.includes('not found')) {
                   processResponse({
                       response: "Veo Video Generation requires a paid API key (Google Cloud Project with billing enabled). Please upgrade your key.",
                       sentiment: Sentiment.NEUTRAL,
                       activeAgents: [AgentDomain.ORCHESTRATOR],
                       executionMode: ExecutionMode.DIRECT
                   });
                   await (window as any).aistudio.openSelectKey(); 
               } else { throw e; }
           }
      } 
      else if (interactionMode === 'video_analysis' && selectedFile && !resumeState) {
          addLog("System: Analyzing Video...");
          const analysis = await analyzeVideo(text, selectedFile, effectiveApiKey, language);
          processResponse({ ...analysis, activeAgents: [AgentDomain.EDUCATION], executionMode: ExecutionMode.DIRECT });
      }
      else if (interactionMode === 'audio_transcription' && selectedFile && !resumeState) {
          addLog("System: Transcribing Audio...");
          const transcript = await transcribeAudio(selectedFile, effectiveApiKey, language);
          processResponse({ ...transcript, activeAgents: [AgentDomain.EDUCATION], executionMode: ExecutionMode.DIRECT });
      }
      else {
          const history = messages.map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
          }));

          const result = await runMultiAgentSystem(
              text, 
              history, 
              effectiveApiKey, 
              language,
              addLog,
              isThinkingEnabled,
              resumeState
          );
          processResponse(result);
      }

    } catch (error: any) {
      console.error(error);
      addLog(`Error: ${error.message}`);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `I encountered an error: ${error.message}. Please check your API key and try again.`,
        timestamp: Date.now(),
        metadata: { sentiment: Sentiment.NEGATIVE }
      }]);
    } finally {
      setIsProcessing(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const speakResponse = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.startsWith(language.split('-')[0]));
    if (preferredVoice) utterance.voice = preferredVoice;
    window.speechSynthesis.speak(utterance);
  }, [language]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      addLog(`File selected: ${e.target.files[0].name}`);
    }
  };

  const SuggestionCard = ({ icon: Icon, title, onClick, color }: any) => (
      <button onClick={onClick} className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all hover:border-nexus/30 group text-left w-full">
          <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center shrink-0`}>
             <Icon className="w-5 h-5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-700 group-hover:text-nexus transition-colors">{title}</span>
      </button>
  );

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 relative overflow-hidden font-sans">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 lg:px-6 shadow-sm z-20 shrink-0">
        <div className="flex items-center gap-3">
           <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-nexus to-indigo-600 flex items-center justify-center shadow-lg shadow-nexus/20">
             <CpuChipIcon className="w-5 h-5 text-white" />
           </div>
           <div>
             <h1 className="font-bold text-slate-800 text-lg leading-tight tracking-tight">NexusAI</h1>
             <p className="text-[10px] text-slate-500 font-bold tracking-wide uppercase">Multi-Agent Domain Assistant</p>
           </div>
        </div>

        <div className="hidden md:flex items-center bg-slate-100/80 p-1 rounded-lg border border-slate-200">
           <button onClick={() => setActiveTab('chat')} className={`px-5 py-1.5 rounded-md text-sm font-semibold transition-all ${activeTab === 'chat' ? 'bg-white text-nexus shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
              Chat & Agents
           </button>
           <button onClick={() => setActiveTab('dashboard')} className={`px-5 py-1.5 rounded-md text-sm font-semibold transition-all ${activeTab === 'dashboard' ? 'bg-white text-nexus shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
              Live Dashboard
           </button>
        </div>

        <div className="flex items-center gap-4">
          <button 
             onClick={() => setShowLiveChat(true)}
             className="hidden md:flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-full text-xs font-bold transition-all shadow-lg shadow-slate-900/20"
          >
             <MicrophoneIcon className="w-3.5 h-3.5" />
             Live Chat
          </button>

          <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

          <div className="flex items-center gap-2">
            <button onClick={toggleFullscreen} className="p-2 text-slate-400 hover:text-nexus hover:bg-slate-50 rounded-full transition-all">
                {isFullscreen ? <ArrowsPointingInIcon className="w-5 h-5" /> : <ArrowsPointingOutIcon className="w-5 h-5" />}
            </button>

            <button 
                onClick={() => setIsTtsEnabled(!isTtsEnabled)} 
                className={`p-2 rounded-full transition-all w-9 h-9 flex items-center justify-center ${isTtsEnabled ? 'bg-nexus/10 text-nexus' : 'text-slate-400 hover:bg-slate-50'}`}
            >
                {isTtsEnabled ? <SpeakerWaveIcon className="w-5 h-5" /> : <SpeakerXMarkIcon className="w-5 h-5" />}
            </button>
            
            <button onClick={() => setShowSettingsModal(true)} className="p-2 text-slate-400 hover:text-nexus hover:bg-slate-50 rounded-full transition-all">
                <Cog6ToothIcon className="w-5 h-5" />
            </button>
            
            <button onClick={() => setShowApiKeyModal(true)} className="p-2 text-slate-400 hover:text-nexus hover:bg-slate-50 rounded-full transition-all">
                <KeyIcon className="w-5 h-5" />
            </button>
          </div>
          
          <button className="md:hidden p-2 text-slate-600" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
             {mobileMenuOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden relative">
        <AgentVisualizer 
          activeAgents={activeAgents} 
          executionMode={executionMode} 
          isProcessing={isProcessing} 
          logs={logs} 
          metrics={currentMetrics}
          evaluation={currentEvaluation}
        />

        <div className={`flex-1 flex flex-col bg-white relative transition-all duration-300 ${activeTab === 'dashboard' ? 'z-10' : ''}`}>
          
          {activeTab === 'dashboard' ? (
             <Dashboard currentInsight={latestInsight} data={dashboardData} userContext={userContext} />
          ) : (
             <>
               <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar bg-slate-50/30">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto w-full animate-fade-in-up">
                       <SparklesIcon className="w-16 h-16 mb-4 text-nexus/80" />
                       <h2 className="text-2xl font-bold text-slate-700 mb-2">NexusAI System Online</h2>
                       <p className="text-sm text-slate-500 mb-10 text-center max-w-md">
                           Ready for complex multi-domain queries. I can generate code, analyze videos, and connect health insights.
                       </p>
                       
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full px-8">
                           <SuggestionCard 
                              icon={HeartIcon} 
                              title="Analyze my health trends" 
                              color="bg-rose-500"
                              onClick={() => handleSendMessage("Analyze my recent health trends and suggest improvements based on environmental factors.")} 
                           />
                           <SuggestionCard 
                              icon={AcademicCapIcon} 
                              title="Create a study plan" 
                              color="bg-blue-500"
                              onClick={() => handleSendMessage("Create a personalized study plan for advanced physics focusing on weak areas.")} 
                           />
                           <SuggestionCard 
                              icon={GlobeAmericasIcon} 
                              title="Check Air Quality Impact" 
                              color="bg-emerald-500"
                              onClick={() => handleSendMessage("How does the current air quality in my location affect my outdoor exercise routine?")} 
                           />
                           <SuggestionCard 
                              icon={CodeBracketIcon} 
                              title="Draft a Python Script" 
                              color="bg-orange-500"
                              onClick={() => handleSendMessage("Write a Python script to visualize sensor data using matplotlib.")} 
                           />
                       </div>
                    </div>
                  )}
                  
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                       <div className={`max-w-[85%] lg:max-w-[70%] rounded-2xl p-5 shadow-sm border ${
                         msg.role === 'user' 
                           ? 'bg-slate-800 text-white border-slate-700 rounded-tr-none' 
                           : 'bg-white text-slate-800 border-slate-200 rounded-tl-none'
                       }`}>
                          {msg.role === 'assistant' && (
                             <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px] uppercase tracking-wider font-bold text-slate-400 border-b border-slate-100 pb-2">
                                <span className="flex items-center gap-1.5 text-nexus">
                                   <CpuChipIcon className="w-3.5 h-3.5" />
                                   {msg.metadata?.activeAgents?.join(' + ')}
                                </span>
                                {msg.metadata?.isThinking && <span className="text-blue-500 flex items-center gap-1 ml-auto"><BoltIcon className="w-3 h-3" /> Thinking Process</span>}
                             </div>
                          )}

                          {msg.metadata?.generatedImage && (
                              <div className="mb-4 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                                  <img src={msg.metadata.generatedImage} alt="Generated" className="w-full h-auto" />
                              </div>
                          )}
                          
                          {/* Main Text Content */}
                          <div className="prose prose-sm max-w-none prose-slate leading-relaxed">
                             <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                       </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
               </div>

               {/* Input Area */}
               <div className="p-4 bg-white border-t border-slate-200 z-20">
                  <div className="max-w-4xl mx-auto w-full">
                      {/* Mode Toggles */}
                      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                          <button onClick={() => setInteractionMode('chat')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${interactionMode === 'chat' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                             <ChatBubbleBottomCenterTextIcon className="w-3.5 h-3.5" /> Chat
                          </button>
                          <button onClick={() => setInteractionMode('image')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${interactionMode === 'image' ? 'bg-nexus text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                             <PhotoIcon className="w-3.5 h-3.5" /> Image
                          </button>
                          <button onClick={() => setInteractionMode('image_edit')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${interactionMode === 'image_edit' ? 'bg-nexus text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                             <WrenchScrewdriverIcon className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button onClick={() => setInteractionMode('video_generation')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${interactionMode === 'video_generation' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                             <FilmIcon className="w-3.5 h-3.5" /> Video (Veo)
                          </button>
                          <div className="w-px h-4 bg-slate-300 mx-1"></div>
                          <button onClick={() => setIsThinkingEnabled(!isThinkingEnabled)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isThinkingEnabled ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                             <BoltIcon className="w-3.5 h-3.5" /> Thinking
                          </button>
                          <button onClick={() => setIsFastMode(!isFastMode)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isFastMode ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                             <SparklesIcon className="w-3.5 h-3.5" /> Fast
                          </button>
                      </div>

                      {/* Input Box */}
                      <div className="bg-slate-50 p-2 rounded-3xl border border-slate-200 focus-within:ring-2 focus-within:ring-nexus/20 focus-within:border-nexus/50 transition-all flex items-end gap-2 shadow-sm">
                         <div className="flex-1 relative">
                            <textarea
                              value={inputText}
                              onChange={(e) => setInputText(e.target.value)}
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
                              }}
                              placeholder={
                                  interactionMode === 'image' ? "Describe the image you want to generate..." :
                                  interactionMode === 'image_edit' ? "Describe how to edit the uploaded image..." :
                                  interactionMode === 'video_generation' ? "Describe the video for Veo..." :
                                  "Ask about health, education, or environment..."
                              }
                              className="w-full bg-transparent text-slate-800 rounded-2xl pl-3 pr-10 py-3 focus:outline-none resize-none max-h-32 min-h-[48px] custom-scrollbar text-sm placeholder:text-slate-400 font-medium"
                              rows={1}
                            />
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className={`absolute right-2 bottom-2.5 p-1.5 rounded-full transition-colors ${selectedFile ? 'bg-nexus text-white' : 'text-slate-400 hover:bg-slate-200'}`}
                            >
                                {selectedFile ? <WrenchScrewdriverIcon className="w-4 h-4" /> : <PaperAirplaneIcon className="w-4 h-4 -rotate-45" />}
                            </button>
                            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                         </div>
                         
                         <div className="flex items-center gap-2 pb-1 pr-1">
                             <VoiceInput onTranscript={(text) => setInputText(prev => prev + ' ' + text)} isProcessing={isProcessing} language={language} />
                             <button
                               onClick={() => handleSendMessage()}
                               disabled={isProcessing || (!inputText.trim() && !selectedFile)}
                               className="p-3 bg-slate-900 text-white rounded-full hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all active:scale-95"
                             >
                               <PaperAirplaneIcon className="h-5 w-5" />
                             </button>
                         </div>
                      </div>
                      
                      {selectedFile && (
                        <div className="mt-2 text-xs text-slate-500 pl-4 flex items-center gap-2">
                           <span className="font-semibold text-nexus">{selectedFile.name}</span> attached
                           <button onClick={() => setSelectedFile(null)} className="hover:text-red-500"><XMarkIcon className="w-3 h-3" /></button>
                        </div>
                      )}
                  </div>
               </div>
             </>
          )}
        </div>
      </main>

      {/* Live Chat Overlay */}
      {showLiveChat && <LivePulse apiKey={apiKey || getEnvApiKey()} onClose={() => setShowLiveChat(false)} language={language} />}
      
      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
           <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-fade-in-up">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="text-lg font-bold text-slate-800">Settings</h3>
                 <button onClick={() => setShowSettingsModal(false)}><XMarkIcon className="w-5 h-5 text-slate-500" /></button>
              </div>
              <div className="mb-4">
                 <label className="block text-sm font-semibold text-slate-700 mb-2">Language</label>
                 <select 
                    value={language} 
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                 >
                    {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                 </select>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="w-full py-2 bg-nexus text-white rounded-lg font-semibold">Save</button>
           </div>
        </div>
      )}
      
      {/* Other Modals (API Key, Privacy) remain same but hidden for brevity if not triggered */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center p-4 z-[60] backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-fade-in-up">
            <div className="flex items-center gap-3 mb-4 text-nexus">
               <KeyIcon className="w-8 h-8" />
               <h2 className="text-2xl font-bold text-slate-800">Access NexusAI</h2>
            </div>
            <p className="text-slate-600 mb-6 leading-relaxed">Enter your Gemini API Key.</p>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4 focus:ring-2 focus:ring-nexus/50" />
            <div className="flex gap-3">
               <button onClick={() => (window as any).aistudio ? (window as any).aistudio.openSelectKey() : window.open('https://aistudio.google.com/app/apikey', '_blank')} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200">Get Key</button>
               <button onClick={() => { if (apiKey.trim()) setShowApiKeyModal(false); }} disabled={!apiKey.trim()} className="flex-1 px-4 py-3 bg-nexus text-white rounded-xl font-bold hover:bg-indigo-600 disabled:opacity-50">Initialize</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
