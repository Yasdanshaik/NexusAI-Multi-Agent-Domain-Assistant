
import React from 'react';
import { AgentDomain, ExecutionMode, AgentMetric, EvaluationResult } from '../types';
import { ServerStackIcon, ArrowsRightLeftIcon, ArrowPathIcon, Square3Stack3DIcon, ChartBarIcon, SignalIcon, CheckBadgeIcon, ShieldCheckIcon, ClockIcon } from '@heroicons/react/24/outline';

interface AgentVisualizerProps {
  activeAgents: AgentDomain[];
  executionMode?: ExecutionMode;
  isProcessing: boolean;
  logs: string[];
  metrics?: AgentMetric[];
  evaluation?: EvaluationResult;
}

const AgentVisualizer: React.FC<AgentVisualizerProps> = ({ activeAgents, executionMode, isProcessing, logs, metrics, evaluation }) => {
  
  const getAgentColor = (agent: AgentDomain) => {
    switch (agent) {
      case AgentDomain.HEALTH: return 'bg-health';
      case AgentDomain.EDUCATION: return 'bg-edu';
      case AgentDomain.ENVIRONMENT: return 'bg-eco';
      default: return 'bg-nexus';
    }
  };

  const capabilities = [
    "Parallel / Seq / Loop Agents",
    "Google Search & Code Exec",
    "OpenAPI & Custom Tools (MCP)",
    "Long-Running (Pause/Resume)",
    "Session Management & Memory Bank",
    "Context Compaction (Engineering)",
    "Observability (Logs/Trace/Metrics)",
    "Agent Evaluation Framework",
    "A2A Communication Protocol",
    "Cloud Agent Deployment"
  ];

  return (
    <div className="bg-[#0f172a] text-slate-300 p-4 border-r border-slate-800 w-[320px] hidden md:flex flex-col h-full font-sans shrink-0">
      
      {/* 1. Deployment & System Status */}
      <div className="mb-6">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 pl-1">Cloud Deployment Status</h3>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between px-3 py-2.5 bg-slate-800/60 rounded-lg border border-slate-700/50">
             <div className="flex items-center gap-2">
                <ServerStackIcon className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold text-slate-200">MAS Cluster</span>
             </div>
             <div className="flex items-center gap-1.5">
               <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
               </span>
               <span className="text-[10px] text-green-400 font-mono font-bold tracking-tight">ONLINE</span>
             </div>
          </div>

          <div className="flex items-center justify-between px-3 py-2.5 bg-slate-800/60 rounded-lg border border-slate-700/50">
             <div className="flex items-center gap-2">
                <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-200">Privacy Mode</span>
             </div>
             <span className="text-[10px] text-emerald-500 font-mono font-bold tracking-tight bg-emerald-500/10 px-1.5 py-0.5 rounded">ACTIVE</span>
          </div>
          
          <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all duration-300 ${isProcessing ? 'bg-slate-800 border-nexus/50 shadow-md shadow-nexus/10' : 'bg-slate-800/40 border-slate-700/50'}`}>
             <div className="flex items-center gap-2">
                <ArrowPathIcon className={`w-4 h-4 ${isProcessing ? 'text-nexus animate-spin' : 'text-slate-400'}`} />
                <span className="text-xs font-semibold text-slate-200">
                  {executionMode ? executionMode : 'IDLE MODE'}
                </span>
             </div>
          </div>
        </div>
      </div>

      {/* 2. System Capabilities (Green Marks) */}
      <div className="mb-6 flex-1 min-h-0 flex flex-col">
         <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 pl-1">System Capabilities</h3>
         <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-1">
            {capabilities.map((cap, i) => (
                <div key={i} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-slate-800/50 transition-colors group">
                    <CheckBadgeIcon className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    <span className="text-[11px] text-slate-400 group-hover:text-slate-200 font-medium">{cap}</span>
                </div>
            ))}
         </div>
      </div>

      {/* 3. Active Agents Grid */}
      <div className="mb-6">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 pl-1">Active Agents</h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.values(AgentDomain).map((agent) => {
            const isActive = activeAgents.includes(agent);
            // Shorten names for grid
            const shortName = agent === 'ORCHESTRATOR' ? 'ORCH' : agent === 'EDUCATION' ? 'EDUC' : agent === 'ENVIRONMENT' ? 'ENVI' : 'HEAL';
            
            return (
              <div 
                key={agent} 
                className={`
                  h-12 rounded flex flex-col items-center justify-center transition-all duration-300 border relative overflow-hidden
                  ${isActive 
                    ? `border-${getAgentColor(agent).replace('bg-', '')}/50 bg-slate-800 text-white` 
                    : 'border-slate-800 bg-slate-900/50 text-slate-600'}
                `}
              >
                {isActive && <div className={`absolute top-0 left-0 right-0 h-0.5 ${getAgentColor(agent)}`}></div>}
                <div className={`w-1.5 h-1.5 rounded-full mb-1 ${isActive ? getAgentColor(agent) : 'bg-slate-700'}`}></div>
                <span className="text-[10px] font-bold tracking-wider">{shortName}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 4. Evaluation & Metrics */}
      <div className="mb-6 bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
              <ChartBarIcon className="w-3.5 h-3.5" /> Agent Performance
          </h3>
          
          <div className="grid grid-cols-2 gap-2">
             <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                 <div className="text-[9px] text-slate-500 uppercase tracking-wide mb-0.5">Latency</div>
                 <div className="text-xs text-cyan-400 font-mono font-bold">{evaluation?.latencyMs ? `${evaluation.latencyMs}ms` : '-'}</div>
             </div>
             <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                 <div className="text-[9px] text-slate-500 uppercase tracking-wide mb-0.5">Events</div>
                 <div className="text-xs text-pink-400 font-mono font-bold">{logs.length}</div>
             </div>
          </div>
          {evaluation && (
             <div className="mt-2 text-[10px] text-slate-400 italic text-center border-t border-slate-700/50 pt-2">
               "{evaluation.feedback}"
             </div>
          )}
          {!evaluation && <div className="mt-2 text-[10px] text-slate-600 italic text-center">Awaiting evaluation...</div>}
      </div>

      {/* 5. Logs / Trace / A2A Protocol */}
      <div className="h-32 flex flex-col border-t border-slate-800 pt-4">
        <div className="flex items-center justify-between mb-2 pl-1">
           <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Live A2A Protocol</h3>
           <SignalIcon className="w-3 h-3 text-slate-600 animate-pulse" />
        </div>
        <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1.5 pr-1 custom-scrollbar bg-slate-950/30 rounded p-2">
          {logs.map((log, idx) => {
            const isA2A = log.includes("[A2A]");
            const isSystem = log.includes("System:");
            return (
                <div key={idx} className={`leading-tight ${isA2A ? 'text-indigo-400' : isSystem ? 'text-green-500/80' : 'text-slate-500'}`}>
                   <span className="opacity-40 mr-2">|</span>
                   {log.replace("[A2A]", "").replace("[OpenAPI]", "")}
                </div>
            )
          })}
        </div>
      </div>
    </div>
  );
};

export default AgentVisualizer;
