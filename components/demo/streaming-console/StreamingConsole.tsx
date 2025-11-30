/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef, useState, memo } from 'react';
import { LiveConnectConfig, Modality, LiveServerContent } from '@google/genai';

import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import {
  useSettings,
  useLogStore,
  useTools,
  ConversationTurn,
} from '@/lib/state';

const formatTimestamp = (date: Date) => {
  const pad = (num: number, size = 2) => num.toString().padStart(size, '0');
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = pad(date.getMilliseconds(), 3);
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

// Helper component for Typewriter effect
const Typewriter = memo(({ text, isFinal }: { text: string; isFinal: boolean }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    // If it's a history item (loaded at once), show immediately
    if (Math.abs(text.length - displayedText.length) > 100 && isFinal) {
      setDisplayedText(text);
      return;
    }

    if (displayedText === text) return;

    // Calculate dynamic delay based on punctuation to simulate breathing
    const lastChar = displayedText.slice(-1);
    let delay = 30; // Base speed
    if (['.', '!', '?', ','].includes(lastChar)) {
      delay = 400; // Pause at punctuation
    }

    const timer = setTimeout(() => {
      setDisplayedText(text.slice(0, displayedText.length + 1));
    }, delay);

    return () => clearTimeout(timer);
  }, [text, displayedText, isFinal]);

  return <>{renderContent(displayedText)}</>;
});

const renderContent = (text: string) => {
  // Split by ```json...``` code blocks first to preserve them
  const parts = text.split(/(`{3}json\n[\s\S]*?\n`{3})/g);

  return parts.map((part, index) => {
    if (part.startsWith('```json')) {
      const jsonContent = part.replace(/^`{3}json\n|`{3}$/g, '');
      return (
        <pre key={index}>
          <code>{jsonContent}</code>
        </pre>
      );
    }

    // Process prose: Split by sentence endings for visual spacing
    // Look for . ! ? followed by space or end of string
    const sentences = part.split(/([.!?]+["']?)(?=\s|$)/g);
    
    return (
      <span key={index}>
        {sentences.map((sentencePart, sIndex) => {
           // If it's a punctuation chunk, add a break after it
           if (/^[.!?]+["']?$/.test(sentencePart)) {
             return <span key={sIndex}>{sentencePart}<br/><br/></span>;
           }
           
           // Handle Bold markdown within sentences
           const boldParts = sentencePart.split(/(\*\*.*?\*\*)/g);
           return (
             <span key={sIndex}>
               {boldParts.map((boldPart, bIndex) => {
                 if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
                   return <strong key={bIndex}>{boldPart.slice(2, -2)}</strong>;
                 }
                 return boldPart;
               })}
             </span>
           );
        })}
      </span>
    );
  });
};


export default function StreamingConsole() {
  const { client, setConfig } = useLiveAPIContext();
  const { systemPrompt, voice } = useSettings();
  const { tools } = useTools();
  const turns = useLogStore(state => state.turns);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const enabledTools = tools
      .filter(tool => tool.isEnabled)
      .map(tool => ({
        functionDeclarations: [
          {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        ],
      }));

    const config: any = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice,
          },
        },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: {
        parts: [
          {
            text: systemPrompt,
          },
        ],
      },
      tools: enabledTools,
    };

    setConfig(config);
  }, [setConfig, systemPrompt, tools, voice]);

  useEffect(() => {
    const { addTurn, updateLastTurn } = useLogStore.getState();

    const handleInputTranscription = (text: string, isFinal: boolean) => {
      const turns = useLogStore.getState().turns;
      const last = turns[turns.length - 1];
      if (last && last.role === 'user' && !last.isFinal) {
        updateLastTurn({
          text: last.text + text,
          isFinal,
        });
      } else {
        addTurn({ role: 'user', text, isFinal });
      }
    };

    const handleOutputTranscription = (text: string, isFinal: boolean) => {
      const turns = useLogStore.getState().turns;
      const last = turns[turns.length - 1];
      if (last && last.role === 'agent' && !last.isFinal) {
        updateLastTurn({
          text: last.text + text,
          isFinal,
        });
      } else {
        addTurn({ role: 'agent', text, isFinal });
      }
    };

    const handleContent = (serverContent: LiveServerContent) => {
      const text =
        serverContent.modelTurn?.parts
          ?.map((p: any) => p.text)
          .filter(Boolean)
          .join(' ') ?? '';
      const groundingChunks = serverContent.groundingMetadata?.groundingChunks;

      if (!text && !groundingChunks) return;

      const turns = useLogStore.getState().turns;
      const last = turns[turns.length - 1];

      if (last?.role === 'agent' && !last.isFinal) {
        const updatedTurn: Partial<ConversationTurn> = {
          text: last.text + text,
        };
        if (groundingChunks) {
          updatedTurn.groundingChunks = [
            ...(last.groundingChunks || []),
            ...groundingChunks,
          ];
        }
        updateLastTurn(updatedTurn);
      } else {
        addTurn({ role: 'agent', text, isFinal: false, groundingChunks });
      }
    };

    const handleTurnComplete = () => {
      const turns = useLogStore.getState().turns;
      const last = turns[turns.length - 1];
      if (last && !last.isFinal) {
        updateLastTurn({ isFinal: true });
      }
    };

    client.on('inputTranscription', handleInputTranscription);
    client.on('outputTranscription', handleOutputTranscription);
    client.on('content', handleContent);
    client.on('turncomplete', handleTurnComplete);

    return () => {
      client.off('inputTranscription', handleInputTranscription);
      client.off('outputTranscription', handleOutputTranscription);
      client.off('content', handleContent);
      client.off('turncomplete', handleTurnComplete);
    };
  }, [client]);

  // Scroll to bottom when turns change or text grows
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  return (
    <div className="transcription-container">
      {turns.length === 0 ? (
        <div className="waiting-placeholder">
          <span className="material-symbols-outlined icon">graphic_eq</span>
          <p>Waiting for Eburon Stream...</p>
        </div>
      ) : (
        <div className="transcription-view" ref={scrollRef}>
          {turns.map((t, i) => (
            <div
              key={i}
              className={`transcription-entry ${t.role} ${!t.isFinal ? 'interim' : ''
                }`}
            >
              <div className="transcription-header">
                <div className="transcription-source">
                  {t.role === 'user'
                    ? 'You'
                    : t.role === 'agent'
                      ? 'Eburon'
                      : 'System'}
                </div>
                <div className="transcription-timestamp">
                  {formatTimestamp(t.timestamp)}
                </div>
              </div>
              <div className="transcription-text-content">
                <Typewriter text={t.text} isFinal={t.isFinal} />
              </div>
              {t.groundingChunks && t.groundingChunks.length > 0 && (
                <div className="grounding-chunks">
                  <strong>Sources:</strong>
                  <ul>
                    {t.groundingChunks
                      .filter(chunk => chunk.web?.uri)
                      .map((chunk, index) => (
                        <li key={index}>
                          <a
                            href={chunk.web?.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {chunk.web?.title || chunk.web?.uri}
                          </a>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}