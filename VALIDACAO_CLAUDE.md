Você é um engenheiro de software sênior especialista em:
- Phaser
- jogos 2D top-down
- arquitetura MMO
- systems design
- code review crítico
- refatoração de projetos em evolução

Seu papel é revisar profundamente o trabalho feito por outra IA (Codex).

IMPORTANTE:
- não reescreva tudo do zero
- preserve o que estiver bom
- seja crítico com o que estiver fraco
- proponha soluções melhores quando necessário
- mantenha compatibilidade com a estrutura atual do projeto

CONTEXTO
O Codex já realizou mudanças no meu projeto para:
- corrigir tileset e tilemap
- melhorar o mapa inicial
- implementar gathering
- implementar crafting
- integrar com inventário e UI, quando possível

Quero que você atue como um revisor sênior de PR crítico, analisando se a implementação ficou realmente boa ou se há soluções superficiais, frágeis ou mal estruturadas.

ETAPA 1 — ENTENDER O PROJETO
Antes de sugerir mudanças:
- analise a estrutura do projeto
- identifique os módulos principais
- localize onde ficam:
  - tilemap
  - mapa inicial
  - player
  - interação
  - inventário
  - gathering
  - crafting
  - UI
- explique resumidamente como o projeto está organizado hoje

ETAPA 2 — ANALISAR O QUE O CODEX FEZ
Faça uma revisão crítica e identifique problemas em:

1. arquitetura
- acoplamento excessivo
- baixa modularização
- separação ruim de responsabilidades
- lógica espalhada
- pouca escalabilidade

2. implementação
- duplicação
- hardcode
- funções grandes
- edge cases ignorados
- fluxo frágil

3. tilemap e mapa
- repetição ruim
- transições ruins
- layering/depth incorreto
- colisão inconsistente
- elementos mal posicionados
- grid desalinhado
- mapa ainda com aparência de protótipo

4. gathering
- sistema pouco genérico
- interação ruim
- falta de estados
- falta de cancelamento
- falta de respawn robusto
- ausência de estrutura para outros recursos

5. crafting
- receitas hardcoded
- pouca escalabilidade
- UI fraca
- integração ruim com inventário
- ausência de validações

6. performance
- loops desnecessários
- update excessivo
- renderização desnecessária
- busca ruim de resource nodes
- risco de gargalo futuro

7. futuro multiplayer
- lógica sensível toda no client
- ausência de separação entre regras locais e regras que deveriam ser server-side
- dificuldade futura para sincronização

ETAPA 3 — PRIORIZAR OS PROBLEMAS
Classifique os problemas em:
- críticos
- importantes
- melhorias desejáveis

ETAPA 4 — PROPOR MELHORIAS
Para cada problema encontrado:
- explique o problema
- diga por que ele é ruim
- proponha uma solução melhor
- diga se a correção é simples, média ou mais profunda

ETAPA 5 — REFAZER APENAS O NECESSÁRIO
Aplique refatorações apenas nas partes problemáticas.
Não recrie tudo do zero.
Mantenha o que estiver bom.

ETAPA 6 — MELHORAR A ESTRUTURA
Se fizer sentido, reorganize a implementação em algo como:
- systems/map
- systems/gathering
- systems/crafting
- systems/inventory
- entities/resourceNode
- data/resources
- data/recipes
- ui/crafting
- ui/progress

Mas adapte isso à estrutura atual do projeto, sem bagunçar.

ETAPA 7 — MELHORIAS QUE O CODEX PODE TER DEIXADO PASSAR
Sugira melhorias extras, como:
- skill de mineração/madeira
- tiers de recursos
- raridade
- melhor feedback visual
- barra de progresso
- interrupção de ação
- respawn mais robusto
- nós de recursos orientados a dados
- crafting orientado a dados
- preparação para multiplayer futuro

ETAPA 8 — VALIDAÇÃO FINAL
Confirme se, após seus ajustes:
- o mapa ficou mais coerente
- o tilemap está mais limpo
- gathering está funcional
- crafting está funcional
- inventário está consistente
- a estrutura está mais modular
- o projeto ficou melhor para expansão

FORMATO DA RESPOSTA
1. resumo da estrutura atual
2. problemas encontrados
3. prioridades
4. melhorias propostas
5. refatorações aplicadas
6. resultado final
7. próximos passos

Se o trabalho do Codex estiver fraco, seja direto e crítico.
Se algo estiver bom, preserve.
A meta é elevar o projeto para um nível mais profissional sem quebrar o que já existe.