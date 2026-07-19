-- Persistent portable characters (seed-shareable across games)
CREATE TABLE IF NOT EXISTS public.characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seed VARCHAR(16) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    template_id VARCHAR(40) NOT NULL,
    race VARCHAR(40) NOT NULL DEFAULT 'Human',
    class_name VARCHAR(40) NOT NULL,
    subclass VARCHAR(40) NOT NULL DEFAULT '',
    background VARCHAR(40) NOT NULL DEFAULT 'Folk Hero',
    level INT NOT NULL DEFAULT 1,
    stats JSONB NOT NULL DEFAULT '{"STR":10,"DEX":10,"CON":10,"INT":10,"WIS":10,"CHA":10}'::jsonb,
    skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
    backstory TEXT NOT NULL DEFAULT '',
    appearance TEXT NOT NULL DEFAULT '',
    ideals TEXT NOT NULL DEFAULT '',
    bonds TEXT NOT NULL DEFAULT '',
    flaws TEXT NOT NULL DEFAULT '',
    skin JSONB NOT NULL DEFAULT '{}'::jsonb,
    max_hp INT NOT NULL DEFAULT 12,
    armor_class INT NOT NULL DEFAULT 12,
    speed INT NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS characters_seed_idx ON public.characters (seed);

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seed VARCHAR(16),
  ADD COLUMN IF NOT EXISTS sheet_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_character_per_game'
  ) THEN
    ALTER TABLE public.players
      ADD CONSTRAINT unique_character_per_game UNIQUE (game_id, character_id);
  END IF;
END $$;

ALTER TABLE public.characters REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.characters;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "characters_anon_all" ON public.characters;
CREATE POLICY "characters_anon_all" ON public.characters
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.characters TO anon, authenticated;
