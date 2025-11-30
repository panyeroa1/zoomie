/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef } from 'react';
import { supabase, EburonTTSCurrent } from '../lib/supabase';
import { useLiveAPIContext } from '../contexts/LiveAPIContext';
import { useLogStore } from '../lib/state';

// Worker script to ensure polling continues even when tab is in background
const workerScript = `
  self.onmessage = function() {
    setInterval(() => {
      self.postMessage('tick');
    }, 5000);
  };
`;

// Helper to segment text into natural reading chunks (2-3 sentences)
const segmentText = (text: string): string[] => {
  if (!text) return [];
  
  // Split by sentence endings, keeping the punctuation attached
  // Matches "Sentence." or "Sentence!" or "Sentence?"
  const sentences = text.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [text];
  
  const chunks: string[] = [];
  let currentChunk = '';
  let sentenceCount = 0;

  for (const sentence of sentences) {
    const cleanSentence = sentence.trim();
    if (!cleanSentence) continue;
    
    currentChunk += cleanSentence + ' ';
    sentenceCount++;
    
    // Create a chunk every 2-3 sentences or if it gets too long, to provide breathing room
    if (sentenceCount >= 3 || currentChunk.length > 200) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
      sentenceCount = 0;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
};

export default function DatabaseBridge() {
  const { client, connected } = useLiveAPIContext();
  const { addTurn } = useLogStore();
  const lastProcessedIdRef = useRef<number | null>(null);
  
  // High-performance queue using Refs to handle data spikes without re-renders
  const queueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);

  // Processing Loop
  // Defined as a ref-stable function or just inside effect? 
  // Inside effect to capture current 'connected' state closure, 
  // but needs to be careful about stale closures if effect doesn't re-run.
  // We'll rely on the Ref for queue and checks against the 'connected' prop passed in deps.

  // Data Ingestion & Processing Logic
  useEffect(() => {
    // Clear queue on mount/connect to ensure we start fresh
    queueRef.current = [];
    isProcessingRef.current = false;

    if (!connected) return;

    // The consumer loop that processes the queue sequentially
    const processQueueLoop = async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        // While there are items and we are still connected
        // Note: We check queueRef.current.length directly
        while (queueRef.current.length > 0) {
          const textChunk = queueRef.current[0];

          // Log to console
          addTurn({
            role: 'system',
            text: `[Reading Segment] ${textChunk}`,
            isFinal: true
          });

          // Send to Gemini Live
          client.send([{ text: textChunk }]);

          // Remove the item we just sent
          queueRef.current.shift();

          // Dynamic delay calculation for human-like pacing
          // Heuristic: ~2.5 words per second reading speed
          const wordCount = textChunk.split(/\s+/).length;
          const readTime = (wordCount / 2.5) * 1000;
          
          // Buffer of 5-8 seconds as requested
          const bufferTime = 5000 + (Math.random() * 3000); 
          const totalDelay = readTime + bufferTime;
          
          // Wait before processing next chunk
          await new Promise(resolve => setTimeout(resolve, totalDelay));
        }
      } catch (e) {
        console.error('Error in processing loop:', e);
      } finally {
        isProcessingRef.current = false;
        // If items were added while we were waiting at the end of the loop,
        // and the loop exited (e.g. some race condition), strictly the while loop handles it.
        // But if we want to be doubly sure, we could re-check. 
        // The while loop condition `queueRef.current.length > 0` handles the re-check naturally.
      }
    };

    const processNewData = (data: EburonTTSCurrent) => {
      if (!data || !data.source_text) return;

      // Deduplicate based on ID
      if (lastProcessedIdRef.current === data.id) {
        return;
      }

      lastProcessedIdRef.current = data.id;
      
      // Segment the text
      const segments = segmentText(data.source_text);
      
      if (segments.length > 0) {
        addTurn({
          role: 'system',
          text: `[Database] New Source (ID: ${data.id}) - Buffered ${segments.length} segments.`,
          isFinal: true
        });

        // Push new segments to the back of the queue
        queueRef.current.push(...segments);

        // Trigger the consumer loop if it's asleep
        processQueueLoop();
      }
    };

    const fetchLatest = async () => {
      const { data, error } = await supabase
        .from('eburon_tts_current')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (!error && data) {
        processNewData(data as EburonTTSCurrent);
      }
    };

    // 1. Initialize Web Worker for background polling
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = () => {
      fetchLatest();
    };
    worker.postMessage('start');

    // 2. Setup Realtime Subscription
    const channel = supabase
      .channel('bridge-realtime-opt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'eburon_tts_current' },
        (payload) => {
          if (payload.new) {
             processNewData(payload.new as EburonTTSCurrent);
          }
        }
      )
      .subscribe();

    // 3. Initial Fetch
    fetchLatest();

    return () => {
      worker.terminate();
      supabase.removeChannel(channel);
      // We don't strictly need to empty the queue on unmount, 
      // but the `connected` check in the loop will stop processing naturally if this component unmounts (via context).
    };
  }, [connected, client, addTurn]);

  return null;
}