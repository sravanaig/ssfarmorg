import { createClient } from '@supabase/supabase-js';

// --- IMPORTANT ---
// 1. Visit https://supabase.com/ to create a new project.
// 2. Go to 'Project Settings' > 'API'.
// 3. Copy your 'Project URL' and 'Project API keys' (use the 'anon' 'public' key).
// 4. Paste them here.
// For production, it's recommended to use environment variables.
// Fix: Added an explicit `string` type to prevent TypeScript from inferring a literal type, which caused a comparison error on line 12.
const supabaseUrl: string = 'https://hbnvryvzpthxldbrgbai.supabase.co'; // e.g., 'https://xyz.supabase.co'
// Fix: Added an explicit `string` type to prevent TypeScript from inferring a literal type, which caused a comparison error.
const supabaseKey: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnZyeXZ6cHRoeGxkYnJnYmFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyODU0ODcsImV4cCI6MjA3Njg2MTQ4N30.RRbPHtYNJqbBALh5WR94x9I4fMETl1GdWM36uyVoFMQ'; // e.g., 'ey...'

if (supabaseUrl === 'YOUR_SUPABASE_URL' || supabaseKey === 'YOUR_SUPABASE_ANON_KEY') {
    // A visible warning for the user to configure their credentials
    const warning = document.createElement('div');
    warning.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; padding: 12px; background-color: #fef2f2; color: #991b1b; text-align: center; z-index: 9999; font-family: sans-serif; border-bottom: 1px solid #fecaca;';
    warning.innerText = 'Supabase is not configured. Please add your project URL and anon key to lib/supabaseClient.ts';
    // Use requestAnimationFrame to ensure body exists
    requestAnimationFrame(() => {
       document.body.prepend(warning);
    });
}

export const supabase = createClient(supabaseUrl, supabaseKey);

const getProjectRef = (url: string): string | null => {
    try {
        const urlObj = new URL(url);
        const hostnameParts = urlObj.hostname.split('.');
        if (hostnameParts.length >= 3 && hostnameParts[1] === 'supabase') {
            return hostnameParts[0];
        }
        return null;
    } catch (e) {
        return null;
    }
}
export const projectRef = getProjectRef(supabaseUrl);
