import kaplay from 'kaplay'

import { firstImageAsset } from '@/lib/playable-assets'

interface PlayableResult {
  score: number
  combo: number
  title: string
}

interface StartPlayableGameOptions {
  onReady?: () => void
  onResult?: (result: PlayableResult) => void
}

const GAME_WIDTH = 390
const GAME_HEIGHT = 720

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function randomLane() {
  return Math.floor(Math.random() * 3)
}

function laneX(lane: number) {
  return GAME_WIDTH * 0.22 + lane * GAME_WIDTH * 0.28
}

function resultTitle(score: number) {
  if (score >= 120) return 'Neon Legend'
  if (score >= 70) return 'Combo Runner'
  return 'Close Call'
}

export function startPlayableGame(canvas: HTMLCanvasElement, options: StartPlayableGameOptions = {}) {
  const k = kaplay({
    canvas,
    global: false,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    letterbox: true,
    stretch: true,
    crisp: true,
    debug: false,
    background: [7, 10, 18],
    touchToMouse: true,
  })

  let lastResult: PlayableResult = {
    score: 0,
    combo: 0,
    title: 'Ready',
  }

  if (firstImageAsset) {
    k.loadSprite('uploaded-reference', firstImageAsset.url)
  }

  function addBackdrop() {
    k.add([
      k.rect(GAME_WIDTH, GAME_HEIGHT),
      k.pos(0, 0),
      k.color(7, 10, 18),
    ])

    k.add([
      k.rect(GAME_WIDTH, GAME_HEIGHT),
      k.pos(0, 0),
      k.color(16, 65, 96),
      k.opacity(0.42),
    ])

    for (let i = 0; i < 18; i += 1) {
      k.add([
        k.circle(1 + Math.random() * 2),
        k.pos(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT),
        k.color(255, 255, 255),
        k.opacity(0.18 + Math.random() * 0.4),
      ])
    }
  }

  function addHud(scoreLabel: string, comboLabel: string, livesLabel: string) {
    k.add([
      k.rect(GAME_WIDTH - 28, 52, { radius: 12 }),
      k.pos(14, 16),
      k.color(255, 255, 255),
      k.opacity(0.13),
    ])

    const scoreText = k.add([
      k.text(scoreLabel, { size: 18 }),
      k.pos(26, 32),
      k.color(255, 255, 255),
    ])

    const comboText = k.add([
      k.text(comboLabel, { size: 14 }),
      k.pos(164, 34),
      k.color(255, 214, 102),
    ])

    const livesText = k.add([
      k.text(livesLabel, { size: 14 }),
      k.pos(292, 34),
      k.color(239, 71, 111),
    ])

    return { scoreText, comboText, livesText }
  }

  function addTapCue() {
    k.add([
      k.text('tap or hold to switch lanes', { size: 15 }),
      k.pos(GAME_WIDTH / 2, GAME_HEIGHT - 42),
      k.anchor('center'),
      k.color(176, 232, 255),
      k.opacity(0.72),
    ])
  }

  function addPillText(text: string, y: number, size = 18) {
    k.add([
      k.rect(260, 52, { radius: 16 }),
      k.pos(GAME_WIDTH / 2, y),
      k.anchor('center'),
      k.color(255, 255, 255),
      k.opacity(0.12),
    ])

    k.add([
      k.text(text, { size }),
      k.pos(GAME_WIDTH / 2, y),
      k.anchor('center'),
      k.color(255, 255, 255),
    ])
  }

  k.scene('start', () => {
    addBackdrop()

    if (firstImageAsset) {
      k.add([
        k.sprite('uploaded-reference'),
        k.pos(GAME_WIDTH / 2, 242),
        k.anchor('center'),
        k.scale(0.46),
        k.opacity(0.22),
      ])
    }

    k.add([
      k.text('NEON\nDODGE', { size: 48, align: 'center' }),
      k.pos(GAME_WIDTH / 2, 174),
      k.anchor('center'),
      k.color(255, 255, 255),
    ])

    k.add([
      k.text('Catch sparks. Dodge glitches. Chase a quick combo.', { size: 17, align: 'center', width: 300 }),
      k.pos(GAME_WIDTH / 2, 286),
      k.anchor('center'),
      k.color(176, 232, 255),
    ])

    addPillText('Tap to play', 426, 20)

    k.onMousePress(() => k.go('game'))
  })

  k.scene('game', () => {
    addBackdrop()

    let score = 0
    let combo = 0
    let bestCombo = 0
    let lives = 3
    let targetLane = 1
    let speed = 172

    const hud = addHud('Score 0', 'Combo 0', 'Lives 3')
    addTapCue()

    const player = k.add([
      k.circle(23),
      k.pos(laneX(targetLane), GAME_HEIGHT - 132),
      k.anchor('center'),
      k.color(6, 214, 160),
      k.area(),
      'player',
    ])

    k.add([
      k.circle(42),
      k.pos(laneX(targetLane), GAME_HEIGHT - 132),
      k.anchor('center'),
      k.color(6, 214, 160),
      k.opacity(0.12),
    ])

    function updateHud() {
      hud.scoreText.text = `Score ${score}`
      hud.comboText.text = `Combo ${combo}`
      hud.livesText.text = `Lives ${lives}`
    }

    function spawnDrop() {
      const isSpark = Math.random() > 0.32
      const lane = randomLane()
      const drop = k.add([
        isSpark ? k.circle(13) : k.rect(28, 28, { radius: 6 }),
        k.pos(laneX(lane), -36),
        k.anchor('center'),
        k.color(isSpark ? 255 : 239, isSpark ? 209 : 71, isSpark ? 102 : 111),
        k.area(),
        k.move(0, speed + combo * 8),
        k.offscreen({ destroy: true }),
        isSpark ? 'spark' : 'glitch',
      ])

      drop.onUpdate(() => {
        if (drop.pos.y > GAME_HEIGHT + 42) {
          k.destroy(drop)
          if (isSpark) {
            combo = 0
            updateHud()
          }
        }
      })
    }

    player.onCollide('spark', (spark) => {
      k.destroy(spark)
      combo += 1
      bestCombo = Math.max(bestCombo, combo)
      score += 10 + combo * 3
      speed = clamp(speed + 7, 172, 286)
      updateHud()
    })

    player.onCollide('glitch', (glitch) => {
      k.destroy(glitch)
      lives -= 1
      combo = 0
      updateHud()

      if (lives <= 0) {
        lastResult = {
          score,
          combo: bestCombo,
          title: resultTitle(score),
        }
        options.onResult?.(lastResult)
        k.go('result')
      }
    })

    k.loop(0.62, spawnDrop)

    k.onMousePress(() => {
      const x = k.mousePos().x
      targetLane = x < GAME_WIDTH / 3 ? 0 : x > (GAME_WIDTH * 2) / 3 ? 2 : 1
    })

    k.onUpdate(() => {
      const targetX = laneX(targetLane)
      player.pos.x += (targetX - player.pos.x) * clamp(k.dt() * 12, 0, 1)
    })
  })

  k.scene('result', () => {
    addBackdrop()

    k.add([
      k.text(lastResult.title, { size: 38, align: 'center' }),
      k.pos(GAME_WIDTH / 2, 184),
      k.anchor('center'),
      k.color(255, 255, 255),
    ])

    k.add([
      k.text(`Score ${lastResult.score}\nBest combo ${lastResult.combo}`, { size: 22, align: 'center' }),
      k.pos(GAME_WIDTH / 2, 286),
      k.anchor('center'),
      k.color(176, 232, 255),
    ])

    addPillText('Tap to replay', 438, 20)

    k.onMousePress(() => k.go('game'))
  })

  k.go('start')
  options.onReady?.()

  return () => {
    const maybeQuit = k as typeof k & { quit?: () => void }
    maybeQuit.quit?.()
  }
}
