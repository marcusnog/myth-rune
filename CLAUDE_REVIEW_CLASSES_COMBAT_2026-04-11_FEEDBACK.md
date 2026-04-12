# Feedback Claude — Classes, Sprites e Combate

Data: 2026-04-11
Revisor: Claude (senior review)
Base: CLAUDE_REVIEW_CLASSES_COMBAT_2026-04-11.md

---

## Resumo geral

O pacote está bem executado para o escopo proposto. A separação de autoridade
servidor/cliente está correta onde importa: dano real, dodge e crit são
calculados server-side; o cliente só exibe feedback. A estrutura do SkillSystem
como classe isolada é limpa, o fluxo de projétil da mage com delay de impacto
está coerente com a confirmação de dano do servidor, e os testes de combate
existentes cobrem os cenários principais de forma sólida.

Há um bug crítico silencioso no roteamento de skills, dois problemas de design
que acumulam dívida técnica se não forem tratados logo, e os números de balance
da Mage precisam de revisão.

---

## 1. Bugs — corrigir agora

### 1.1 `use_skill` enviado ao servidor mas nunca processado

Arquivo: `world-server/src/world/wsHandler.ts` — switch-case em `ws.on("message")`

O handler não tem `case "use_skill"`. A mensagem é validada pelo schema Zod e
descartada silenciosamente. O comentário no cliente diz "Server can handle or
ignore", mas enquanto não houver o case o servidor nunca vai registrar uso de
skill.

Consequência atual: nenhuma visível. O AOE chega via mensagens normais de
`attack`. Mas sem o handler o cooldown de skill é 100% client-side. Um cliente
modificado pode spamear Q sem cooldown.

Correção mínima: adicionar o case com no-op explícito e registro de timestamp,
ou já guardar o instante do uso para validação futura.

```ts
case "use_skill":
  // TODO: validar cooldown server-side
  // self.lastSkillAt = Date.now();
  return;
```

---

### 1.2 AOE de skill só acerta o primeiro mob na maioria dos casos

Arquivo: `web-client/src/worldScene.ts` — método `requestAoeAttack` (~linha 2009)

`requestAoeAttack` envia uma mensagem `attack` separada por mob em range. O
servidor atualiza `attacker.lastAttackAt` no primeiro processamento; todos os
ataques subsequentes dentro do mesmo frame retornam `COOLDOWN`. O cliente
ignora esses erros silenciosamente.

Na prática "Giro de Aco", "Circulo Arcano" e "Rajada de Flechas" com múltiplos
mobs próximos só danificam 1 mob.

Opção A (mais correta, mais trabalho): criar mensagem `aoe_attack` com centro e
raio; o servidor valida raio e aplica dano em todos os mobs elegíveis de uma
vez.

Opção B (rápida, menos autoridade): espaçar os ataques com `delayedCall` de
10–15 ms por mob para respeitar o cooldown entre hits.

```ts
// Opção B — exemplo
private requestAoeAttack(originX: number, originY: number, radius: number): void {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
  let delay = 0;
  for (const [mobId, mob] of this.entityRenderer.mobs.entries()) {
    if (mob.dead) continue;
    const dist = Phaser.Math.Distance.Between(originX, originY, mob.sprite.x, mob.sprite.y);
    if (dist <= radius) {
      this.time.delayedCall(delay, () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type: "attack", payload: { targetMobId: mobId } }));
      });
      delay += WORLD_COMBAT_CONFIG.playerAttackCooldownMs + 10;
    }
  }
}
```

---

### 1.3 Bug visual: cooldown arc desenhado duas vezes com o mesmo ângulo

Arquivo: `web-client/src/systems/skills/skillSystem.ts` — método `refreshOverlay` (~linha 216)

Os dois blocos `lineStyle + arc + strokePath` usam o mesmo valor `1 - ratio`.
O intent era desenhar uma trilha de fundo (círculo completo) + arco de progresso
por cima, mas o segundo arco cobre o primeiro com o mesmo ângulo.

```ts
// Correção: trilha de fundo usa arco cheio (Math.PI * 2)
this.cooldownArc.lineStyle(2, 0x3a5a7a, 0.4);
this.cooldownArc.beginPath();
this.cooldownArc.arc(-36, 0, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, false); // círculo completo
this.cooldownArc.strokePath();

this.cooldownArc.lineStyle(2, 0x7ab8e0, 0.9);
this.cooldownArc.beginPath();
this.cooldownArc.arc(-36, 0, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - ratio), false);
this.cooldownArc.strokePath();
```

---

## 2. Design — corrigir em breve

### 2.1 `resolveAttackStyle` ignora `PLAYER_ATTACK_PROFILES`

Arquivo: `web-client/src/worldScene.ts` — método `resolveAttackStyle` (~linha 2032)

```ts
// Atual — hardcode para mage
private resolveAttackStyle(entity: RenderedEntity | null): "melee" | "ranged" {
  return entity?.kind === "player" && entity.visual === "mage" ? "ranged" : "melee";
}
```

`PLAYER_ATTACK_PROFILES` em `shared/src/combatRules.ts` já contém o campo
`style` por classe. Quando archer for convertido para ranged (ver item 2.2)
esse if vai ser esquecido.

```ts
// Correção
import { PLAYER_ATTACK_PROFILES } from "@myth-of-rune/shared";

private resolveAttackStyle(entity: RenderedEntity | null): "melee" | "ranged" {
  if (!entity || entity.kind !== "player") return "melee";
  return PLAYER_ATTACK_PROFILES[entity.visual as CharacterClassId]?.style ?? "melee";
}
```

---

### 2.2 Archer tem `style: "melee"` — inconsistente com identidade da classe

Arquivo: `shared/src/combatRules.ts` — `PLAYER_ATTACK_PROFILES`

O archer tem a skill `Rajada de Flechas` mas ataque básico melee com range
padrão. Isso contradiz a identidade da classe.

Sugestão: converter para ranged com range e velocidade de projétil menores que
a mage, reutilizando o fluxo de projétil já implementado em `spawnArcaneProjectile`
(ou variante com cor/forma diferente).

```ts
[CharacterClass.Archer]: {
  style: "ranged",
  range: 160,           // menor que mage (196)
  projectileSpeed: 680, // mais rápido que orb arcano
},
```

---

### 2.3 Buff multiplier de skill hardcoded dentro do `SkillSystem`

Arquivo: `web-client/src/systems/skills/skillSystem.ts` — método `tryActivate` (~linha 77)

```ts
multiplier: 2.0,   // speed buff — rogue_shadow_step
multiplier: 1.35,  // combat buff
```

Esses valores não estão em `SkillDefinition`. Para tunar o Passo das Sombras
de 2.0x para 1.8x é preciso alterar o sistema em vez da definição.

Adicionar `buffMultiplier?: number` em `SkillDefinition` em `shared/src/skills.ts`:

```ts
export interface SkillDefinition {
  // ... campos existentes
  buffMultiplier?: number; // Multiplicador do buff (speed ou combat)
}

// Em SKILL_DEFINITIONS:
rogue_shadow_step: {
  // ...
  buffMultiplier: 2.0,
},
```

E no `SkillSystem.tryActivate`:
```ts
multiplier: this.definition.buffMultiplier ?? 2.0,
```

---

### 2.4 `Math.random()` direto no wander — ignora o `rng` parametrizado

Arquivo: `world-server/src/world/mobs.ts` — `tickMobs` (~linha 459)

```ts
} else if (Math.random() < 0.04) {  // ← deveria ser rng()
  m.vx = randVel();
  m.vy = randVel();
}
```

Todo o resto do arquivo usa o parâmetro `rng: () => number` para ser
determinístico em testes. Esse branch escapa do padrão e não é testável.

```ts
} else if (rng() < 0.04) {
```

---

### 2.5 Runas não afetam `power`, `critChance` ou `dodgeChance`

Arquivo: `shared/src/progression.ts` — `sumRuneBonuses`

Os três atributos novos não são somados por runas. O schema de runa em
`shared/src/schemas/world.ts` também não os contém. Jogadores nunca vão
conseguir otimizar crit/dodge/power via progressão de runa.

Se for intencional deixar isso para mais tarde, está OK — mas vale registrar
como decisão explícita. Quando chegar a hora, os dois pontos de alteração são:
`RuneStatBonus` em `runes.ts` e `sumRuneBonuses` em `progression.ts`.

---

## 3. Balance

### 3.1 Mage tem DPS base 57% maior que Warrior

Fórmula: `attack + floor(power * 0.45) - mobDefense`

| Classe  | Attack | Power | Dano base | Crit |
|---------|--------|-------|-----------|------|
| Warrior | 17     | 4     | **14**    | 5%   |
| Mage    | 21     | 12    | **22**    | 8%   |
| Rogue   | 15     | 6     | **13**    | 22%  |
| Archer  | 16     | 7     | **15**    | 10%  |

Mage faz 57% mais dano básico que Warrior e tem alcance triplicado. O Warrior
tem mais HP, mas contra mobs que não chegam perto da mage a troca não é justa.

Se `power` existe para ser multiplicador de skills da Mage, deveria ter peso
menor no ataque básico e compensar nas skills. Sugestão: reduzir o coeficiente
de `power` no ataque básico de `0.45` para `0.20` e compensar com uma
amplitude maior no `mage_arcane_blast`.

```ts
// mobs.ts — applyPlayerAttack
const baseDamage = Math.max(
  1,
  attacker.stats.attack + Math.floor(attacker.stats.power * 0.20) - WORLD_COMBAT_CONFIG.mobDefense,
);
```

### 3.2 Rogue — números altos mas dentro do aceitável

`critChance: 0.22` com 1.75x multiplicador e `dodgeChance: 0.16` são números
altos para nível 1. A progressão é conservadora (crit +0.4%/nível, dodge
+0.3%/nível) então não vai escalar para território absurdo. Aguardar playtest
antes de tunar.

Ponto de atenção: o crit check usa `Math.max(baseDamage + 1, Math.floor(baseDamage * 1.75))`.
O `+ 1` garante pelo menos 1 dano extra mesmo em dano base 0, mas é um magic
number sem comentário. Documentar ou extrair para constante:

```ts
const CRIT_DAMAGE_MULTIPLIER = 1.75;
const CRIT_MINIMUM_BONUS = 1;
const damage = isCritical
  ? Math.max(baseDamage + CRIT_MINIMUM_BONUS, Math.floor(baseDamage * CRIT_DAMAGE_MULTIPLIER))
  : baseDamage;
```

---

## 4. Cobertura de testes — lacunas relevantes

Arquivo: `world-server/src/world/mobs.test.ts`

Casos que faltam:

```
[ ] Dano com power incluído (validar fórmula: attack + floor(power * 0.45) - defense)
[ ] Warrior não crita quando rng() retorna valor acima de critChance
[ ] Mage faz mais dano base que Warrior (regression guard para balance)
[ ] tickMobs com rng injetado no branch de wander (bug 2.4 acima)
```

Exemplo de teste para fórmula de dano:

```ts
test("mage basic attack damage includes power contribution", () => {
  resetMobsForTests([{ x: 110, y: 100 }]);
  const mage = makePlayer("mage-dmg", 100, 100, "mage");
  // rng() > critChance para garantir hit normal
  const result = applyPlayerAttack(mage, firstMobId(), 10_000, () => 0.99);
  assert.equal(result.ok, true);
  if (result.ok) {
    // attack(21) + floor(power(12) * 0.45)(5) - mobDefense(4) = 22
    assert.equal(result.event.damage, 22);
    assert.equal(result.event.isCritical, undefined);
  }
});
```

---

## 5. Ponto de atenção em sprites

Arquivo: `web-client/src/data/sprites.ts` — `buildCompactCharacterSpec`

A animação `attack` para a direção `right` usa frames `frameRange(4, 4, 4)`.
O campo `flipX` não está declarado no spec de `attack` (está apenas em `walk`
e `idle`). Se `EntityRenderer.playAction` aplica flipX apenas quando o campo
existe no spec, o ataque para a direita pode não flipar.

Verificar em `entityRenderer.ts` — `resolveDirectionalFlipX` — se ele cai no
spec de `attack` ou usa o da animação pai.

Adicionalmente: `buildCompactCharacterSpec` inclui animações `gather` (rows 6
e 7) para todos que usam o spec (warrior, mage, rogue). A mage não coleta,
mas o spec está baked in. Se o sheet da mage não tiver essas rows com conteúdo
correto, Phaser renderiza silenciosamente o último frame disponível. Inofensivo,
mas vale confirmar no sheet.

---

## Priorização final

| # | Prioridade | Item | Arquivo |
|---|---|---|---|
| 1 | Agora | AOE de skill só acerta 1 mob | `worldScene.ts` |
| 2 | Agora | `use_skill` sem handler no servidor | `wsHandler.ts` |
| 3 | Agora | Cooldown arc com ângulo duplicado | `skillSystem.ts` |
| 4 | Breve | `resolveAttackStyle` ignorando `PLAYER_ATTACK_PROFILES` | `worldScene.ts` |
| 5 | Breve | Archer sem ataque ranged | `combatRules.ts` |
| 6 | Breve | Buff multiplier hardcoded no SkillSystem | `skillSystem.ts` + `skills.ts` |
| 7 | Breve | `Math.random()` no wander (fora do padrão rng) | `mobs.ts` |
| 8 | Breve | Testes faltantes (fórmula dano, wander, crit guard) | `mobs.test.ts` |
| 9 | Backlog | Runas não afetam power/crit/dodge | `progression.ts` + `runes.ts` |
| 10 | Playtest | Mage 57% mais dano base que Warrior | `character.ts` + `combatRules.ts` |
| 11 | Playtest | Rogue crit/dodge — tuning após sessão real | `character.ts` |

---

## O que está bom — preservar

- Separação de autoridade: crit e dodge calculados no servidor, cliente exibe feedback. Correto.
- `SkillSystem` como classe isolada com overlay próprio. Limpo.
- Projétil da mage com `travelMs` e `delayedCall` alinhando impacto visual com dano. Bem feito.
- `rollChance(chance, rng)` extraído como função pura — testável.
- Testes de invulnerabilidade, telegraph, leash e multiplayer burst. Cobrem o core de combate.
- Schema Zod com flags `isCritical` e `isDodged` opcionais. Não polui eventos normais.
