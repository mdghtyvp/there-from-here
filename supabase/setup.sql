-- There From Here — Supabase setup
-- Run this in your Supabase project's SQL editor (supabase.com → SQL Editor)

-- Score collection table
CREATE TABLE daily_scores (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  puzzle_id    integer NOT NULL,
  score        integer NOT NULL CHECK (score BETWEEN 1 AND 100),
  submitted_at timestamptz DEFAULT now()
);

-- Allow anonymous reads and writes (no login required)
ALTER TABLE daily_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert" ON daily_scores FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select" ON daily_scores FOR SELECT TO anon USING (true);

-- RPC function: returns avg score, total players, and rank for a given puzzle + score
-- Using SECURITY DEFINER so it runs with table owner privileges
CREATE OR REPLACE FUNCTION get_puzzle_stats(p_puzzle_id integer, p_score integer)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'avg_score',    ROUND(AVG(score))::integer,
    'total',        COUNT(*)::integer,
    'rank',         (
                      SELECT COUNT(*)::integer + 1
                      FROM daily_scores
                      WHERE puzzle_id = p_puzzle_id
                        AND score > p_score
                    )
  )
  FROM daily_scores
  WHERE puzzle_id = p_puzzle_id;
$$;
