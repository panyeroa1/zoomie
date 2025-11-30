/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bqktujpwhzqdugmgezkf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxa3R1anB3aHpxZHVnbWdlemtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTg4MjgsImV4cCI6MjA3OTk5NDgyOH0.DgzZyT3w1nDxm-ORYwZQ6cRC16pi6l3ycEXRefwa0IM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export interface EburonTTSCurrent {
  id: number;
  client_id: string | null;
  source_text: string;
  source_lang_code: string | null;
  source_lang_label: string | null;
  translated_text: string | null;
  target_language: string | null;
  updated_at: string;
}
