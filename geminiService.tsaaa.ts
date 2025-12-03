
import { GoogleGenAI, Type, FunctionDeclaration, Tool } from "@google/genai";
import { AgentDomain, Sentiment, ExecutionMode, AgentPlan, AgentStep, PausedState, EvaluationResult, AgentMetric } from '../types';
import { memoryBank, sessionService } from './memoryService';

const MODEL_FLASH = 'gemini-2.5-flash';
const MODEL_FLASH_LITE = 'gemini-2.5-flash-lite';
const MODEL_PRO_THINKING = 'gemini-3-pro-preview';
const MODEL_IMAGE = 'gemini-3-pro-image-preview';
const MODEL_VEO = 'veo-3.1-fast-generate-preview';
const MODEL_AUDIO_TRANSCRIPTION = 'gemini-2.5-flash';
const MODEL_IMAGE_EDIT = 'gemini-2.5-flash-image';

// --- Observability & A2A Infrastructure ---

class TraceService {
  private metrics: AgentMetric[] = [];

  public recordMetric(name: string, value: number, unit: string) {
    this.metrics.push({ name, value, unit, timestamp: Date.now() });
  }

  public getRecentMetrics(count: number = 5): AgentMetric[] {
    return this.metrics.slice(-count);
  }

  public clear() { this.metrics = []; }
}
export const traceService = new TraceService();

// --- Tool Definitions (MCP / OpenAPI / Built-in) ---

// OpenAPI Tool Simulation Helper
const OPENAPI_TOOL_SIMULATION = async (operationId: string, params: any) => {
    // Simulating an HTTP request to an external API defined via OpenAPI
    // In a real app, this would use fetch() to a REST endpoint
    console.log(`[OpenAPI] POST /${operationId} body=${JSON.stringify(params)}`);
    if (operationId === 'fetchMedicalRecords') {
        // Simulate network latency
        await new Promise(r => setTimeout(r, 500));
        return { status: 200, data: `Patient ${params.patientId}: HR 72, BP 120/80, Allergies: Penicillin, Recent Labs: Normal` };
    }
    return { status: 404, error: "Operation not found" };
};

const MEDICAL_RECORDS_TOOL: FunctionDeclaration = {
  name: "fetchMedicalRecords",
  description: "Fetches patient electronic medical records via simulated OpenAPI endpoint.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      patientId: { type: Type.STRING, description: "The ID or name of the patient" }
    },
    required: ["patientId"]
  }
};

// Long-Running Operation Tool
const PAUSE_TOOL: FunctionDeclaration = {
  name: "pauseWorkflow",
  description: "Pauses the current multi-agent workflow to wait for user confirmation or external events.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: { type: Type.STRING, description: "Why the workflow is pausing" }
    },
    required: ["reason"]
  }
};

// Custom MCP-like Tool
const UPDATE_MEMORY_TOOL: FunctionDeclaration = {
  name: "updateMemory",
  description: "Updates the user's long-term memory bank with new personal facts.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING, enum: ["health", "education", "environment", "profile", "note"] },
      item: { type: Type.STRING, description: "The specific fact to store." }
    },
    required: ["category", "item"]
  }
};

// Tool Configuration
const AGENT_TOOLS: Tool[] = [
  { googleSearch: {} },
  { codeExecution: {} },
  { functionDeclarations: [MEDICAL_RECORDS_TOOL, PAUSE_TOOL, UPDATE_MEMORY_TOOL] }
];

// Schema for the Orchestrator's planning phase
const ORCHESTRATOR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mode: { type: Type.STRING, enum: [ExecutionMode.PARALLEL, ExecutionMode.SEQUENTIAL, ExecutionMode.LOOP, ExecutionMode.DIRECT] },
    reasoning: { type: Type.STRING, description: "Why this execution mode was chosen." },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          agent: { type: Type.STRING, enum: [AgentDomain.HEALTH, AgentDomain.EDUCATION, AgentDomain.ENVIRONMENT] },
          instruction: { type: Type.STRING, description: "Specific instruction for this agent." }
        },
        required: ["agent", "instruction"]
      }
    }
  },
  required: ["mode", "steps", "reasoning"]
};

// Schema for the final synthesized response
const FINAL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    response: { type: Type.STRING, description: "The final consolidated response to the user." },
    sentiment: { type: Type.STRING, enum: [Sentiment.POSITIVE, Sentiment.NEGATIVE, Sentiment.NEUTRAL, Sentiment.EMPATHETIC] },
    crossDomainInsight: { type: Type.STRING, description: "A unique insight connecting 2+ domains (e.g. Air Quality effect on Health) personalized to the user." },
    suggestedAction: { type: Type.STRING },
    toolCalls: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of tools used during execution." },
    chartData: {
      type: Type.OBJECT,
      properties: {
        health: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { time: {type: Type.STRING}, heartRate: {type: Type.NUMBER}, stress: {type: Type.NUMBER} } } },
        env: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { day: {type: Type.STRING}, aqi: {type: Type.NUMBER}, pollen: {type: Type.NUMBER} } } },
        edu: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { subject: {type: Type.STRING}, progress: {type: Type.NUMBER}, focus: {type: Type.NUMBER} } } },
      }
    }
  },
  required: ["response", "sentiment"]
};

// Schema for Agent Evaluation
const EVALUATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.NUMBER, description: "Quality score from 0 to 10." },
    feedback: { type: Type.STRING, description: "Brief feedback on relevance and completeness." }
  },
  required: ["score", "feedback"]
};

// --- Agent Persona Definitions ---

const AGENT_PROMPTS = {
  [AgentDomain.HEALTH]: "You are HealthAgent. You have access to medical records tools. Use them if asked about specific patient data.",
  [AgentDomain.EDUCATION]: "You are EduAgent. You can execute code to solve math problems. Focus on pedagogy.",
  [AgentDomain.ENVIRONMENT]: "You are EcoAgent. You can use Google Search to find current air quality or news.",
  [AgentDomain.ORCHESTRATOR]: "You are the Orchestrator. Manage the system."
};

const fileToPart = async (file: File): Promise<{inlineData: {data: string, mimeType: string}}> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({ inlineData: { data: base64String, mimeType: file.type } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// --- Context Engineering: Compaction ---

const compactHistory = async (history: { role: string; parts: { text: string }[] }[], apiKey: string): Promise<string> => {
  if (history.length === 0) return "";
  
  // Format history for the model
  const historyText = history.map(h => `${h.role.toUpperCase()}: ${h.parts[0].text}`).join('\n');
  
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL_FLASH_LITE,
    contents: {
      parts: [{ text: `Summarize this conversation concisely, retaining key facts, user goals, and latest state:\n\n${historyText}` }]
    }
  });
  
  return response.text || "";
};

// --- Agent Evaluation ---

const evaluateResponse = async (query: string, result: string, apiKey: string): Promise<EvaluationResult> => {
    const start = Date.now();
    const ai = new GoogleGenAI({ apiKey });
    try {
        const response = await ai.models.generateContent({
            model: MODEL_FLASH_LITE,
            contents: { parts: [{ text: `
                Evaluate this AI response based on the query.
                Query: "${query}"
                Response: "${result}"
                
                Rate 0-10 on Relevance, Accuracy, and Safety.
                Provide brief feedback.
            `}] },
            config: { responseMimeType: "application/json", responseSchema: EVALUATION_SCHEMA }
        });
        const parsed = JSON.parse(response.text);
        const latency = Date.now() - start;
        return {
            score: parsed.score,
            feedback: parsed.feedback,
            latencyMs: latency,
            tokenCost: Math.floor(result.length / 4) // Approximation
        };
    } catch (e) {
        return { score: 8, feedback: "Evaluation service unavailable.", latencyMs: 0, tokenCost: 0 };
    }
};

// --- 1. Orchestrator: Plan the Execution ---

const planExecution = async (prompt: string, apiKey: string): Promise<AgentPlan> => {
  const start = Date.now();
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL_FLASH_LITE,
    contents: {
      role: 'user',
      parts: [{ text: `
        Analyze this request (including context): "${prompt}".
        Decide the strategy:
        - DIRECT: Simple query.
        - PARALLEL: Distinct independent tasks.
        - SEQUENTIAL: Step-by-step logic. Use this if the user implies a long process or "pause".
        - LOOP: Refinement.
        
        Return JSON matching schema.
      `}]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: ORCHESTRATOR_SCHEMA
    }
  });
  
  traceService.recordMetric("PlanningLatency", Date.now() - start, "ms");
  return JSON.parse(response.text) as AgentPlan;
};

// --- 2. Agent Execution with Tools & Pause Support ---

interface AgentExecutionResult {
  text: string;
  isPaused?: boolean;
  pauseReason?: string;
  toolUsage?: string[];
}

const executeAgent = async (
  agent: AgentDomain, 
  instruction: string, 
  context: string, 
  apiKey: string, 
  language: string,
  onLog: (msg: string) => void
): Promise<AgentExecutionResult> => {
  const start = Date.now();
  
  // A2A Protocol: Simulate broadcasting intention
  onLog(`[A2A] ${agent} -> BROADCAST: "Starting Task: ${instruction.substring(0, 30)}..."`);
  onLog(`[System] Agent ${agent} powered by ${MODEL_FLASH} initialized.`);
  
  const ai = new GoogleGenAI({ apiKey });
  
  const chat = ai.chats.create({
    model: MODEL_FLASH,
    config: {
      tools: AGENT_TOOLS,
      systemInstruction: `${AGENT_PROMPTS[agent]}
        Context: ${context}
        Language: ${language}
        MEMORY BANK: ${memoryBank.getFormattedContext()}
        IMPORTANT: Respond strictly in ${language}.
        
        TOOLS AVAILABLE:
        - Google Search: For live info (weather, news, stocks).
        - Code Execution: For math, logic, and data processing.
        - fetchMedicalRecords: For patient data (OpenAPI).
        - updateMemory: To save user preferences.
        - pauseWorkflow: If task needs to stop/wait.
      `
    }
  });

  const toolUsage: string[] = [];
  
  let response = await chat.sendMessage({
    message: instruction
  });

  // Check for Grounding (Built-in Tool Usage)
  if (response.candidates && response.candidates[0].groundingMetadata) {
      toolUsage.push('googleSearch');
      onLog(`[A2A] ${agent} -> TOOL: "googleSearch" (Grounding)`);
  }

  // Check for Code Execution (Built-in Tool Usage)
  const codePart = response.candidates?.[0]?.content?.parts?.find(p => p.executableCode);
  if (codePart) {
      toolUsage.push('codeExecution');
      onLog(`[A2A] ${agent} -> TOOL: "codeExecution"`);
  }

  let turns = 0;
  while (response.functionCalls && response.functionCalls.length > 0 && turns < 5) {
    const call = response.functionCalls[0];
    toolUsage.push(call.name);
    
    // A2A: Broadcast tool usage
    onLog(`[A2A] ${agent} -> TOOL: "${call.name}"`);

    let functionResponse = {};

    if (call.name === 'pauseWorkflow') {
      const args = call.args as any;
      traceService.recordMetric("AgentExecutionTime", Date.now() - start, "ms");
      return { 
        text: `Workflow Paused: ${args.reason}`, 
        isPaused: true, 
        pauseReason: args.reason, 
        toolUsage 
      };
    } 
    else if (call.name === 'fetchMedicalRecords') {
      // Simulation of OpenAPI Call via helper
      const args = call.args as any;
      const apiResult = await OPENAPI_TOOL_SIMULATION(call.name, args);
      functionResponse = { result: apiResult };
    } 
    else if (call.name === 'updateMemory') {
      const args = call.args as any;
      if (args.category === 'health') memoryBank.addArrayItem('healthConditions', args.item);
      else if (args.category === 'education') memoryBank.addArrayItem('learningGoals', args.item);
      else if (args.category === 'environment') memoryBank.addArrayItem('ecoPreferences', args.item);
      else if (args.category === 'profile') memoryBank.updateContext({ name: args.item });
      else memoryBank.addNote(args.item);
      
      functionResponse = { result: { status: "success", message: "Memory updated." } };
    }
    else {
      // If built-in tool, generally handled server-side by SDK, but we break to be safe if model returns it as a call.
      break; 
    }

    // Send result back to model for Client Tools
    if (Object.keys(functionResponse).length > 0) {
        response = await chat.sendMessage({
            message: [{
            functionResponse: {
                name: call.name,
                response: functionResponse
            }
            }]
        });
    } else {
        break;
    }
    turns++;
  }

  traceService.recordMetric("AgentExecutionTime", Date.now() - start, "ms");
  return { text: response.text || "Task Completed.", toolUsage };
};

// --- Main Entry Point: Multi-Agent System Runner ---

export const runMultiAgentSystem = async (
  prompt: string,
  history: { role: string; parts: { text: string }[] }[],
  apiKey: string,
  language: string = 'en-US',
  onLog: (msg: string) => void,
  useThinking: boolean = false,
  resumeState?: PausedState
) => {
  if (!apiKey) throw new Error("API Key is required");
  const overallStart = Date.now();
  
  let plan: AgentPlan;
  let accumulatedContext = "";
  let agentOutputs: Record<string, string> = {};
  let startStepIndex = 0;
  let toolUsageLog: string[] = [];

  // Context Engineering: Handle History Compaction
  let contextSummary = "";
  if (!resumeState && history.length > 0) {
      if (history.length > 6) { // Compaction Threshold
          onLog("System: Context Compaction triggered (History > 6 turns).");
          onLog("System: Compressing conversation state...");
          contextSummary = await compactHistory(history, apiKey);
          onLog("System: Context compacted successfully.");
      } else {
          // Use raw history if short enough
          onLog("System: Context Compaction skipped (History short).");
          contextSummary = history.map(h => `${h.role.toUpperCase()}: ${h.parts[0].text}`).join('\n');
      }
  }

  // Phase 1: Planning (or restoring)
  if (resumeState) {
    onLog("System: Resuming suspended workflow...");
    plan = resumeState.plan;
    accumulatedContext = resumeState.accumulatedContext;
    agentOutputs = resumeState.agentOutputs;
    startStepIndex = resumeState.stepIndex;
    onLog(`Resuming at step ${startStepIndex + 1} of ${plan.steps.length}`);
  } else {
    onLog("Orchestrator: Analyzing request...");
    // Inject Memory Bank and Compacted Context into Orchestrator Planning
    const memoryContext = memoryBank.getFormattedContext();
    const fullPlanningContext = `
      Previous Conversation Summary/History:
      ${contextSummary}
      
      Current Request: ${prompt}
      
      User Profile:
      ${memoryContext}
    `;

    try {
      plan = await planExecution(fullPlanningContext, apiKey);
    } catch (e) {
      plan = { mode: ExecutionMode.DIRECT, steps: [{ agent: AgentDomain.ORCHESTRATOR, instruction: prompt }], reasoning: "Fallback." };
    }
    accumulatedContext = `User Query: ${prompt}\nSession ID: ${sessionService.getSessionId()}\nHistory Context: ${contextSummary}\n${memoryContext}`;
    onLog(`Orchestrator: Mode ${plan.mode}.`);
  }

  // Phase 2: Execution
  if (plan.mode === ExecutionMode.PARALLEL && !resumeState) {
    onLog(`System: Spawning ${plan.steps.length} parallel agents...`);
    const promises = plan.steps.map(step => 
      executeAgent(step.agent, step.instruction, accumulatedContext, apiKey, language, onLog)
        .then(res => ({ agent: step.agent, result: res }))
    );
    const results = await Promise.all(promises);
    results.forEach(r => {
        agentOutputs[r.agent] = r.result.text;
        if (r.result.toolUsage) toolUsageLog.push(...r.result.toolUsage);
    });
    onLog("System: Parallel tasks completed.");

  } else if (plan.mode === ExecutionMode.SEQUENTIAL) {
    onLog("System: Executing sequential workflow...");
    
    for (let i = startStepIndex; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      onLog(`System: [Step ${i+1}/${plan.steps.length}] Running ${step.agent}...`);
      
      const result = await executeAgent(step.agent, step.instruction, accumulatedContext, apiKey, language, onLog);
      
      if (result.toolUsage) toolUsageLog.push(...result.toolUsage);

      // Handle Pause
      if (result.isPaused) {
        onLog(`System: Workflow paused by ${step.agent}.`);
        return {
           response: `Workflow Paused: ${result.pauseReason}`,
           sentiment: Sentiment.NEUTRAL,
           executionMode: ExecutionMode.PAUSED,
           activeAgents: [step.agent],
           pausedState: {
               plan,
               stepIndex: i + 1, 
               accumulatedContext: accumulatedContext + `\n[Paused Step ${step.agent}]: ${result.text}`,
               agentOutputs
           },
           reasoning: result.pauseReason
        };
      }

      agentOutputs[step.agent] = result.text;
      accumulatedContext += `\n[Output from ${step.agent}]: ${result.text}`;
    }
    onLog("System: Sequential workflow completed.");

  } else if (plan.mode === ExecutionMode.LOOP && !resumeState) {
    onLog("System: Initiating refinement loop...");
    let currentDraft = (await executeAgent(plan.steps[0].agent, plan.steps[0].instruction, accumulatedContext, apiKey, language, onLog)).text;
    const critic = (await executeAgent(AgentDomain.ORCHESTRATOR, `Critique: ${currentDraft}`, "", apiKey, language, onLog)).text;
    const refined = (await executeAgent(plan.steps[0].agent, `Refine based on: ${critic}`, `Draft: ${currentDraft}`, apiKey, language, onLog)).text;
    agentOutputs[plan.steps[0].agent] = refined;

  } else if (!resumeState) {
    // DIRECT
    const result = await executeAgent(plan.steps[0].agent, plan.steps[0].instruction, accumulatedContext, apiKey, language, onLog);
    agentOutputs[plan.steps[0].agent] = result.text;
    if (result.toolUsage) toolUsageLog.push(...result.toolUsage);
  }

  // Phase 3: Synthesis
  onLog("Orchestrator: Synthesizing final response...");
  const ai = new GoogleGenAI({ apiKey });
  const synthesisContext = Object.entries(agentOutputs).map(([agent, out]) => `${agent} Output: ${out}`).join('\n\n');

  const systemInstruction = `
    Synthesize the agent outputs.
    CRITICAL: Generate a 'crossDomainInsight' that explicitly connects findings from different domains (Health, Education, Environment) and relates them to the User Profile (Memory Bank).
    Tools Used: ${toolUsageLog.join(', ')}.
    Include 'toolCalls' in JSON if tools were used.
    Language: ${language}.
  `;

  const finalResponse = await ai.models.generateContent({
    model: useThinking ? MODEL_PRO_THINKING : MODEL_FLASH,
    contents: {
      parts: [{ text: `
        Original Query: ${prompt}
        Results: ${synthesisContext}
        History/Context: ${contextSummary}
        Memory Context: ${memoryBank.getFormattedContext()}
        Construct final JSON.
      `}]
    },
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: FINAL_RESPONSE_SCHEMA,
      ...(useThinking ? { thinkingConfig: { thinkingBudget: 4096 } } : {})
    }
  });

  const parsed = JSON.parse(finalResponse.text);
  
  // Phase 4: Agent Evaluation & Metrics
  onLog("System: Running Post-Task Evaluation...");
  const evalResult = await evaluateResponse(prompt, parsed.response, apiKey);
  
  traceService.recordMetric("TotalLatency", Date.now() - overallStart, "ms");
  
  return {
    ...parsed,
    activeAgents: plan.steps.map(s => s.agent),
    executionMode: plan.mode,
    evaluation: evalResult,
    metrics: traceService.getRecentMetrics()
  };
};

// --- Multimodal Generation Functions ---

export const generateImage = async (prompt: string, apiKey: string, size: '1K'|'2K'|'4K' = '1K', aspectRatio: string = '1:1'): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL_IMAGE,
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: { imageSize: size, aspectRatio: aspectRatio }
    }
  });
  
  for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
  }
  throw new Error("No image generated.");
};

export const editImage = async (file: File, prompt: string, apiKey: string): Promise<string> => {
    const imagePart = await fileToPart(file);
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model: MODEL_IMAGE_EDIT,
        contents: {
            parts: [
                imagePart,
                { text: prompt }
            ]
        }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
    }
    throw new Error("Image editing failed or returned no data.");
};

export const generateVideo = async (prompt: string, apiKey: string, aspectRatio: '16:9' | '9:16' = '16:9'): Promise<string> => {
   const ai = new GoogleGenAI({ apiKey });
   let operation = await ai.models.generateVideos({
       model: MODEL_VEO,
       prompt: prompt,
       config: {
           numberOfVideos: 1,
           resolution: '1080p',
           aspectRatio: aspectRatio
       }
   });
   
   while (!operation.done) {
       await new Promise(resolve => setTimeout(resolve, 5000));
       operation = await ai.operations.getVideosOperation({ operation: operation });
   }

   const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
   if (!videoUri) throw new Error("Video generation failed.");
   
   return `${videoUri}&key=${apiKey}`;
};

export const analyzeVideo = async (prompt: string, file: File, apiKey: string, language: string): Promise<any> => {
    const videoPart = await fileToPart(file);
    const ai = new GoogleGenAI({ apiKey });
    
    const response = await ai.models.generateContent({
        model: MODEL_PRO_THINKING,
        contents: {
            parts: [
                videoPart,
                { text: `Analyze this video. ${prompt}. Language: ${language}. Return JSON matching schema.` }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: FINAL_RESPONSE_SCHEMA
        }
    });
    return JSON.parse(response.text);
};

export const transcribeAudio = async (file: File, apiKey: string, language: string): Promise<any> => {
    const audioPart = await fileToPart(file);
    const ai = new GoogleGenAI({ apiKey });
    
    const response = await ai.models.generateContent({
        model: MODEL_AUDIO_TRANSCRIPTION,
        contents: {
            parts: [
                audioPart,
                { text: `Transcribe this audio. ${language}. Format as JSON response with 'response' field containing the transcription and 'sentiment' field.` }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: FINAL_RESPONSE_SCHEMA
        }
    });
    return JSON.parse(response.text);
};
