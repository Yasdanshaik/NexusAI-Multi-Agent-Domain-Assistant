
export enum AgentDomain {
  HEALTH = 'HEALTH',
  EDUCATION = 'EDUCATION',
  ENVIRONMENT = 'ENVIRONMENT',
  ORCHESTRATOR = 'ORCHESTRATOR'
}

export enum ExecutionMode {
  PARALLEL = 'PARALLEL',
  SEQUENTIAL = 'SEQUENTIAL',
  LOOP = 'LOOP',
  DIRECT = 'DIRECT',
  PAUSED = 'PAUSED',
  PLANNING = 'PLANNING'
}

export enum Sentiment {
  POSITIVE = 'POSITIVE',
  NEUTRAL = 'NEUTRAL',
  NEGATIVE = 'NEGATIVE',
  EMPATHETIC = 'EMPATHETIC'
}

export interface ChartDataPoints {
  health?: { time: string; heartRate: number; stress: number }[];
  env?: { day: string; aqi: number; pollen: number }[];
  edu?: { subject: string; progress: number; focus: number }[];
}

export interface AgentStep {
  agent: AgentDomain;
  instruction: string;
}

export interface AgentPlan {
  mode: ExecutionMode;
  steps: AgentStep[];
  reasoning: string;
}

export interface PausedState {
  plan: AgentPlan;
  stepIndex: number;
  accumulatedContext: string;
  agentOutputs: Record<string, string>;
}

export interface UserContext {
  name: string;
  location: string;
  healthConditions: string[];
  learningGoals: string[];
  ecoPreferences: string[];
  notes: string[];
  lastInteraction: number;
}

export interface EvaluationResult {
  score: number; // 0-10
  feedback: string;
  latencyMs: number;
  tokenCost: number; // Simulated
}

export interface AgentMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    activeAgents?: AgentDomain[];
    executionMode?: ExecutionMode;
    sentiment?: Sentiment;
    reasoning?: string;
    crossDomainInsight?: string;
    generatedImage?: string;
    generatedVideo?: string;
    isThinking?: boolean;
    chartData?: ChartDataPoints;
    pausedState?: PausedState;
    toolCalls?: string[];
    evaluation?: EvaluationResult;
    metrics?: AgentMetric[];
  };
}
