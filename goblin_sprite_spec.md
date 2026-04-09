# Goblin Sprite Sheet Spec — Godot 4

## Objetivo

Criar uma sprite sheet **real de produção** para um inimigo Goblin em jogo 2D pixel art, totalmente compatível com Godot 4, sem vazamento de pixels, sem sombras externas indevidas, sem textos, sem logos e sem elementos fora da área de cada frame.

---

## Requisitos obrigatórios

### Formato do asset
- PNG
- Fundo transparente
- Sem texto
- Sem bordas decorativas
- Sem logo
- Sem interface visual
- Sem sombras externas que ultrapassem o frame
- Sem anti-aliasing borrado
- Sem bleed de pixels entre frames

### Estilo visual
- Pixel art
- Goblin pequeno/médio
- Proporção consistente entre todos os frames
- Visual de inimigo de RPG/MMORPG 2D top-down ou semi-top-down
- Cores limpas e leitura fácil em escala pequena

---

## Estrutura da sprite sheet

### Grid
- 4 linhas
- 8 colunas
- Total: 32 frames

### Tamanho de cada frame
- 64x64 px

### Tamanho total da imagem
- 512x256 px

### Distribuição das animações
- Linha 0: idle
- Linha 1: walk
- Linha 2: attack
- Linha 3: death

---

## Regras por frame

Cada frame deve:
- conter apenas 1 goblin
- manter os pés alinhados
- manter pivô consistente
- respeitar exatamente a célula de 64x64
- não ultrapassar o limite do frame
- não invadir o frame vizinho
- não conter restos visuais nas laterais
- não conter sombras soltas fora do personagem

---

## Animações

### Idle
- 8 frames
- movimento leve
- respiração ou balanço sutil
- sem deslocamento lateral indevido

### Walk
- 8 frames
- ciclo de caminhada coerente
- pernas e braços alternando naturalmente
- sem arrastar pixels fora da célula

### Attack
- 8 frames
- golpe com clava, faca ou mão
- início, preparação, impacto e retorno
- sem efeito visual solto fora do frame

### Death
- 8 frames
- transição clara de vivo para caído
- frame final estável no chão
- sem borrões externos

---

## Regras técnicas para engine

A sprite sheet precisa funcionar corretamente no Godot 4 com:

- AnimatedSprite2D
- Hframes = 8
- Vframes = 4

Sem necessidade de ajustes manuais complexos de:
- region_rect arbitrário
- atlas improvisado
- correções por offset estranho
- filtros especiais

---

## Import settings esperadas no Godot

Ao importar:
- Filter: Off
- Mipmaps: Off
- Repeat: Disabled

---

## Estrutura esperada no projeto

assets/
  sprites/
    enemies/
      goblin/
        goblin_sheet.png

---

## Mapeamento de animações

- idle: frames 0 a 7
- walk: frames 8 a 15
- attack: frames 16 a 23
- death: frames 24 a 31

---

## Critérios de aprovação

A sprite sheet será considerada correta apenas se:
1. cada frame estiver perfeitamente contido em 64x64
2. não houver artefatos laterais
3. não houver pixels de outro frame vazando
4. não houver textos ou logos
5. a imagem dividir exatamente em 8 colunas e 4 linhas
6. funcionar no Godot sem recortes manuais problemáticos
7. o goblin aparecer limpo em qualquer frame isolado

---

## Observações

Não gerar uma imagem “de apresentação”.
Não gerar mockup.
Não gerar sheet com título.
Não gerar fundo quadriculado decorativo.
Não gerar sombras cinematográficas.
Não gerar composição artística de vitrine.

Gerar apenas o asset técnico final de produção.