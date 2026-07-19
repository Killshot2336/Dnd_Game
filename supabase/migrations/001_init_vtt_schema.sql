-- Drop tables if updating an existing deployment loop
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.players CASCADE;
DROP TABLE IF EXISTS public.games CASCADE;

-- Core Campaigns Session Engine Matrix
CREATE TABLE public.games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_code VARCHAR(6) UNIQUE NOT NULL,
    current_narrative TEXT NOT NULL DEFAULT 'The dynamic void initializes. Welcome, degenerates.',
    state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Real-Time Party Member Ledger Tracking Stats & Core Attributes
CREATE TABLE public.players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES public.games(id) ON DELETE CASCADE NOT NULL,
    user_name VARCHAR(50) NOT NULL,
    avatar_class VARCHAR(30) NOT NULL,
    stats JSONB NOT NULL DEFAULT '{"STR":10,"DEX":10,"CON":10,"INT":10,"WIS":10,"CHA":10}'::jsonb,
    current_hp INT NOT NULL DEFAULT 15,
    max_hp INT NOT NULL DEFAULT 15,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_user_per_game UNIQUE (game_id, user_name)
);

-- Persistent Ledger of Unfiltered Live Dialogue & Structural Actions
CREATE TABLE public.messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    game_id UUID REFERENCES public.games(id) ON DELETE CASCADE NOT NULL,
    sender VARCHAR(50) NOT NULL, -- 'GM', or player user_name
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Inject Tables into the Supabase Real-Time Wall Replication Engine
ALTER TABLE public.games REPLICA IDENTITY FULL;
ALTER TABLE public.players REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE public.games, public.players, public.messages;
COMMIT;

-- Couch co-op: open anon access for private local sessions (tighten for public deploy)
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "games_anon_all" ON public.games;
DROP POLICY IF EXISTS "players_anon_all" ON public.players;
DROP POLICY IF EXISTS "messages_anon_all" ON public.messages;

CREATE POLICY "games_anon_all" ON public.games
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "players_anon_all" ON public.players
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "messages_anon_all" ON public.messages
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.games TO anon, authenticated;
GRANT ALL ON TABLE public.players TO anon, authenticated;
GRANT ALL ON TABLE public.messages TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
