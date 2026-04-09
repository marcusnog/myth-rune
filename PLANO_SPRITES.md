# Atualizacao do plano de sprites para o estado real do repositorio

> Documento de trabalho para manifests JSON. Nenhum `.gd` ou `.tscn` entra neste escopo.
> Esta fase corrige metadados confiaveis e documentacao. Nao faz remapeamento visual do goblin.

---

## Summary

- O goblin em `client/assets/sprites/mobs/goblin/goblin_sprite_sheet.png` ja esta em `1024x1536`.
- O plano antigo baseado em `408x612` / `51x51` esta desatualizado para este repositorio.
- A intervencao no goblin sera conservadora: manter `row` e `frames` atuais, explicitar `columns`, `rows` e `animation_aliases`.
- Os quatro personagens jogaveis receberao os mesmos metadados explicitos por serem deterministicos e compativeis com o runtime atual.

---

## Estado real do repositorio

### Goblin

- PNG atual: `client/assets/sprites/mobs/goblin/goblin_sprite_sheet.png`
- Dimensoes reais: `1024x1536`
- Grelha real em uso nesta fase: `8x12`
- Celula: `128x128`
- Manifest atual ja usa `frame_size: 128x128`, mas ainda nao explicita `columns`, `rows` nem `animation_aliases`.

### Personagens jogaveis

- `warrior`, `mage`, `rogue` e `archer` usam PNGs `1024x1536`.
- Os manifests compartilham a mesma grelha logica: `8` colunas por `12` linhas com `frame_size: 128x128`.
- O runtime ja resolve nomes genericos e direcionais, mas declarar `animation_aliases` deixa o comportamento explicito e reduz ambiguidade.

### Referencias documentais que nao sao fonte de verdade para este ajuste

- `client/assets/sprites/mobs/goblin/goblin_animations.json`
- `tools/mob_atlas_config.json`

Esses arquivos descrevem layouts antigos ou alternativos do goblin. Eles nao devem ser usados para remapear `row`/`frames` do asset atual sem uma auditoria visual separada.

---

## Mudancas a implementar

### 1. Goblin

Arquivo:
- `client/assets/sprites/mobs/goblin/goblin_spritesheet.json`

Alteracoes:
- manter `frame_size: { "width": 128, "height": 128 }`
- adicionar `columns: 8`
- adicionar `rows: 12`
- adicionar:

```json
"animation_aliases": {
  "walk_right": "walk",
  "idle_right": "idle",
  "attack_right": "attack"
}
```

- preservar exatamente os `row`, `frames`, `fps` e `loop` atuais nesta fase

Fica fora de escopo agora:
- remapear `walk`, `idle` ou `attack`
- adicionar variantes direcionais novas
- ativar `death`
- eliminar completamente o warning de padding extra do goblin

### 2. Characters

Aplicar a todos:
- `client/assets/sprites/characters/warrior/warrior_spritesheet.json`
- `client/assets/sprites/characters/mage/mage_spritesheet.json`
- `client/assets/sprites/characters/rogue/rogue_spritesheet.json`
- `client/assets/sprites/characters/archer/archer_spritesheet.json`

Alteracoes:
- adicionar `columns: 8`
- adicionar `rows: 12`
- adicionar:

```json
"animation_aliases": {
  "walk_right": "walk",
  "idle_right": "idle",
  "attack_right": "attack"
}
```

Nao alterar:
- `animations`
- `fps`
- `loop`
- `frame_size`
- `default_facing`

---

## Validacao

### 1. Dimensoes dos PNGs

Validar com PIL:

```bash
python -c "from PIL import Image; from pathlib import Path; paths = [Path('client/assets/sprites/mobs/goblin/goblin_sprite_sheet.png'), Path('client/assets/sprites/characters/warrior/warrior_walk.png'), Path('client/assets/sprites/characters/mage/mage_walk.png'), Path('client/assets/sprites/characters/rogue/rogue_walk.png'), Path('client/assets/sprites/characters/archer/archer_walk.png')]; [print(p, Image.open(p).size) for p in paths]"
```

Esperado:
- goblin `1024x1536`
- warrior `1024x1536`
- mage `1024x1536`
- rogue `1024x1536`
- archer `1024x1536`

### 2. Verificacao do goblin

```bash
python tools/verify_mob_atlas.py --mob goblin
```

Esperado nesta fase:
- nenhum erro fatal
- warning de atlas maior que o minimo pode continuar a aparecer por causa das linhas nao usadas

### 3. Validacao no Godot

Abrir `client/` no Godot e verificar:
- personagens continuam carregando sem regressao
- aliases `walk_right`, `idle_right` e `attack_right` resolvem corretamente
- goblin continua funcional com o manifest atual, sem tentativa de remapeamento visual

---

## Assumptions

- O goblin nao sera remapeado visualmente nesta entrega.
- `goblin_animations.json` e `tools/mob_atlas_config.json` nao sao fonte de verdade para `row`/`frames` do goblin atual.
- `death` do goblin continua fora de escopo ate haver auditoria visual dedicada.
