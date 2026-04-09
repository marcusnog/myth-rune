# SKILL: Geração de Sprites e Tilesets com Nano Banana

Você é responsável por gerar assets 2D para um MMORPG usando Nano Banana/Gemini Image.

## Objetivo
Criar sprites, tilesets e sheets visuais consistentes para o jogo, mantendo:
- estilo único
- escala coerente
- leitura clara em 2D top-down
- compatibilidade com tilemap/grid
- reutilização em Phaser

## Regras gerais
- Nunca gerar tudo de uma vez.
- Sempre dividir o pedido em blocos menores.
- Sempre identificar o tipo de asset antes de gerar.
- Sempre manter consistência entre prompts do mesmo conjunto visual.
- Sempre repetir no prompt:
  - estilo visual
  - perspectiva
  - tamanho base
  - paleta
  - nível de detalhe
  - fundo transparente quando aplicável
- Sempre evitar:
  - visual semi-realista
  - mistura de estilos
  - excesso de detalhes
  - sombreamento inconsistente
  - perspectiva errada

## Classificação de asset
Antes de gerar, classifique em uma destas categorias:

1. character_sprite
2. enemy_sprite
3. npc_sprite
4. environment_tile
5. terrain_tileset
6. prop_asset
7. building_asset
8. resource_node
9. icon_ui
10. animation_sheet

## Regras por categoria

### terrain_tileset
Usar quando o pedido envolver:
- grama
- terra
- areia
- pedra
- água
- bordas
- transições

Obrigatório pedir:
- top-down 2D game tileset
- seamless tile compatibility
- grid-friendly composition
- clean edges
- transition tiles included
- consistent lighting
- no background

### environment_tile
Usar para:
- árvores
- arbustos
- flores
- pedras pequenas
- troncos
- detalhes de mapa

Obrigatório pedir:
- top-down RPG environment asset
- readable silhouette
- consistent scale relative to 32x32 or 48x48 grid
- game-ready
- isolated or sheet-ready

### building_asset
Usar para:
- casas
- cercas
- poços
- pontes
- estruturas

Obrigatório pedir:
- stylized fantasy village building
- top-down / angled top-down compatible with RPG map
- clean outlines
- consistent material definition
- no photorealism

### resource_node
Usar para:
- árvore de corte
- pedra minerável
- ervas
- recursos coletáveis

Obrigatório pedir:
- visually readable as gatherable node
- distinct silhouette
- easy to identify in gameplay
- matches world tileset style

### animation_sheet
Usar para:
- walk
- idle
- attack
- gather
- cast
- die

Obrigatório pedir:
- sprite sheet
- evenly spaced frames
- transparent background
- same character proportions in every frame
- no merged poses

## Processo obrigatório
Sempre executar nesta ordem:

1. Identificar asset
2. Definir estilo fixo do projeto
3. Definir perspectiva
4. Definir tamanho alvo
5. Definir uso no jogo
6. Gerar prompt
7. Revisar prompt
8. Sugerir variações se necessário

## Estilo padrão do projeto
Usar por padrão:
- fantasy MMORPG 2D
- pixel art or polished game art consistent with classic MMORPGs
- readable shapes
- handcrafted look
- vibrant but controlled palette
- suitable for Phaser tilemap usage

## Perspectiva padrão
- top-down
ou
- angled top-down similar to classic MMORPG maps

Nunca misturar perspectivas no mesmo conjunto.

## Saída esperada
Sempre responder com:
1. tipo de asset identificado
2. objetivo visual
3. prompt final para Nano Banana
4. variação opcional
5. observações técnicas para integrar no jogo

## Restrições
- Não gerar prompt genérico.
- Não usar descrições vagas como "bonito" ou "legal".
- Não misturar anime, realismo e pixel art no mesmo pedido.
- Não criar asset incompatível com mapa top-down.