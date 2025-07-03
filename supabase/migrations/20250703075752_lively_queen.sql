/*
  # Add scramble mode support to leaderboard

  1. Schema Changes
    - Scramble mode entries will use 'scramble' as the mode value
    - Standard mode entries will continue using 'normal', 'hard', 'filler'
    - No schema changes needed, just clarification of data structure

  2. Data Structure
    - Standard modes: mode = 'normal'|'hard'|'filler'
    - Scramble modes: mode = 'scramble' (difficulty stored separately if needed)
    
  3. Security
    - Maintain existing RLS policies
*/

-- No schema changes needed, just documenting the data structure
-- Scramble entries will be stored with mode = 'scramble'
-- Standard entries continue with mode = difficulty name

-- This migration serves as documentation for the scramble leaderboard structure
SELECT 1; -- Placeholder to make this a valid migration