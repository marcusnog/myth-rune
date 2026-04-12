# Revisao Claude - Classes, Sprites e Combate

Data: 2026-04-11

Este documento resume as alteracoes recentes feitas no projeto para que o Claude revise este escopo especifico.

Importante:
- revisar apenas este pacote de mudancas
- nao misturar com outras alteracoes antigas ou paralelas do repositorio
- preservar o que estiver bom
- apontar fragilidades reais de arquitetura, balance e implementacao

## Escopo da revisao

Mudancas feitas:
- integracao do novo sprite da `mage`
- integracao do novo sprite do `rogue`
- `mage` convertida para combate basico a distancia
- projeteis e particulas para ataque ranged da `mage`
- uma skill base unica de nivel 1 para cada classe
- rebalance das classes base
- adicao de `power`, `critChance` e `dodgeChance`
- `rogue` com chance de critico e esquiva reais no combate
- feedback visual de `Crit!` e `Esquiva`
- painel de stats atualizado para exibir os novos atributos

## O que foi alterado

### 1. Sprites / animacoes

Arquivos principais:
- `web-client/public/sprites/characters/mage/mage_walk.png`
- `web-client/public/sprites/characters/rogue/rogue_walk.png`
- `web-client/src/data/sprites.ts`

Resumo:
- `mage` passou a usar sheet compacto no mesmo padrao do warrior
- `rogue` passou a usar sheet compacto no runtime
- o `rogue` manteve suporte a animacoes de `mining` e `woodcutting`

Ponto para revisar:
- se o mapeamento de rows/sequences do atlas compacto esta correto para todas as direcoes e ataques

### 2. Combate basico da mage

Arquivos principais:
- `shared/src/combatRules.ts`
- `world-server/src/world/mobs.ts`
- `world-server/src/world/wsHandler.ts`
- `web-client/src/worldScene.ts`
- `web-client/src/systems/rendering/entityRenderer.ts`

Resumo:
- `mage` agora usa alcance maior no ataque basico
- o combate autoritativo do runtime continua no `world-server`
- o cliente toca animacao de ataque + projetil + burst de impacto
- o dano/feedback so aparece quando o projetil "chega" visualmente
- outras classes permanecem melee no ataque basico

Ponto para revisar:
- se o atraso visual do projetil esta coerente com a confirmacao de dano
- se a separacao entre feedback local e autoridade do servidor ficou boa

### 3. Skills base de nivel 1

Arquivo principal:
- `shared/src/skills.ts`

Arquivos de execucao/efeito:
- `web-client/src/worldScene.ts`
- `web-client/src/systems/rendering/entityRenderer.ts`
- `web-client/src/systems/skills/skillSystem.ts`

Skills atuais:
- warrior: `Giro de Aco`
- mage: `Circulo Arcano`
- rogue: `Passo das Sombras`
- archer: `Rajada de Flechas`

Resumo:
- todas agora desbloqueiam no nivel 1
- reaproveitam o fluxo atual do `Q`
- efeitos visuais foram alinhados ao estilo observado nos sprites de cada classe
- warrior e archer usam AOE local
- mage usa explosao arcana local
- rogue usa corte em sombra + buff de mobilidade

Ponto para revisar:
- se as skills base ficaram boas como "assinatura" de cada classe
- se a implementacao esta limpa ou se ainda ha logica de skill excessivamente concentrada no `WorldScene`

### 4. Rebalance de classes

Arquivos principais:
- `shared/src/character.ts`
- `shared/src/progression.ts`
- `shared/src/schemas/world.ts`

Novos atributos base:
- `power`
- `critChance`
- `dodgeChance`

Perfil atual:
- warrior: mais HP, mais defesa, mais ataque melee, pouca esquiva/critico
- mage: menos HP, menos defesa, mais ataque e mais `power`
- rogue: menos HP, menos defesa, mais velocidade, mais critico, mais esquiva
- archer: mantido como perfil intermediario

Ponto para revisar:
- se os numeros base e a progressao por nivel estao coerentes
- se `power` deve influenciar somente dano magico/skill ou se esta aceitavel no dano basico atual

### 5. Critico e esquiva no combate autoritativo

Arquivo principal:
- `world-server/src/world/mobs.ts`

Resumo:
- ataques de jogador contra mob agora podem critar
- mobs atacando jogador agora podem ser esquivados
- o `rogue` se beneficia mais disso por causa dos stats base
- `combat_event` ganhou flags opcionais:
  - `isCritical`
  - `isDodged`

Ponto para revisar:
- se o `rogue` deve ser o unico com esquiva relevante ou se o modelo atual ja basta
- se a chance de critico/esquiva deve entrar em cooldown, DR ou outros limitadores

### 6. Feedback e HUD

Arquivos principais:
- `web-client/src/worldScene.ts`
- `web-client/src/main.ts`
- `web-client/index.html`

Resumo:
- popup `Crit!` para golpes criticos
- popup `Esquiva` para golpes evitados
- painel de stats agora mostra:
  - `Poder`
  - `Critico`
  - `Esquiva`

Ponto para revisar:
- se o HUD continua claro
- se faltou exibir melhor o significado de `power`

## Arquivos mais importantes para o review

Shared:
- `shared/src/character.ts`
- `shared/src/combatRules.ts`
- `shared/src/progression.ts`
- `shared/src/schemas/world.ts`
- `shared/src/skills.ts`

World server:
- `world-server/src/world/mobs.ts`
- `world-server/src/world/wsHandler.ts`
- `world-server/src/world/mobs.test.ts`

Web client:
- `web-client/src/data/sprites.ts`
- `web-client/src/worldScene.ts`
- `web-client/src/systems/rendering/entityRenderer.ts`
- `web-client/src/systems/skills/skillSystem.ts`
- `web-client/src/main.ts`
- `web-client/index.html`

Assets runtime:
- `web-client/public/sprites/characters/mage/mage_walk.png`
- `web-client/public/sprites/characters/rogue/rogue_walk.png`

## Validacoes ja executadas

Comandos executados:
- `npm run build -w shared`
- `npm run build -w web-client`
- `npm run build -w world-server`
- `npm run build -w combat-server`
- `npm test -w world-server`

Resultado:
- builds passaram
- testes do `world-server` passaram

## O que quero que o Claude avalie

1. Se a arquitetura dessas mudancas ficou boa ou ficou muito concentrada em `WorldScene` / `EntityRenderer`
2. Se o balance das classes faz sentido para um action RPG top-down
3. Se `power`, `critChance` e `dodgeChance` foram introduzidos do jeito certo
4. Se a `mage` ranged ficou bem integrada no fluxo de combate existente
5. Se as skills base de nivel 1 ficaram fortes o bastante visualmente sem ficar desbalanceadas
6. Se ha hardcodes, acoplamentos ou pontos frageis que merecem refactor agora
7. Se os testes estao suficientes ou se faltam casos importantes

## Pontos de atencao conhecidos

- o runtime de combate usado no jogo atual e o `world-server`, nao o `combat-server`
- a logica de skill ainda esta majoritariamente no cliente
- `power` hoje aumenta dano derivado de forma generica; talvez o Claude prefira separar dano fisico e dano magico no futuro
- `rogue` recebeu chance alta de critico/esquiva; isso pode pedir tuning depois de playtest

## Pedido para o Claude

Fazer uma revisao critica deste pacote de mudancas como se fosse review de PR:
- encontrar bugs, riscos de design e regressao
- dizer o que deve ser corrigido agora vs depois
- propor melhorias objetivas sem reescrever tudo do zero
