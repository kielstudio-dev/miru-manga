import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Supabase Configuration for Kiel Studio Devs / Miru Manga
export const SUPABASE_URL = 'https://rtcozpbrwpkjuualkivq.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0Y296cGJyd3BranV1YWxraXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NjgyMjIsImV4cCI6MjEwODA0NDIyMn0.uT6bdhTzC0ejuzMvagVa4iebx4tShrS3qWQZCZQEThk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
