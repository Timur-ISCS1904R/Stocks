import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mujrwgdrdizmodmipglx.supabase.co'; // твой URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11anJ3Z2RyZGl6bW9kbWlwZ2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NzU0NDAsImV4cCI6MjA3MDQ1MTQ0MH0.r1VP0MmvJniyyQ3gmwmV-mKAFYMWmlbL3Ho5l5Izm3E'; // твой анонимный ключ

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
