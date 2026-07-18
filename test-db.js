import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cqhndgtiqdjzzrqdzrfq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxaG5kZ3RpcWRqenpycWR6cmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyODcxNzAsImV4cCI6MjA5ODg2MzE3MH0.Tt432Nn4A9z9IYiVQcePj9v0FEFJNdjGI5pywdFYSOQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('device_requests').insert({ user_id: 1, device_name: 'test', temp_pub_key: 'test', status: 'pending' }).select();
  console.log('insert anon select:', data, error);
}

run();
