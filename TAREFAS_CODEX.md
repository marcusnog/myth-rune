# Tarefas pendentes para o Codex

> **Estado:** estas tarefas ficaram a meio de uma sessão de refactoring. Lê tudo antes de começar.

---

## TAREFA 1 — Completar extracção do `EntityRenderer` em `worldScene.ts`

### Contexto

O ficheiro `web-client/src/systems/rendering/entityRenderer.ts` foi criado e contém toda a lógica de renderização de entidades (jogadores, mobs, efeitos visuais, animações, gather effects). A classe `EntityRenderer` tem os seguintes membros **públicos**:

**Campos:**
- `local: RenderedEntity | null` — entidade local (o jogador do cliente)
- `remotes: Map<string, RenderedEntity>` — jogadores remotos
- `mobs: Map<string, RenderedEntity>` — mobs
- `pendingDeadMobs: Set<string>` — mobs em animação de morte
- `currentTargetMobId: string | null` — alvo actual de combate
- `gatherAnimKey: string | null`
- `nextGatherAnimAt: number`

**Métodos públicos:**
- `ensureAnimationsRegistered()`
- `createEntity(params)` → `RenderedEntity`
- `destroyEntity(entity)`
- `destroyAll()` — destrói todas as entidades e limpa maps
- `setEntityPosition(entity, x, y)`
- `applyMotionVisual(entity, dx, dy, threshold)`
- `playAction(entity, action, options?)`
- `facingFromDelta(dx, dy, fallback)` → `Facing`
- `flashEntity(entity)`
- `showFloatingText(x, y, text, color)`
- `setMobHealth(entity, health)`
- `refreshMobTargetUi(localX, localY, attackRange)` — actualiza `currentTargetMobId` internamente
- `syncGatherAnimation(node, localEntity)` — **atenção: assinatura diferente da versão em WorldScene**
- `clearGatherAnimation()`
- `resolveEntity(entityId, localId)` → `RenderedEntity | null` — **atenção: segundo parâmetro `localId`**
- `resolveMobVisual(mobType)` → `VisualKey`
- `resolvePlayerVisual(classId)` → `PlayerVisualKey`

### Estado actual de `worldScene.ts` — FICHEIRO QUEBRADO

O ficheiro foi parcialmente actualizado. Tem o campo `private renderer!: EntityRenderer` e o método `create()` já usa `this.renderer = new EntityRenderer(...)` e `this.renderer.ensureAnimationsRegistered()`. **Mas:**

1. Os campos antigos (`localEntity`, `remoteEntities`, `mobEntities`, `pendingDeadMobs`, `currentTargetMobId`, `gatherAnimKey`, `nextGatherAnimAt`) foram **removidos da declaração** mas continuam a ser usados no corpo — o TypeScript vai falhar.

2. Todos os métodos privados de renderização que foram migrados para `EntityRenderer` **ainda existem duplicados** em `WorldScene` e devem ser removidos.

3. Tipos que já não estão declarados localmente continuam a ser usados: `AnimAction`, `MobUi`, `ResourceGatherFeedback`, `VisualKey`, `DirectionalAction`, `SingleAction`.

### O que fazer

#### Passo 1 — Adicionar imports em falta no topo de `worldScene.ts`

```typescript
// Adicionar na importação de entityRenderer:
import {
  EntityRenderer,
  type RenderedEntity,
  type AnimAction,   // se necessário dentro de WorldScene
} from "./systems/rendering/entityRenderer";

// VisualKey, DirectionalAction, SingleAction, Facing já são importados de sprites
// — confirma que ainda estão presentes; se foram removidos, repõe:
import {
  VISUAL_SPECS,
  KNOWN_PLAYER_VISUALS,
  type PlayerVisualKey,
  type Facing,
  type VisualKey,            // adiciona se em falta
  type DirectionalAction,    // adiciona se em falta
  type SingleAction,         // adiciona se em falta
} from "./data/sprites";

// ResourceGatherFeedback — se ainda usada em WorldScene depois das remoções:
import type { ResourceGatherFeedback } from "./data/resources";

// MOB_PRESENTATION — se ainda usada em WorldScene depois das remoções:
import { MOB_PRESENTATION } from "./data/mobs";
```

> **Dica:** depois de remover todos os métodos duplicados (passo 3), verifica quais tipos e imports ainda são necessários. Só `VisualKey` e `Facing` costumam sobrar para os tipos públicos no `preload()`.

#### Passo 2 — Substituir todas as referências a campos antigos

| Referência antiga | Nova referência |
|---|---|
| `this.localEntity` | `this.renderer.local` |
| `this.remoteEntities` | `this.renderer.remotes` |
| `this.mobEntities` | `this.renderer.mobs` |
| `this.pendingDeadMobs` | `this.renderer.pendingDeadMobs` |
| `this.currentTargetMobId` | `this.renderer.currentTargetMobId` |
| `this.gatherAnimKey` | `this.renderer.gatherAnimKey` |
| `this.nextGatherAnimAt` | `this.renderer.nextGatherAnimAt` |

#### Passo 3 — Substituir chamadas a métodos locais por `this.renderer.*`

| Chamada antiga | Nova chamada |
|---|---|
| `this.createEntity(params)` | `this.renderer.createEntity(params)` |
| `this.destroyEntity(entity)` | `this.renderer.destroyEntity(entity)` |
| `this.setEntityPosition(entity, x, y)` | `this.renderer.setEntityPosition(entity, x, y)` |
| `this.applyMotionVisual(entity, dx, dy, t)` | `this.renderer.applyMotionVisual(entity, dx, dy, t)` |
| `this.playAction(entity, action, opts)` | `this.renderer.playAction(entity, action, opts)` |
| `this.facingFromDelta(dx, dy, fallback)` | `this.renderer.facingFromDelta(dx, dy, fallback)` |
| `this.flashEntity(entity)` | `this.renderer.flashEntity(entity)` |
| `this.showFloatingText(x, y, text, color)` | `this.renderer.showFloatingText(x, y, text, color)` |
| `this.setMobHealth(entity, hp)` | `this.renderer.setMobHealth(entity, hp)` |
| `this.resolveEntity(id)` | `this.renderer.resolveEntity(id, this.localId)` |
| `this.resolvePlayerVisual(classId)` | `this.renderer.resolvePlayerVisual(classId)` |
| `this.resolveMobVisual(mobType)` | `this.renderer.resolveMobVisual(mobType)` |
| `this.clearGatherAnimation()` | `this.renderer.clearGatherAnimation()` |

**Casos com assinatura alterada:**

```typescript
// refreshMobTargetUi — agora recebe posição e alcance
// ANTIGO (em update()):
this.refreshMobTargetUi();

// NOVO:
if (this.renderer.local && !this.renderer.local.dead) {
  this.renderer.refreshMobTargetUi(
    this.renderer.local.sprite.x,
    this.renderer.local.sprite.y,
    this.combatConfig.playerAttackRange,
  );
}

// syncGatherAnimation — agora recebe o localEntity
// ANTIGO:
this.syncGatherAnimation(activeGatherNode);

// NOVO:
this.renderer.syncGatherAnimation(activeGatherNode, this.renderer.local!);

// resolveEntity — agora precisa do localId
// ANTIGO:
const attacker = this.resolveEntity(payload.attackerId);

// NOVO:
const attacker = this.renderer.resolveEntity(payload.attackerId, this.localId);
```

**Handler SHUTDOWN — simplificado com `destroyAll()`:**

```typescript
// ANTIGO (linhas ~242-248):
for (const entity of this.remoteEntities.values()) {
  this.destroyEntity(entity);
}
this.remoteEntities.clear();
for (const entity of this.mobEntities.values()) {
  this.destroyEntity(entity);
}
this.mobEntities.clear();

// NOVO:
this.renderer.destroyAll();
```

**`ensureLocalEntity` — usa `this.renderer.local`:**

```typescript
// ANTIGO:
if (!this.localEntity) {
  this.localEntity = this.createEntity({ ... });
  this.cameras.main.startFollow(this.localEntity.sprite, true, 0.12, 0.12);
  ...
  return;
}
this.setEntityPosition(this.localEntity, safePosition.x, safePosition.y);

// NOVO:
if (!this.renderer.local) {
  this.renderer.local = this.renderer.createEntity({ ... });
  this.cameras.main.startFollow(this.renderer.local.sprite, true, 0.12, 0.12);
  ...
  return;
}
this.renderer.setEntityPosition(this.renderer.local, safePosition.x, safePosition.y);
```

**`requestBasicAttack` — usa `currentTargetMobId` cached:**

```typescript
// ANTIGO:
const targetMobId = this.findPreferredMobTargetId();
if (!targetMobId) return;
this.currentTargetMobId = targetMobId;
const target = this.mobEntities.get(targetMobId);

// NOVO:
const targetMobId = this.renderer.currentTargetMobId;
if (!targetMobId) return;
const target = this.renderer.mobs.get(targetMobId);
```

**`requestBasicAttack` — guarda de segurança:**

```typescript
// ANTIGO:
if (!this.localEntity || this.localEntity.dead) return;
if (this.mobEntities.size === 0) return;

// NOVO:
if (!this.renderer.local || this.renderer.local.dead) return;
if (this.renderer.mobs.size === 0) return;
```

**`syncPlayers` — usa `this.renderer.remotes`:**

```typescript
// Ao criar entidade remota nova:
// ANTIGO:
const created = this.createEntity({ ... });
this.remoteEntities.set(player.characterId, created);

// NOVO:
const created = this.renderer.createEntity({ ... });
this.renderer.remotes.set(player.characterId, created);

// Ao remover entidade desaparecida:
// ANTIGO:
this.destroyEntity(entity);
this.remoteEntities.delete(id);

// NOVO:
this.renderer.destroyEntity(entity);
this.renderer.remotes.delete(id);
```

**`syncMobs` — idem para `this.renderer.mobs`:**

```typescript
// Ao criar mob:
const created = this.renderer.createEntity({ ... });
this.renderer.mobs.set(mob.mobId, created);

// Ao destruir mob:
this.renderer.destroyEntity(entity);
this.renderer.mobs.delete(mobId);
```

**`applyCombatEvent` — `pendingDeadMobs` e `currentTargetMobId`:**

```typescript
// Consulta se é mob:
const isMob = this.renderer.mobs.has(payload.targetId);

// Ao marcar como pendingDead:
this.renderer.pendingDeadMobs.add(payload.targetId);
if (this.renderer.currentTargetMobId === payload.targetId) {
  this.renderer.currentTargetMobId = null;
}

// Callback do delayedCall:
const mob = this.renderer.mobs.get(payload.targetId);
if (!mob) return;
this.renderer.destroyEntity(mob);
this.renderer.mobs.delete(payload.targetId);
this.renderer.pendingDeadMobs.delete(payload.targetId);
```

#### Passo 4 — Remover métodos duplicados de `WorldScene`

Após o passo 3, apaga estes métodos de `WorldScene` (todos foram movidos para `EntityRenderer`):

- `private createMobUi(...)`
- `private positionMobUi(...)`
- `private setMobHealth(...)`
- `private refreshMobTargetUi()`
- `private findPreferredMobTargetId()`
- `private createEntity(...)`
- `private destroyEntity(...)`
- `private setEntityPosition(...)`
- `private applyMotionVisual(...)`
- `private facingFromDelta(...)`
- `private playAction(...)` (todas as sobrecargas)
- `private getAnimationDurationMs(...)`
- `private flashEntity(...)`
- `private showFloatingText(...)`
- `private syncGatherAnimation(...)`
- `private clearGatherAnimation()`
- `private spawnGatherSwingEffect(...)`
- `private spawnGatherImpactEffect(...)`
- `private directionVectorForFacing(...)`
- `private animKey(...)` (todas as sobrecargas)
- `private ensureAnimationsRegistered()` — **já substituída por `this.renderer.ensureAnimationsRegistered()`**
- `private resolveEntity(...)`
- `private resolvePlayerVisual(...)`
- `private resolveMobVisual(...)`

#### Passo 5 — Validar

```bash
cd web-client && npx tsc --noEmit
```

Zero erros é o critério de aceitação.

---

## TAREFA 2 — Reescrever `ESTRUTURA.md`

O ficheiro `ESTRUTURA.md` na raiz do projecto descreve **o cliente Godot 4** (`client/`), que já não existe. O cliente activo é um **cliente Phaser 3** em `web-client/`.

### O que fazer

Reescreve o ficheiro de raiz para reflectir a arquitectura real actual. Estrutura sugerida:

```
# Myth of Rune — Estrutura do repositório

Monorepo TypeScript com cliente web Phaser 3 (`web-client/`), serviços Node.js
(gateway, login-server, world-server), pacote shared (`shared/`) e Docker Compose.

## Raiz
[tabela dos ficheiros relevantes]

## Cliente Web — `web-client/`
[estrutura real de web-client/src/]

## Pacote partilhado — `shared/`
[igual ao actual mas actualizado]

## Gateway — `gateway/`
## Login server — `login-server/`
## World server — `world-server/`

## Fluxo rápido
[fluxo real: login HTTP → JWT → WebSocket → WorldScene → HUD React]

## Pipeline visual
[Phaser 3: VISUAL_SPECS em data/sprites.ts, EntityRenderer, animações por visual key]
```

**Referências úteis para descrever o cliente:**
- `web-client/src/worldScene.ts` — cena principal Phaser 3
- `web-client/src/data/sprites.ts` — `VISUAL_SPECS`, tipos de visual
- `web-client/src/systems/rendering/entityRenderer.ts` — renderização de entidades
- `web-client/src/systems/gathering/gatheringSystem.ts`
- `web-client/src/systems/crafting/craftingSystem.ts`
- `web-client/src/systems/inventory/inventory.ts`
- `web-client/src/systems/map/starterTownMap.ts`
- `web-client/src/ui/` — HUD React (componentes e modelos)
- `web-client/src/data/` — items, mobs, resources, recipes

---

## Ordem de execução recomendada

1. **TAREFA 1** primeiro — o TypeScript está quebrado e isso bloqueia qualquer teste.
2. **TAREFA 2** — puramente documental, pode ser feita em paralelo mas não é bloqueante.

---

## Contexto adicional

### Contratos WebSocket (`shared/src/schemas/world.ts`)

Mensagens do cliente para o servidor:
- `move` — posição x, y
- `attack` — `targetMobId: UUID`
- `gather_complete` — `resourceType: "oak_tree" | "pine_tree" | "stone_deposit"`
- `equip_rune` — `slotIndex, runeId | null`
- `respawn` — payload vazio
- `ping` — `clientTime?`

Mensagens do servidor para o cliente:
- `welcome` — estado inicial completo
- `state` — snapshot de jogadores e mobs
- `progression` — snapshot de XP/level/runes/stats
- `respawned` — posição e estado após respawn
- `combat_event` — `attackerId, targetId, damage, targetHealth`
- `error` — `code, message`
- `pong`

### Regras de profundidade (depth-sorting)

Todas as entidades usam `relativeY = y - worldMinY` como base de depth para evitar bugs com coordenadas negativas. Implementado em `EntityRenderer.setEntityPosition()`.

### XP de gathering

Definido em `shared/src/schemas/world.ts` em `GATHER_XP`:
- `oak_tree`: 8 XP
- `pine_tree`: 8 XP  
- `stone_deposit`: 12 XP

O cliente envia `gather_complete` ao completar a coleta; o servidor aplica o XP e devolve `progression`.
