# Myth of Rune — Estrutura do repositório

Monorepo com **cliente Godot 4** (`client/`), **serviços Node/TypeScript** (gateway, login, world, combat), pacote **`shared`** (contratos Zod) e **assets** partilhados na raiz. **Docker Compose** na raiz orquestra Postgres, Redis e os serviços.

---

## Raiz

| Caminho | Descrição |
|--------|-----------|
| `package.json` | Workspaces npm (`shared`, `gateway`, `login-server`, `world-server`, `combat-server`), scripts de build. |
| `docker-compose.yml` | Stack de desenvolvimento (gateway exposto ao host, resto em rede interna). |
| `.env.example` | Variáveis de ambiente (DB, JWT, URLs, portas). |
| `assets/` | Arte e manifests de referência (sprites JSON, tilesets, HUD manifest); **em runtime o Godot só carrega `res://` a partir de `client/`** — o jogo usa **`client/assets/`**, não esta pasta, salvo cópias manuais. |
| `tools/` | Scripts Python na raiz do repo (fora de `client/`): validação de atlas, builds opcionais; **não** são `res://` — não substituem ficheiros em `client/assets/` sem correres o script explicitamente. |
| `goblin_sprite_spec.md` | Especificação de arte do goblin (referência). |
| `ui/` | HUD de referência (cópia legada); **o cliente activo está em `client/ui/hud/`**. |

---

## Cliente Godot — `client/`

O ficheiro de projeto é **`client/project.godot`**. Abrir o editor em **`myth-rune/client/`**.

```
client/
├── project.godot              # Cena principal: scenes/main/Main.tscn
├── README.txt
├── autoload/
│   ├── GameConfig.gd          # host/porta do gateway, URL WebSocket
│   └── Session.gd             # token JWT, dados do personagem
├── scripts/
│   ├── autoload/
│   │   ├── EventBus.gd        # Sinais globais (skills, HP, chat…)
│   │   ├── GameManager.gd     # Referência ao CharacterBody2D local
│   │   └── InputBootstrap.gd
│   ├── character_sprite.gd    # class_name CharacterSprite — AnimatedSprite2D: SpriteFrames com AtlasTexture por frame (JSON + PNG; grelha row+frame, não índice linear)
│   └── character_shadow.gd    # Sombra elíptica (_draw) sob personagens/mobs
├── assets/
│   ├── hud/
│   │   ├── manifest.json
│   │   └── README.txt         # Texturas opcionais para HudTheme
│   └── sprites/
│       ├── characters/
│       │   ├── party_lineup.jpg   # Ilustração partilhada (4 classes)
│       │   └── warrior|mage|rogue|archer/
│       │       └── *_spritesheet.json  # + textura referenciada no JSON
│       └── mobs/
│           └── goblin/
│               ├── goblin_spritesheet.json   # Manifest oficial: frame_size, columns, rows, animações, aliases, scale
│               ├── goblin_sprite_sheet.png   # Única textura de atlas em jogo (dimensões reais devem bater com o JSON)
│               └── goblin_animations.json    # Apenas documentação (não é lido pelo CharacterSprite)
├── scenes/
│   ├── main/
│   │   ├── Main.tscn          # Nó raiz + script; troca logo para Login (sem sprites de teste)
│   │   └── Main.gd            # Redireciona para Login (await frame)
│   ├── auth/
│   │   ├── Login.tscn
│   │   └── Login.gd           # HTTP register/login via gateway
│   ├── world/
│   │   ├── World.tscn         # HUD + ForestMap + RemotePlayers + Mobs + Player
│   │   ├── World.gd           # WebSocket, jogadores remotos, mobs do servidor, HUD
│   │   ├── ForestMap.tscn
│   │   └── ForestMap.gd       # TileMapLayer 800×600; spawns opcionais Mob.tscn (IA local)
│   └── characters/
│       ├── Player.tscn        # CharacterBody2D, cápsula, CharacterSprite, Camera2D
│       ├── Player.gd
│       ├── Mob.tscn           # Inimigo local: CharacterBody2D + CharacterSprite + sombra
│       └── Mob.gd
└── ui/hud/
    ├── HUD.tscn
    ├── HUD.gd                 # class_name MythHud
    ├── theme/
    │   ├── hud_styles.gd      # class_name HudStyles — cores
    │   └── hud_theme.gd       # class_name HudTheme — StyleBoxFlat / texturas
    └── components/
        ├── PlayerFrame.tscn / PlayerFrame.gd
        ├── Minimap.tscn / Minimap.gd
        ├── ChatStrip.tscn / ChatStrip.gd
        ├── SkillBarStrip.tscn / SkillBarStrip.gd
        └── … (outros componentes de referência: ChatBox, SkillBar, etc.)
```

### Autoloads (`project.godot`)

| Nome | Script |
|------|--------|
| `EventBus` | `scripts/autoload/EventBus.gd` |
| `GameManager` | `scripts/autoload/GameManager.gd` |
| `InputBootstrap` | `scripts/autoload/InputBootstrap.gd` |
| `GameConfig` | `autoload/GameConfig.gd` |
| `Session` | `autoload/Session.gd` |

---

## Pacote partilhado — `shared/`

TypeScript: tipos Zod para **auth**, **world** (mensagens WS), **combat**, enum de classes, `baseStatsForClass`.

```
shared/
├── src/
│   ├── character.ts
│   ├── index.ts
│   └── schemas/
│       ├── auth.ts
│       ├── combat.ts
│       ├── common.ts
│       └── world.ts
├── dist/                      # Saída compilada (consumida pelos serviços)
├── package.json
└── tsconfig.json
```

---

## Gateway — `gateway/`

HTTP reverse proxy: rate limit, `/health`, `/auth/*` → login-server, `/combat` → combat-server, `/ws` → world-server (WebSocket upgrade). Aliases `POST /login` e `POST /register` com reescrita para `/auth/*`.

```
gateway/src/
├── index.ts
├── config.ts
└── middleware/
```

---

## Login server — `login-server/`

Postgres: registos, JWT, bcrypt, migrações.

```
login-server/src/
├── index.ts
├── config.ts
├── db.ts
├── handlers/
├── services/
├── middleware/
└── migrations/
```

---

## World server — `world-server/`

WebSocket: token na query, sala por mapa, `welcome` / `state` / `combat_event`, validação de movimento, Redis para posição/eventos.

```
world-server/src/
├── index.ts
├── config.ts
├── world/
│   ├── room.ts
│   └── wsHandler.ts
├── services/
├── repositories/
└── …
```

---

## Combat server — `combat-server/`

Lógica de combate básica; integração com world via Redis.

```
combat-server/src/
```

---

## Infra — `infra/`

Ficheiros auxiliares de Docker/ambiente (se existirem).

---

## Fluxo rápido

1. **Main** → **Login** (HTTP) → **Session** com token.
2. **World**: liga WebSocket ao gateway (`/ws?token=…`), move o **Player** local, envia `move`, recebe `state` com outros jogadores e **mobs** (`mobType`, posição).
3. **HUD** (CanvasLayer): frame de jogador, minimapa, chat, hotbar; **EventBus** para skills e eventos futuros.
4. **Mobs**: instâncias sob `World/Mobs` com `CharacterSprite` + `setup_from_mob_type("goblin")`; opcionalmente **ForestMap** instancia `Mob.tscn` para IA local (conforme export).

---

## Pipeline visual de personagens e mobs

- **`CharacterSprite`** (`AnimatedSprite2D`) lê `res://assets/sprites/.../*_spritesheet.json`, constrói `SpriteFrames` com **`AtlasTexture`** por frame (`region` = sub-rect na folha). Não usa `Sprite2D.region_enabled` — o recorte é sempre por frame no `SpriteFrames`.
- **Jogadores**: `warrior_spritesheet.json`, etc., em `client/assets/sprites/characters/<classe>/`.
- **Goblin (oficial)**: só `client/assets/sprites/mobs/goblin/goblin_spritesheet.json` + `goblin_sprite_sheet.png` na mesma pasta. O manifest **tem de coincidir com a imagem real**: `frame_size` × `columns`/`rows` alinhados à largura/altura do PNG (caso contrário `_validate_grid_atlas` falha ou o recorte fica errado). Após trocar o PNG, reimporta a textura no Godot (`ResourceLoader` usa `CACHE_MODE_REPLACE` no carregamento).
- **Ferramentas** (`tools/` na raiz do repo): `verify_mob_atlas.py --mob goblin` compara PNG vs `goblin_spritesheet.json`; `mob_atlas_config.json` documenta grelha para scripts de build. Outros scripts (`build_mob_atlas.py`, `align_goblin_atlas_to_warrior.py`, etc.) são opcionais/legado — **não** fazem parte do loop de jogo. `generate_production_goblin_sheet.py` gera apenas `goblin_procedural_preview_only.png` (não é asset de jogo).

---

## Notas

- **Mapa jogável** no cliente: **800×600** unidades, alinhado a `MAP_BOUNDS` no world-server.
- **`project.godot`**: `textures/canvas_textures/default_texture_filter=0` (Nearest) e `2d/snap/snap_2d_transforms_to_pixel` (secção `[rendering]`) para alinhar sprites 2D ao pixel.
- **Assets em runtime**: tudo sob `res://` resolve dentro de **`client/`** (ex.: `res://assets/...` → `client/assets/...`). Ficheiros em `tools/` ou na raiz do repo **não** são carregados pelo jogo salvo serem copiados para `client/`.
- Pastas **`node_modules/`** e **`client/.godot/`** não estão listadas como parte do código-fonte; são geradas localmente.
