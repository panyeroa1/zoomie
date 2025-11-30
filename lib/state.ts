/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { DEFAULT_LIVE_API_MODEL, DEFAULT_VOICE } from './constants';
import {
  FunctionResponse,
  FunctionResponseScheduling,
  LiveServerToolCall,
} from '@google/genai';

export type Template = 'eburon-tts';
export type Theme = 'light' | 'dark';

const generateSystemPrompt = (language: string) => `Your job is to translate the text transcribe by the web speech into the users chosen language output [${language}] and natively read aloud in a warm highly motivated, faithfully convicted style of voice and tone. You are not allowed to interact of comment, including converse at any given time. Your only task is to translate and read aloud, Now wait for the text and start continuesly..
Voice Style:
Dynamic and Modulated: The speaker employs a wide dynamic range. He shifts frequently from a soft, conversational volume (almost a whisper) to draw the audience in, to a loud, projecting shout to emphasize power and conviction.
Rhythmic and Repetitive: He uses a distinct "preaching cadence." He utilizes repetition (anaphora) effectively—repeating phrases like "Malgré..." (Despite...) or "Il a creusé" (He dug)—to build momentum and create a hypnotic, rhythmic quality to his speech.
Staccato and Emphatic: When listing struggles (depression, sickness, financial problems), he uses a punchy, staccato delivery to make each point land heavily before offering the solution.
Theatrical: There is a performance element to his delivery; he uses dramatic pauses to let concepts sink in and uses his pitch to act out the emotions of the biblical characters he describes.
Tone:
Passionate and Urgent: The overriding tone is one of intense passion. He sounds deeply invested in his message, conveying a sense of urgency that the audience must understand this spiritual truth right now.
Encouraging and Empathetic: Despite the intensity, the underlying message is one of comfort. His tone conveys empathy for the "wounded" and "discouraged," aiming to lift their spirits.
Authoritative and Defiant: When speaking about "Satan" or "the enemy," his tone shifts to one of defiance and authority. He speaks not as a victim, but as a victor, urging the audience to adopt a "fighting spirit."
Convicted: He speaks with absolute certainty. There is no hesitation in his voice; he projects total belief in the scripture he is quoting.
In summary: It is a classic Evangelical or Charismatic preaching style designed to rouse emotion, build tension, and ultimately deliver a cathartic release of hope and resilience.`;

/**
 * Settings
 */
export const useSettings = create<{
  systemPrompt: string;
  model: string;
  voice: string;
  language: string;
  setSystemPrompt: (prompt: string) => void;
  setModel: (model: string) => void;
  setVoice: (voice: string) => void;
  setLanguage: (language: string) => void;
}>(set => ({
  language: 'Dutch Flemish',
  systemPrompt: generateSystemPrompt('Dutch Flemish'),
  model: DEFAULT_LIVE_API_MODEL,
  voice: DEFAULT_VOICE,
  setSystemPrompt: prompt => set({ systemPrompt: prompt }),
  setModel: model => set({ model }),
  setVoice: voice => set({ voice }),
  setLanguage: language => set({ language, systemPrompt: generateSystemPrompt(language) }),
}));

/**
 * UI
 */
export const useUI = create<{
  isSidebarOpen: boolean;
  theme: Theme;
  toggleSidebar: () => void;
  toggleTheme: () => void;
}>(set => ({
  isSidebarOpen: false, // Default closed on mobile-first approach
  theme: 'dark',
  toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
  toggleTheme: () => set(state => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
}));

/**
 * Tools
 */
export interface FunctionCall {
  name: string;
  description?: string;
  parameters?: any;
  isEnabled: boolean;
  scheduling?: FunctionResponseScheduling;
}

export const useTools = create<{
  tools: FunctionCall[];
  template: Template;
  setTemplate: (template: Template) => void;
  toggleTool: (toolName: string) => void;
  addTool: () => void;
  removeTool: (toolName: string) => void;
  updateTool: (oldName: string, updatedTool: FunctionCall) => void;
}>(set => ({
  tools: [], // Default to no tools for read-aloud mode
  template: 'eburon-tts',
  setTemplate: (template: Template) => {
    // No-op for now as we only have one mode
  },
  toggleTool: (toolName: string) =>
    set(state => ({
      tools: state.tools.map(tool =>
        tool.name === toolName ? { ...tool, isEnabled: !tool.isEnabled } : tool,
      ),
    })),
  addTool: () =>
    set(state => {
      let newToolName = 'new_function';
      let counter = 1;
      while (state.tools.some(tool => tool.name === newToolName)) {
        newToolName = `new_function_${counter++}`;
      }
      return {
        tools: [
          ...state.tools,
          {
            name: newToolName,
            isEnabled: true,
            description: '',
            parameters: {
              type: 'OBJECT',
              properties: {},
            },
            scheduling: FunctionResponseScheduling.INTERRUPT,
          },
        ],
      };
    }),
  removeTool: (toolName: string) =>
    set(state => ({
      tools: state.tools.filter(tool => tool.name !== toolName),
    })),
  updateTool: (oldName: string, updatedTool: FunctionCall) =>
    set(state => {
      if (
        oldName !== updatedTool.name &&
        state.tools.some(tool => tool.name === updatedTool.name)
      ) {
        console.warn(`Tool with name "${updatedTool.name}" already exists.`);
        return state;
      }
      return {
        tools: state.tools.map(tool =>
          tool.name === oldName ? updatedTool : tool,
        ),
      };
    }),
}));

/**
 * Logs
 */
export interface LiveClientToolResponse {
  functionResponses?: FunctionResponse[];
}
export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

export interface ConversationTurn {
  timestamp: Date;
  role: 'user' | 'agent' | 'system';
  text: string;
  isFinal: boolean;
  toolUseRequest?: LiveServerToolCall;
  toolUseResponse?: LiveClientToolResponse;
  groundingChunks?: GroundingChunk[];
}

export const useLogStore = create<{
  turns: ConversationTurn[];
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) => void;
  updateLastTurn: (update: Partial<ConversationTurn>) => void;
  clearTurns: () => void;
}>((set, get) => ({
  turns: [],
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) =>
    set(state => ({
      turns: [...state.turns, { ...turn, timestamp: new Date() }],
    })),
  updateLastTurn: (update: Partial<Omit<ConversationTurn, 'timestamp'>>) => {
    set(state => {
      if (state.turns.length === 0) {
        return state;
      }
      const newTurns = [...state.turns];
      const lastTurn = { ...newTurns[newTurns.length - 1], ...update };
      newTurns[newTurns.length - 1] = lastTurn;
      return { turns: newTurns };
    });
  },
  clearTurns: () => set({ turns: [] }),
}));