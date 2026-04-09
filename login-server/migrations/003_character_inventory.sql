ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS inventory JSONB NOT NULL DEFAULT '{}';

-- Dar todos os items ao personagem de teste@teste.com.br para testes
UPDATE characters c
SET inventory = '{
  "wood": 99,
  "plank": 99,
  "wood_handle": 99,
  "stone": 99,
  "cut_stone": 99,
  "simple_axe": 5,
  "simple_pickaxe": 5
}'
FROM users u
WHERE c.user_id = u.id
  AND u.email = 'teste@teste.com.br';
