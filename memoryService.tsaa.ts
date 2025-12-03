
import { UserContext } from '../types';

const STORAGE_KEY = 'nexus_memory_bank_v1';

const DEFAULT_CONTEXT: UserContext = {
  name: 'User',
  location: 'Unknown',
  healthConditions: [],
  learningGoals: [],
  ecoPreferences: [],
  notes: [],
  lastInteraction: Date.now()
};

export class MemoryBankService {
  private context: UserContext;

  constructor() {
    this.context = this.load();
  }

  private load(): UserContext {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULT_CONTEXT, ...JSON.parse(stored) } : { ...DEFAULT_CONTEXT };
    } catch (e) {
      console.error("Failed to load memory bank", e);
      return { ...DEFAULT_CONTEXT };
    }
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.context));
    } catch (e) {
      console.error("Failed to save memory bank", e);
    }
  }

  public getContext(): UserContext {
    return { ...this.context };
  }

  public updateContext(updates: Partial<UserContext>) {
    this.context = { ...this.context, ...updates, lastInteraction: Date.now() };
    this.save();
  }

  public addNote(note: string) {
    if (!this.context.notes.includes(note)) {
      this.context.notes.push(note);
      this.save();
    }
  }

  public addArrayItem(key: 'healthConditions' | 'learningGoals' | 'ecoPreferences', item: string) {
    if (!this.context[key].includes(item)) {
      this.context[key].push(item);
      this.save();
    }
  }

  public getFormattedContext(): string {
    return `
      [MEMORY BANK - LONG TERM USER CONTEXT]
      Name: ${this.context.name}
      Location: ${this.context.location}
      Health Profile: ${this.context.healthConditions.join(', ') || 'None recorded'}
      Learning Goals: ${this.context.learningGoals.join(', ') || 'None recorded'}
      Eco Preferences: ${this.context.ecoPreferences.join(', ') || 'None recorded'}
      Key Notes: ${this.context.notes.join('; ')}
    `;
  }

  public clear() {
    this.context = { ...DEFAULT_CONTEXT };
    this.save();
  }
}

export class InMemorySessionService {
  private sessionId: string;
  private startTime: number;

  constructor() {
    this.sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = Date.now();
  }

  public getSessionId() {
    return this.sessionId;
  }

  public getDuration() {
    return (Date.now() - this.startTime) / 1000;
  }

  public reset() {
    this.sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = Date.now();
  }
}

// Singletons
export const memoryBank = new MemoryBankService();
export const sessionService = new InMemorySessionService();
