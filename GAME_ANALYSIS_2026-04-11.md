# Myth of Rune — Documentação Técnica Completa
**Data:** 2026-04-11 | **Autor:** Claude Code | **Versão:** 1.0

---

## Sumário

1. [Visão Geral do Projeto](#1-visão-geral-do-projeto)
2. [Arquitetura de Serviços](#2-arquitetura-de-serviços)
3. [Contratos de Dados (Shared)](#3-contratos-de-dados-shared)
4. [Sistema de Autenticação](#4-sistema-de-autenticação)
5. [Sistema de Jogo (World Server)](#5-sistema-de-jogo-world-server)
6. [Sistema de Combate](#6-sistema-de-combate)
7. [Sistema de Progressão](#7-sistema-de-progressão)
8. [Sistema de Inventário e Loot](#8-sistema-de-inventário-e-loot)
9. [Sistema de NPCs e Quests](#9-sistema-de-npcs-e-quests)
10. [Sistema de Coleta e Crafting](#10-sistema-de-coleta-e-crafting)
11. [Cliente Phaser 3](#11-cliente-phaser-3)
12. [Infraestrutura e Deploy](#12-infraestrutura-e-deploy)
13. [Estado de Implementação](#13-estado-de-implementação)
14. [Vulnerabilidades e Pontos Críticos](#14-vulnerabilidades-e-pontos-críticos)
15. [Melhorias e Próximos Passos](#15-melhorias-e-próximos-passos)
16. [Checklist de Produção](#16-checklist-de-produção)

---

## 1. Visão Geral do Projeto

**Myth of Rune** é um MMORPG 2D web-based com arquitetura de microsserviços. O jogo é jogado via browser com gráficos top-down (Phaser 3), multiplayer em tempo real via WebSocket, e lógica autoritária no servidor para evitar trapaças.

### Stack Tecnológico

| Camada | Tecnologia |
|--------|-----------|
| Cliente | Phaser 3 + TypeScript + Vite |
| Gateway | Node.js + Express + http-proxy-middleware |
| Autenticação | Node.js + Express + bcryptjs + JWT |
| Jogo (Mundo) | Node.js + WebSocket (ws) |
| Combate | Node.js + Express (separado, atualmente inativo) |
| Banco de Dados | PostgreSQL 16 |
| Cache/Real-time | Redis 7 |
| Validação | Zod (schemas compartilhados) |
| Infra | Docker Compose |
| Monorepo | npm workspaces |

---

## 2. Arquitetura de Serviços

```
Internet
    │
    ▼
┌─────────────────────────────────────────┐
│           GATEWAY  :3000                │
│  • CORS, Rate-limit (300 req/min)       │
│  • /auth     → login-server :3001       │
│  • /ws       → world-server :3002 (WS) │
│  • /combat   → combat-server :3003      │
└─────────────────────────────────────────┘
    │              │              │
    ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│  LOGIN   │  │  WORLD   │  │ COMBAT   │
│  :3001   │  │  :3002   │  │  :3003   │
│ Auth JWT │  │ WS Game  │  │ (inativo)│
└──────────┘  └──────────┘  └──────────┘
    │              │
    ▼              ▼
┌─────────────────────────────────────────┐
│        PostgreSQL  +  Redis             │
│  usuarios / chars  |  posição / sessão  │
└─────────────────────────────────────────┘
```

### Responsabilidades por Serviço

#### Gateway (`gateway/src/index.ts`)
- Ponto de entrada único para todo tráfego
- Rate limiting global: 300 req/min via `express-rate-limit`
- Rate limiting de auth: 30 req/min
- Proxy transparente — não lê ou modifica payloads
- CORS configurado com `origin: true` (ver seção de vulnerabilidades)

#### Login Server (`login-server/src/`)
- `POST /auth/register` — cria usuário + personagem em transação atômica
- `POST /auth/login` — valida credenciais, retorna JWT `{ sub: userId, cid: characterId }`
- Senhas com bcrypt 10 rounds
- Migrações SQL em `login-server/migrations/`

#### World Server (`world-server/src/`)
- WebSocket server (protocolo `ws://`)
- Estado em memória: jogadores conectados, mobs, loot drops
- Persistência periódica (250ms) para PostgreSQL + Redis
- Loop de tick dos mobs: 160ms
- Autoridade total sobre combate, posição (após validação), inventário

#### Combat Server (`combat-server/src/`)
- Definido e dockerizado mas **não utilizado**
- Destino: centralizar resolução de combate em caso de múltiplos world-servers
- `POST /combat/attack` existe mas world-server não roteia para cá

---

## 3. Contratos de Dados (Shared)

Todos os tipos e schemas residem em `shared/src/` e são importados pelos serviços via `@myth-of-rune/shared`. Nunca redefina tipos localmente.

### `shared/src/schemas/world.ts` — Mensagens WebSocket

**Cliente → Servidor:**
```typescript
{ type: "move",          payload: { x: number, y: number } }
{ type: "attack",        payload: { targetMobId: string } }
{ type: "aoe_attack",    payload: { skillId: string } }
{ type: "equip_rune",    payload: { slotIndex: 0|1|2, runeId: string } }
{ type: "equip_item",    payload: { slot: "weapon"|"armour", itemId: string } }
{ type: "use_item",      payload: { itemId: string } }
{ type: "pickup_loot",   payload: { dropId: string } }
{ type: "respawn",       payload: {} }
{ type: "gather_complete", payload: { resourceType: string } }
{ type: "npc_action",    payload: { npcId: string, actionId: string } }
{ type: "open_npc_panel", payload: { npcId: string } }
{ type: "inventory_sync", payload: { inventory: Record<string, number> } }
```

**Servidor → Cliente:**
```typescript
{ type: "welcome",    payload: { characterId, name, class, x, y, health, maxHealth, level, experience, equippedRunes, equipment, inventory, stats, questState } }
{ type: "state",      payload: { players: [...], mobs: [...], loot: [...] } }
{ type: "progression", payload: { level, experience, xpToNext, equippedRunes, stats } }
{ type: "combat_event", payload: { attackerId, targetId, damage, isCrit, targetHealth, targetMaxHealth } }
{ type: "inventory", payload: { inventory: Record<string, number> } }
{ type: "error",      payload: { code: string, message: string } }
{ type: "npc_panel",  payload: { npcId, items?, services? } }
{ type: "dialogue",   payload: { npcId, lines: string[] } }
{ type: "quest_update", payload: { questId, status, progress } }
```

### `shared/src/character.ts` — Classes e Stats Base

| Classe | HP | ATK | DEF | MoveSpeed | Power | Crit | Dodge |
|--------|----|-----|-----|-----------|-------|------|-------|
| warrior | 148 | 17 | 10 | 4.2 | 22 | 0.08 | 0.05 |
| mage | 76 | 21 | 2 | 3.7 | 28 | 0.12 | 0.07 |
| rogue | 86 | 15 | 4 | 4.6 | 18 | 0.22 | 0.16 |
| archer | 98 | 16 | 6 | 4.0 | 20 | 0.14 | 0.09 |

### `shared/src/combatRules.ts` — Constantes de Combate

| Constante | Valor |
|-----------|-------|
| Alcance melee (padrão) | 72 unidades |
| Alcance melee (mago) | 196 unidades |
| Cooldown do jogador | 550ms |
| Cooldown do mob | 1400ms |
| Multiplicador de crítico | 1.75x |
| Defesa dos mobs | 4 |
| Dano dos mobs | 14 |
| Invulnerabilidade pós-hit (jogador) | 320ms |
| Invulnerabilidade pós-hit (mob) | 220ms |
| Telegraf do mob (delay visual) | 260ms |
| Invulnerabilidade pós-respawn | 1200ms |

### `shared/src/progression.ts` — XP e Níveis

- Nível máximo: **20**
- Fórmula de XP: `70 + (level-1)×40 + (level-1)²×18`
- Scaling de atributos por nível: `+8 HP`, `+2 ATK`, `+1.2 DEF`
- Crítico máximo: 50%, Esquiva máxima: 35%

### `shared/src/skills.ts` — Habilidades

| Classe | Skill | Cooldown | Raio | Efeito Extra |
|--------|-------|----------|------|--------------|
| warrior | Giro de Aço | 9s | 92 | — |
| mage | Círculo Arcano | 8.5s | 140 | — |
| rogue | Passo das Sombras | 10s | 84 | +100% vel. por 3.2s |
| archer | Rajada de Flechas | 9.5s | 156 | — |

---

## 4. Sistema de Autenticação

### Fluxo de Registro

```
Cliente → POST /auth/register { email, password, characterName, characterClass }
    → Zod validate
    → bcrypt.hash(password, 10)
    → BEGIN TRANSACTION
        → INSERT INTO users (id, email, password_hash)
        → INSERT INTO characters (id, user_id, name, class, map_id="starter_town", x=400, y=400, health=baseHp, inventory={}, equipment={}, quest_state={})
    → COMMIT
    → Retorna JWT { sub: userId, cid: characterId }
```

### Fluxo de Login

```
Cliente → POST /auth/login { email, password }
    → Busca usuário por email (case-insensitive, trimmed)
    → bcrypt.compare(password, hash)
    → Retorna JWT + dados do personagem
```

### Token JWT

```json
{
  "sub": "uuid-do-usuario",
  "cid": "uuid-do-personagem",
  "iat": 1713000000,
  "exp": 1713003600
}
```

- Assinado com `JWT_SECRET` (HS256)
- Expiração: `JWT_EXPIRES_SECONDS` (padrão: 3600s)
- Passado no WebSocket como query param: `ws://gateway/ws?token=<jwt>`

### Verificação no World Server

```typescript
// world-server/src/services/jwtService.ts
const payload = jwt.verify(token, JWT_SECRET); // lança se inválido
// { sub: userId, cid: characterId }
```

---

## 5. Sistema de Jogo (World Server)

### Estrutura do Jogador Conectado (`ConnectedPlayer`)

```typescript
{
  characterId: string
  userId: string
  name: string
  characterClass: CharacterClass
  x: number, y: number
  health: number, maxHealth: number
  level: number, experience: number
  equippedRunes: [RuneId|null, RuneId|null, RuneId|null]
  equipment: { weapon: string|null, armour: string|null }
  stats: DerivedStats          // calculado a partir da classe + runas + equipamentos + nível
  lastMoveAt: number           // timestamp para validação de velocidade
  lastPersistAt: number        // throttle de persistência (250ms)
  lastAttackAt: number         // cooldown de ataque
  lastSkillAtById: Record<string, number>  // cooldown por skill
  invulnerableUntilMs: number  // invulnerabilidade pós-hit
  questState: QuestState
  socket: WebSocket
  isDead: boolean
}
```

### Loop de Movimento

```
Cliente envia { type: "move", payload: { x, y } }
    → validateMove(player, newX, newY) — valida velocidade máxima
    → resolveWorldCollision(newX, newY) — resolve colisão com tiles
    → player.x = finalX, player.y = finalY
    → Redis cache: SET position:<cid> {x, y, mapId} EX 120
    → DB persist: UPDATE characters SET x=$1, y=$2 (throttled 250ms)
    → broadcastJson(stateSnapshot) a todos jogadores
```

### Loop de Mobs (`tickMobs` — 160ms)

```
Para cada mob vivo:
    1. WANDER: move em direção aleatória (vel: 32 u/s)
    2. Se jogador dentro de 250 unidades → CHASE
       - Move em direção ao jogador (vel: 48 u/s)
       - Se fora de 320 unidades da origem → LEASH (retorna)
    3. Se jogador dentro de alcance (56u) e cooldown OK:
       - Telegraph: 260ms delay
       - Rola dano: 14 - playerDEF
       - Verifica invulnerabilidade e esquiva
       - Aplica dano ao jogador
       - Broadcast combat_event
    4. Mob morto: respawn em 18s
```

### Persistência de Estado

| Dado | Storage | Frequência |
|------|---------|------------|
| Posição | Redis (120s TTL) + PostgreSQL | A cada 250ms se moveu |
| Health | PostgreSQL | Imediatamente ao receber dano |
| Inventário | PostgreSQL | Após cada mudança |
| Equipamento | PostgreSQL | Após equip/unequip |
| Quest State | PostgreSQL | Após cada atualização |
| Posição final | PostgreSQL | On disconnect |

---

## 6. Sistema de Combate

### Ataque do Jogador (Single Target)

```typescript
handleAttack(player, { targetMobId })
    → Valida: mob existe e não está morto
    → Valida: distância ≤ attackRange(class)
    → Valida: cooldown (550ms)
    → Valida: jogador não está morto
    → Valida: player.invulnerableUntilMs (não aplicável a ataque, só a dano)

    → Cálculo de dano:
       baseDamage = max(1, player.stats.attack - MOB_DEFENSE)
       power = player.stats.power
       damage = baseDamage + floor(power × 0.2)
       if (random() < stats.critChance) damage *= CRIT_MULTIPLIER

    → mob.health -= damage
    → mob.invulnerableUntilMs = now + 220ms
    → Se mob.health ≤ 0:
         → xpGained = 30 (base mob XP)
         → grantXP(player, xpGained)
         → spawnLootForMobDeath(mob)
         → mob.isDead = true, agendar respawn em 18s
    → Broadcast: combat_event + state
```

### Ataque AOE (Skill)

```typescript
handleAoeAttack(player, { skillId })
    → Valida: skill pertence à classe do jogador
    → Valida: cooldown da skill
    → player.lastSkillAtById[skillId] = now

    → Para cada mob vivo dentro de skill.impactRadius:
         → Aplica dano (mesma fórmula)
         → Se morto: XP + loot + respawn timer
    → Buff de velocidade se for Rogue (shadow step)
    → Broadcast estado
```

### Progressão de XP

```typescript
grantXP(player, amount)
    → player.experience += amount
    → while (player.experience >= xpToNextLevel(player.level)):
         player.experience -= xpRequired
         player.level++
         // recalculate stats with new level
    → Persist to DB
    → Enviar "progression" ao jogador
```

---

## 7. Sistema de Progressão

### Cálculo de Stats Derivados

```typescript
derivedStatsForCharacter(characterClass, level, equippedRunes, equipment)
    → base = CLASS_BASE_STATS[characterClass]
    → runeBonuses = sumRuneBonuses(equippedRunes)
    → equipBonuses = sumEquipmentBonuses(equipment)
    → levelBonus = { hp: (level-1)*8, attack: (level-1)*2, defense: (level-1)*1.2 }

    → final.maxHp = base.hp + runeBonuses.hp + equipBonuses.hp + levelBonus.hp
    → final.attack = base.attack + runeBonuses.attack + equipBonuses.attack + levelBonus.attack
    → final.defense = base.defense + runeBonuses.defense + equipBonuses.defense + levelBonus.defense
    → final.moveSpeed = moveSpeedToWorldUnits(base + runeBonuses.speed + equipBonuses.speed)
    → final.critChance = min(0.5, base.crit)
    → final.dodgeChance = min(0.35, base.dodge)
```

### Runas Disponíveis

| ID | Unlock | Bônus |
|----|--------|-------|
| ember | Nível 1 | +2 ATK |
| bulwark | Nível 1 | +14 HP, +1 DEF |
| gust | Nível 1 | +0.24 moveSpeed |
| siphon | Nível 3 | +8 HP, +3 ATK |
| warden | Nível 5 | +18 HP, +2 DEF |
| celerity | Nível 7 | +1 ATK, +0.38 moveSpeed |

### Equipamentos

| Item | Slot | Bônus |
|------|------|-------|
| simple_axe | weapon | +2 ATK |
| simple_pickaxe | weapon | +1 ATK |
| leather_armour | armour | +10 HP, +3 DEF, -0.05 moveSpeed |

---

## 8. Sistema de Inventário e Loot

### Estrutura do Inventário

```typescript
// Armazenado como JSONB no PostgreSQL
inventory: Record<string, number>
// Ex: { "gold_coin": 25, "wood": 4, "stone": 2, "health_potion": 1 }
```

### Tabela de Loot por Mob

| Mob | Item | Chance |
|-----|------|--------|
| goblin | gold_coin (1-3) | 90% |
| goblin | wood (1-2) | 40% |
| goblin | stone (0-1) | 25% |
| zombie | gold_coin (1-2) | 80% |
| zombie | bone_fragment | 50% |
| wolf | wolf_pelt | 60% |
| wolf | gold_coin (1-2) | 70% |
| ent | wood (2-4) | 95% |
| ent | plank (1-2) | 45% |
| ent | gold_coin (2-4) | 75% |

### Ciclo de Vida do Loot Drop

```
Mob morre → spawnLootForMobDeath()
    → Rola chance por item da DROP_TABLE
    → Cria LootDrop { id: uuid, x, y, items, expiresAt: now + 60s }
    → Adiciona ao Map<dropId, LootDrop> em memória
    → Broadcast state com loot drops

Jogador pega → handlePickupLoot({ dropId })
    → Verifica drop existe
    → Verifica distância ≤ 64 unidades
    → Verifica não expirado
    → Adiciona itens ao inventário do jogador no DB
    → Remove drop da memória
    → Broadcast inventory + state
```

**Limitação:** Drops não são persistidos — um restart do servidor elimina todos os drops no chão.

---

## 9. Sistema de NPCs e Quests

### NPCs Ativos na Vila Inicial

| NPC | Tipo | Função |
|-----|------|--------|
| Merchant Mira | Comerciante | Venda de itens (poção, ferramentas) |
| Healer Lyra | Serviço | Cura completa por 10 gold |
| Captain Brom | Quest Giver | Quest "Goblin Menace" |
| Elder Bran | Diálogo | História do mundo |
| Ranger Kael | Diálogo | Dicas de jogo |
| Blacksmith Torren | Diálogo | Crafting hints |
| Guard Hale | Diálogo | Lore da vila |
| Mage Elowen | Diálogo | Lore de magia |

### Quest "Goblin Menace"

```
Estado: available → active → ready → completed

available:  Jogador fala com Captain Brom, aceita quest
active:     Mata goblins (contador em questState.goblin_menace.progress)
            Counter incrementa a cada goblin morto
ready:      progress ≥ 4 (objetivo: 4 goblins)
completed:  Fala com Brom novamente
            Recebe: +24 gold_coin + 1 health_potion
```

### Fluxo NPC Action

```typescript
handleNpcAction(player, { npcId, actionId })
    → Valida NPC existe (npcServices)
    → Switch por actionId:
         "buy_item"   → Deduz gold do inventário, adiciona item
         "sell_item"  → Adiciona gold, remove item
         "heal"       → Verifica 10 gold, restaura HP total
         "start_quest" → Define questState.status = "active"
         "complete_quest" → Verifica progress, concede recompensa
    → Todas operações buscam inventário atualizado do DB antes de processar
    → Persiste ao DB após mudança
```

---

## 10. Sistema de Coleta e Crafting

### Recursos do Mapa

| Recurso | XP | Item Coletado |
|---------|----|--------------|
| oak_tree | 8 | wood (1-2) |
| pine_tree | 8 | wood (1-2) |
| stone_deposit | 12 | stone (1-3) |

### Fluxo de Coleta

```
Cliente: Jogador se aproxima de resource node → GatheringSystem detecta proximidade
Cliente: Animação de progresso (local, ~2s)
Cliente: Envia { type: "gather_complete", payload: { resourceType } }
Servidor: Valida resourceType
Servidor: grantXP(player, xpAmount)
Servidor: Adiciona item ao inventário (a implementar no backend)
Servidor: Retorna "inventory" + "progression"
```

**Problema:** O servidor atualmente só concede XP. A adição de itens ao inventário via coleta está incompleta no backend.

### Crafting

**Status: Implementado apenas no cliente.**

O `CraftingSystem` no cliente valida materiais disponíveis e exibe painel de crafting. Porém, não existe endpoint ou handler no servidor para `craft_item`. A criação de itens via crafting não tem autoridade servidor — apenas lógica local que **não deve ser confiada**.

---

## 11. Cliente Phaser 3

### Arquitetura de Cenas

```
main.ts → Phaser.Game
    └── LoginScene (HTML DOM + POST /auth/*)
          └── WorldScene (Phaser.Scene)
                ├── WebSocket connection
                ├── Input: WASD movement
                ├── Rendering: EntityRenderer
                ├── HudBindings → DOM callbacks
                └── Systems:
                     ├── GatheringSystem
                     ├── CraftingSystem
                     ├── InventoryStore
                     ├── SkillSystem
                     ├── BiomeSystem (visual)
                     └── FootstepSystem (audio)
```

### HudBindings — Interface de Callbacks

```typescript
interface HudBindings {
  setStatus(msg: string): void
  setHp(current: number, max: number): void
  setPosition(x: number, y: number): void
  setInteractionPrompt(text: string | null): void
  setInventory(slots: InventorySlotView[], summary: InventorySummaryView): void
  setProgression(view: ProgressionView): void
  setCraftingPanel(view: CraftingPanelView): void
  setActionProgress(view: ActionProgressView | null): void
  pushFeedMessage(text: string, tone: "info"|"warn"|"danger"|"success"): void
  openDialogue(lines: string[]): void
  closeDialogue(): void
  openDeathModal(): void
  closeDeathModal(): void
}
```

### Movimento do Cliente (Predição)

```
Input WASD → calcula nova posição local → move sprite imediatamente
    → Envia { type: "move", x, y } ao servidor
    → Recebe state do servidor → reconcilia posição remota
    ⚠️ Sem reconciliação autoritária: cliente pode divergir se servidor rejeitar posição
```

### Sistema de Sprites

Sprites organizados em `web-client/public/sprites/`:
- `characters/{class}/{class}_walk.png` — sprite sheet de 4 frames
- `mobs/{type}_walk.png` — sprite sheet de mobs
- Configurados em `web-client/src/data/sprites.ts`

### EntityRenderer

Renderiza jogadores, mobs, NPCs e loot drops no canvas Phaser. Gerencia:
- Criação e destruição de sprites
- Animações de caminhada por direção
- Barra de HP sobre entidades
- Nome flutuante dos jogadores
- Indicador de ataque nos mobs (telegraf visual)

---

## 12. Infraestrutura e Deploy

### Docker Compose

```yaml
Serviços:
  postgres:16-alpine  → :5432 (internal)
  redis:7-alpine      → :6379 (internal)
  migrate             → one-shot: roda SQL migrations
  login-server        → :3001 (internal)
  world-server        → :3002 (internal)
  combat-server       → :3003 (internal, inativo)
  gateway             → :3000 (PUBLIC)
```

### Variáveis de Ambiente Necessárias

```env
# gateway
GATEWAY_PORT=3000
LOGIN_SERVER_URL=http://login-server:3001
WORLD_SERVER_URL=ws://world-server:3002
COMBAT_SERVER_URL=http://combat-server:3003
ALLOWED_ORIGINS=http://localhost:5173  # ← DEVE ser configurado

# login-server / world-server
DATABASE_URL=postgresql://user:pass@postgres:5432/mythrune
REDIS_URL=redis://redis:6379
JWT_SECRET=<segredo-aleatorio-forte>
JWT_EXPIRES_SECONDS=3600
NODE_ENV=production
```

### Banco de Dados

```sql
-- Tabela de usuários
users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
)

-- Tabela de personagens
characters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(64) UNIQUE NOT NULL,
  character_class VARCHAR(32) NOT NULL,
  map_id          VARCHAR(64) DEFAULT 'starter_town',
  x               FLOAT DEFAULT 400,
  y               FLOAT DEFAULT 400,
  health          INT NOT NULL,
  level           INT DEFAULT 1,
  experience      INT DEFAULT 0,
  inventory       JSONB DEFAULT '{}',
  equipment       JSONB DEFAULT '{"weapon":null,"armour":null}',
  equipped_runes  JSONB DEFAULT '[null,null,null]',
  quest_state     JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
)
```

---

## 13. Estado de Implementação

### Funcionalidades Completas ✅

| Feature | Arquivos Principais |
|---------|-------------------|
| Autenticação (login/registro) | login-server/src/handlers/authHandlers.ts |
| Criação de personagens (4 classes) | login-server/src/repositories/characterRepository.ts |
| WebSocket multiplayer | world-server/src/world/wsHandler.ts |
| Movimento com validação de velocidade | world-server/src/services/movement.ts |
| Colisão com tiles | world-server/src/services/mapCollision.ts |
| Combate single-target | world-server/src/world/mobs.ts |
| Combate AOE (skills) | world-server/src/world/wsHandler.ts |
| AI dos mobs (wander/chase/attack/respawn) | world-server/src/world/mobs.ts |
| Sistema de XP e níveis (1-20) | shared/src/progression.ts |
| Sistema de runas (3 slots) | world-server/src/world/wsHandler.ts |
| Sistema de equipamentos | world-server/src/world/wsHandler.ts |
| Loot drops com TTL | world-server/src/world/loot.ts |
| Pickup de loot | world-server/src/world/wsHandler.ts |
| NPCs (merchant/healer/quest giver) | world-server/src/world/npcServices.ts |
| Quest system (1 quest ativa) | world-server/src/world/wsHandler.ts |
| Coleta de recursos (XP only) | world-server/src/world/wsHandler.ts |
| Rate limiting global | gateway/src/index.ts |
| Persistência de estado | world-server/src/repositories/characterRepository.ts |
| Sprites animados por classe | web-client/src/systems/rendering/entityRenderer.ts |
| HUD desacoplado via callbacks | web-client/src/main.ts + worldScene.ts |
| Sistema de bioma (visual) | web-client/src/systems/biome/ |
| Sistema de passos (áudio) | web-client/src/systems/footstep/ |

### Funcionalidades Parciais ⚠️

| Feature | Status | O que falta |
|---------|--------|-------------|
| Crafting | Cliente OK, servidor ausente | Handler `craft_item` + validação autoritária |
| Coleta de recursos | XP implementado | Adição de itens ao inventário no backend |
| Combat Server | Definido, dockerizado | Integrar com world-server; substituir lógica inline |
| Runas — unlock por nível | Definido no shared | Validação server-side antes de equipar |
| Predição de movimento | Cliente-side | Reconciliação autoritária do servidor |

### Funcionalidades Ausentes ❌

| Feature | Prioridade | Notas |
|---------|-----------|-------|
| Múltiplos mapas | Alta | Arquitetura já suporta `map_id` |
| PvP | Média | Requer consentimento + zonas |
| Trading entre jogadores | Média | Requer confirmação dos dois lados |
| Mais quests | Alta | 1 quest atual — conteúdo insuficiente |
| Dungeons instanciadas | Baixa | Requer instancing architecture |
| Guilds | Baixa | Nova tabela + lógica |
| Crafting backend | Alta | Essencial para progressão |
| Admin/GM tools | Alta | Sem isso, moderação impossível |
| Seasonal/ladder | Baixa | Pós-launch |
| Notificações push | Baixa | Opcional |

---

## 14. Vulnerabilidades e Pontos Críticos

### 🔴 CRÍTICO

#### C1 — CORS Aceita Qualquer Origem
**Arquivo:** `gateway/src/index.ts`
**Problema:** `cors({ origin: true })` permite que qualquer site faça requisições autenticadas ao gateway, incluindo envio de cookies/tokens.
**Risco:** CSRF, sequestro de sessão via site malicioso.
**Correção:**
```typescript
// gateway/src/config.ts
ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173']

// gateway/src/index.ts
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true)
    else cb(new Error('CORS: origem não permitida'))
  },
  credentials: true
}))
```

#### C2 — Token JWT na URL (Query String)
**Arquivo:** `web-client/src/worldScene.ts` (conexão WS)
**Problema:** `ws://gateway/ws?token=<jwt>` — tokens em query strings ficam em logs de servidor, histórico de browser, e headers Referer.
**Risco:** Vazamento do token em logs de proxy/nginx, exposição em headers HTTP.
**Correção:** Enviar token no primeiro frame WebSocket (protocolo de handshake customizado):
```typescript
// Cliente: conectar sem token na URL
const ws = new WebSocket('ws://gateway/ws')
ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }))

// Servidor: primeiro frame deve ser auth, caso contrário fechar conexão
```

#### C3 — Crafting sem Autoridade de Servidor
**Arquivo:** `web-client/src/systems/crafting/craftingSystem.ts`
**Problema:** A lógica de crafting existe apenas no cliente. Sem validação server-side, qualquer usuário pode criar itens manipulando mensagens WebSocket ou o código local.
**Risco:** Duplicação de itens, economia quebrada.
**Correção:** Implementar `handleCraftItem` no world-server que:
1. Busca inventário atual do DB (não confia no cliente)
2. Valida materiais necessários
3. Remove materiais + adiciona item resultante
4. Persiste e retorna novo inventário

---

### 🟠 ALTO

#### A1 — Rate Limiting por Mensagem WebSocket Ausente
**Arquivo:** `world-server/src/world/wsHandler.ts`
**Problema:** Não há limitador de frequência por tipo de mensagem. Um cliente pode enviar 1000 mensagens `move` ou `attack` por segundo.
**Risco:** DoS do world-server, sobrecarga de CPU no loop de mobs, exploração de cooldowns.
**Correção:**
```typescript
// Adicionar ao ConnectedPlayer
messageRateLimit: Map<string, { count: number, windowStart: number }>

// No início de cada handler
function checkRate(player: ConnectedPlayer, type: string, maxPerSecond: number): boolean {
  const now = Date.now()
  const rl = player.messageRateLimit.get(type) ?? { count: 0, windowStart: now }
  if (now - rl.windowStart > 1000) { rl.count = 0; rl.windowStart = now }
  rl.count++
  player.messageRateLimit.set(type, rl)
  return rl.count <= maxPerSecond
}
// Limites sugeridos: move=20/s, attack=5/s, npc_action=2/s
```

#### A2 — Inventário: Cliente como Source of Truth Parcial
**Arquivo:** `world-server/src/world/wsHandler.ts` — handler `inventory_sync`
**Problema:** O servidor aceita `inventory_sync` do cliente para sincronizar estado. Embora não usado diretamente para compras/crafting, pode criar dessincronia que abre janelas de exploração.
**Risco:** Race conditions em ações sequenciais rápidas.
**Correção:** Remover `inventory_sync` completamente. O servidor é a única fonte de verdade — toda mudança de inventário origina no servidor e é enviada de volta ao cliente.

#### A3 — Posição do Jogador: Sem Reconciliação Autoritária
**Arquivo:** `world-server/src/services/movement.ts`
**Problema:** O servidor valida velocidade mas não envia posição corrigida de volta. Se a validação falhar silenciosamente, o cliente fica em posição inválida.
**Risco:** Pequenos exploits de posição (wall clipping), bypass de colisão em edge cases.
**Correção:**
```typescript
// Se movimento inválido, enviar correção ao cliente
if (!isValid) {
  player.socket.send(JSON.stringify({
    type: 'position_correction',
    payload: { x: player.x, y: player.y }
  }))
  return
}
```

#### A4 — Sem Validação de Nível para Equip de Runas
**Arquivo:** `world-server/src/world/wsHandler.ts` — `handleEquipRune`
**Problema:** `RUNE_DEFINITIONS` define `unlockLevel` mas o handler não verifica se o jogador tem nível suficiente antes de equipar.
**Risco:** Jogador nível 1 equipando runa `celerity` (unlock: nível 7).
**Correção:**
```typescript
const rune = RUNE_DEFINITIONS[runeId]
if (player.level < rune.unlockLevel) {
  return sendError(player, 'RUNE_LOCKED', `Requer nível ${rune.unlockLevel}`)
}
```

---

### 🟡 MÉDIO

#### M1 — JWT_SECRET sem Valor Padrão Seguro
**Arquivo:** `world-server/src/config.ts`, `login-server/src/config.ts`
**Problema:** Se `JWT_SECRET` não estiver no ambiente, pode usar valor padrão fraco ou crashar de forma não informativa.
**Correção:** Validar na startup que `JWT_SECRET` tem comprimento mínimo (>= 32 chars):
```typescript
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET ausente ou fraco (mínimo 32 chars)')
  process.exit(1)
}
```

#### M2 — Loot Drops sem Persistência
**Arquivo:** `world-server/src/world/loot.ts`
**Problema:** Todos os drops ficam em memória. Restart do servidor = perda de todos os drops no chão.
**Risco:** Frustração do jogador (item sumiu). Não é exploração, mas impacta UX negativamente.
**Correção:** Persistir drops ativos no Redis com TTL ou PostgreSQL.

#### M3 — Sem Graceful Shutdown
**Arquivo:** `world-server/src/index.ts`
**Problema:** Não há handler para `SIGTERM`/`SIGINT`. Restart do container mata conexões abruptamente sem salvar estado pendente.
**Risco:** Perda de progresso (últimos movimentos, HP, inventário pendente).
**Correção:**
```typescript
process.on('SIGTERM', async () => {
  console.log('Shutdown: salvando estado de todos os jogadores...')
  for (const [, player] of getPlayers()) {
    await persistPlayerState(player)
  }
  process.exit(0)
})
```

#### M4 — Sem Monitoramento / Observabilidade
**Problema:** Sem logs estruturados, sem métricas, sem rastreamento de erros. Impossível diagnosticar problemas em produção.
**Correção:** Adicionar:
- Logs estruturados (pino/winston) com correlation IDs
- Métricas básicas: jogadores ativos, mensagens/s, latência de DB
- Sentry ou similar para erros não tratados

#### M5 — Ausência de Autenticação no Combat Server
**Arquivo:** `combat-server/src/handlers/attackHandler.ts`
**Problema:** Endpoint HTTP sem autenticação. Qualquer serviço interno pode POST `/combat/attack` sem credencial.
**Risco:** Baixo agora (serviço inativo), mas se ativado sem correção, permite ataques não autorizados.
**Correção:** Adicionar shared secret (header `X-Internal-Secret`) na comunicação interna antes de ativar.

---

### 🟢 BAIXO / INFORMATIVO

#### I1 — Mob State não Persistido
Mobs respawnam do zero em qualquer restart. Não é vulnerabilidade, mas é comportamento esperado para documentar.

#### I2 — Ausência de Testes de Integração
`world/mobs.test.ts` existe mas cobertura é básica. Sem testes de integração para fluxos completos (login → ws → attack → loot).

#### I3 — Sem Proteção contra Replay Attacks
JWT sem `jti` (JWT ID). Um token roubado pode ser reutilizado até expirar sem possibilidade de revogação.
**Correção:** Adicionar blacklist de tokens no Redis ao fazer logout.

#### I4 — Sem Limite de Personagens por Conta
Um usuário pode criar múltiplos personagens sem limite definido.
**Correção:** Validar `COUNT(characters WHERE user_id = $1) < MAX_CHARS` no registro.

---

## 15. Melhorias e Próximos Passos

### Sprint 1 — Segurança Crítica (Imediato)

- [ ] **C1** — Fix CORS: usar `ALLOWED_ORIGINS` da env
- [ ] **C3** — Implementar `handleCraftItem` no world-server
- [ ] **A1** — Rate limiting por tipo de mensagem WebSocket
- [ ] **A4** — Validar `unlockLevel` ao equipar runa
- [ ] **M1** — Validar `JWT_SECRET` na startup
- [ ] **C2** — Migrar token do query string para primeiro frame WS

### Sprint 2 — Estabilidade e Completude

- [ ] **A3** — `position_correction` message do servidor
- [ ] **A2** — Remover `inventory_sync` do cliente
- [ ] **M3** — Graceful shutdown com persistência
- [ ] **M2** — Persistir loot drops no Redis
- [ ] **I3** — Blacklist de tokens no Redis (logout)
- [ ] Completar coleta de recursos (itens no inventário via backend)

### Sprint 3 — Conteúdo e Features

- [ ] **Múltiplos Mapas**
  - Criar segundo mapa (dungeon/floresta)
  - Handler de transição de mapa (`change_map`)
  - Salas separadas por `map_id` no room.ts
  
- [ ] **Mais Quests**
  - Engine de quests genérica (não hardcoded por quest)
  - 3-5 quests adicionais na vila
  - Quests de coleta (entregar N itens)

- [ ] **Crafting Completo**
  - Handler `craft_item` no world-server
  - Receitas em `shared/src/recipes.ts`
  - UI mostrando status de criação (server response)

- [ ] **Combat Server Ativo**
  - Integrar world-server → combat-server para resolução de dano
  - Permite escalar combat horizontalmente

### Sprint 4 — Escala e Produção

- [ ] **Observabilidade**
  - Pino para logs estruturados
  - Prometheus metrics (`/metrics` endpoint)
  - Sentry para erros

- [ ] **Multi-servidor**
  - Adaptar `room.ts` para usar Redis pub/sub
  - Separar world-server por mapa
  - Load balancer com sticky sessions

- [ ] **Admin Tools**
  - Console de GM (teleport, give item, kick, ban)
  - Dashboard de jogadores ativos
  - Edição de mobs em runtime

- [ ] **CDN e Assets**
  - Sprites via CDN (Cloudflare/CloudFront)
  - Compressão de sprites (WebP)
  - Preloading otimizado

### Arquitetura de Múltiplos Mapas (Design)

```
                   ┌─────────────────────┐
                   │   Gateway :3000     │
                   └─────────────────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ World-1  │ │ World-2  │ │ World-3  │
       │ (starter)│ │(dungeon) │ │ (forest) │
       └──────────┘ └──────────┘ └──────────┘
              │           │           │
              └─────── Redis Pub/Sub ──┘
                    (estado global)
```

Cada jogador conecta ao world-server do seu `map_id`. Transições de mapa = reconexão WebSocket com novo servidor.

---

## 16. Checklist de Produção

Antes de publicar o jogo, verificar:

### Segurança
- [ ] `JWT_SECRET` tem >= 32 chars aleatórios (use `openssl rand -hex 32`)
- [ ] `ALLOWED_ORIGINS` está configurado com domínio real
- [ ] Banco de dados PostgreSQL não está acessível externamente
- [ ] Redis não está acessível externamente
- [ ] Rate limiting testado e adequado para carga esperada
- [ ] HTTPS configurado (nginx/traefik na frente do gateway)
- [ ] Logs não exibem senhas, tokens, ou dados sensíveis

### Funcionalidade
- [ ] Coleta de recursos completa (items no inventário)
- [ ] Crafting server-side implementado
- [ ] Graceful shutdown funcionando
- [ ] Loot drops persistidos
- [ ] Validação de nível para runas

### Operações
- [ ] Backup automático do PostgreSQL configurado
- [ ] Logs centralizados (não só stdout do Docker)
- [ ] Alertas para erros críticos (down time, DB connection fail)
- [ ] Processo de migração de DB documentado
- [ ] Rollback de deploy testado

### Testes
- [ ] Testes de integração para fluxos críticos (auth, combat, inventory)
- [ ] Teste de carga (simulação de N jogadores simultâneos)
- [ ] Teste de reconexão WebSocket (o que acontece quando servidor reinicia?)

---

*Documento gerado automaticamente — Claude Code (claude-sonnet-4-6) — 2026-04-11*
