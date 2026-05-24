-- Synthire — Scoring model v2
--
-- Old shape (must sum to 100):
--   { "skills": 40, "experience": 30, "education": 20, "achievements": 10 }
--
-- New shape (independent 0-100 importance per dimension + sub-dimensions):
--   {
--     "skills":       { "importance": 80, "sub_dimensions": { "technical": 90, "soft": 60, "domain": 70 } },
--     "experience":   { "importance": 70, "sub_dimensions": { "years_relevant": 80, "industry_match": 60, "leadership": 50 } },
--     "education":    { "importance": 50, "sub_dimensions": { "degree_level": 60, "field_relevance": 70, "certifications": 40 } },
--     "achievements": { "importance": 60, "sub_dimensions": { "impact": 80, "recognition": 50 } }
--   }
--
-- The column type is still TEXT — only the JSON shape changes. Backend
-- query helpers parse both shapes for backward compatibility, but all
-- new writes use the v2 shape. Update the default for the column so any
-- new INSERT that omits scoring_weights gets v2 defaults.

-- Rewrite all existing rows to the v2 shape (one-time migration of any
-- jobs created before v2 — for hackathon-scale, this is safe because
-- there is no production data yet).
UPDATE jobs SET scoring_weights = json_object(
  'skills',       json_object('importance', 80, 'sub_dimensions', json_object('technical', 90, 'soft', 60, 'domain', 70)),
  'experience',   json_object('importance', 70, 'sub_dimensions', json_object('years_relevant', 80, 'industry_match', 60, 'leadership', 50)),
  'education',    json_object('importance', 50, 'sub_dimensions', json_object('degree_level', 60, 'field_relevance', 70, 'certifications', 40)),
  'achievements', json_object('importance', 60, 'sub_dimensions', json_object('impact', 80, 'recognition', 50))
)
WHERE scoring_weights NOT LIKE '%importance%';
