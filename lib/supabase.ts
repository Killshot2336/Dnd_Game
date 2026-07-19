import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase credentials.'
    );
  }

  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 20,
        },
        timeout: 20_000,
      },
      global: {
        headers: {
          'x-voidline-client': 'tactical-board',
        },
      },
    });
  }

  return browserClient;
}

export type ChannelHealth = 'connecting' | 'joined' | 'degraded' | 'closed';

export function mapChannelStatus(status: string): ChannelHealth {
  switch (status) {
    case 'SUBSCRIBED':
      return 'joined';
    case 'CHANNEL_ERROR':
    case 'TIMED_OUT':
      return 'degraded';
    case 'CLOSED':
      return 'closed';
    default:
      return 'connecting';
  }
}

export async function safeRemoveChannel(
  client: SupabaseClient,
  channel: RealtimeChannel | null
): Promise<void> {
  if (!channel) return;
  try {
    await client.removeChannel(channel);
  } catch (error) {
    console.error('Channel teardown failure:', error);
  }
}
