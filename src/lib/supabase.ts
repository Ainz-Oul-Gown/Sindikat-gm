import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://cqhndgtiqdjzzrqdzrfq.supabase.co';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxaG5kZ3RpcWRqenpycWR6cmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyODcxNzAsImV4cCI6MjA5ODg2MzE3MH0.Tt432Nn4A9z9IYiVQcePj9v0FEFJNdjGI5pywdFYSOQ';

const SUPABASE_URL = ((import.meta as any).env.VITE_SUPABASE_URL as string) || DEFAULT_URL;
const SUPABASE_ANON_KEY = ((import.meta as any).env.VITE_SUPABASE_ANON_KEY as string) || DEFAULT_ANON_KEY;

let currentToken = localStorage.getItem('synd_token');

if (currentToken && !currentToken.startsWith('eyJ')) {
  localStorage.removeItem('synd_token');
  currentToken = null;
}

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      apikey: SUPABASE_ANON_KEY,
    },
    fetch: (url, options) => {
      const newHeaders = new Headers(options?.headers || {});
      newHeaders.set('apikey', SUPABASE_ANON_KEY);
      if (currentToken) {
        newHeaders.set('Authorization', `Bearer ${currentToken}`);
      } else {
        newHeaders.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
      }
      if (options) {
        options.headers = newHeaders;
      }
      return fetch(url, options);
    },
  },
  realtime: {
    accessToken: async () => {
      return currentToken || SUPABASE_ANON_KEY;
    },
  },
});

export function setSupabaseToken(token: string | null) {
  currentToken = token;
  if (token) {
    localStorage.setItem('synd_token', token);
    // @ts-ignore - access to internal realtime client to set auth
    if (supabaseClient.realtime && typeof supabaseClient.realtime.setAuth === 'function') {
      // @ts-ignore
      supabaseClient.realtime.setAuth(token);
    }
  } else {
    localStorage.removeItem('synd_token');
  }
}

export function getSupabaseToken() {
  return currentToken;
}

export function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}
