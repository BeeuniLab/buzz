import { EventBus } from '../EventBus';
import { Scene, type Cameras, type GameObjects, type Time } from 'phaser';
import {
	burstParticles,
	createHudText,
	floatingScoreText,
	screenKick,
	squashStretchTarget,
} from '../game-feel';

const ROUND_SECONDS = 20;

export class Game extends Scene {
	camera: Cameras.Scene2D.Camera;
	background: GameObjects.Image;
	scoreText: GameObjects.Text;
	timerText: GameObjects.Text;
	promptText: GameObjects.Text;
	target: GameObjects.Image;
	score = 0;
	secondsLeft = ROUND_SECONDS;
	roundTimer?: Time.TimerEvent;

	constructor() {
		super('Game');
	}

	create() {
		this.camera = this.cameras.main;
		this.camera.setBackgroundColor(0x07111f);
		this.score = 0;
		this.secondsLeft = ROUND_SECONDS;
		this.roundTimer?.remove();

		this.background = this.add.image(0, 0, 'background').setOrigin(0.5);
		this.scoreText = createHudText(this, 0, 0, 'SCORE 0', { fontSize: 40 });
		this.timerText = createHudText(this, 0, 0, `TIME ${ROUND_SECONDS}`, { fontSize: 40 });
		this.promptText = createHudText(this, 0, 0, 'TAP THE STAR', {
			fontSize: 52,
			color: '#fff4a8',
		});
		this.target = this.add.image(0, 0, 'star').setDepth(20).setInteractive();

		this.target.on('pointerdown', () => this.collectTarget());

		this.layoutScene();
		this.moveTarget();
		this.scale.on('resize', this.layoutScene, this);
		this.events.once('shutdown', () => {
			this.scale.off('resize', this.layoutScene, this);
			this.roundTimer?.remove();
		});

		this.roundTimer = this.time.addEvent({
			delay: 1000,
			loop: true,
			callback: () => this.tickRound(),
		});

		this.tweens.add({
			targets: this.promptText,
			scale: 1.08,
			duration: 520,
			ease: 'Sine.easeInOut',
			yoyo: true,
			repeat: 1,
		});

		EventBus.emit('current-scene-ready', this);
	}

	private collectTarget() {
		this.score += 10;
		this.scoreText.setText(`SCORE ${this.score}`);
		squashStretchTarget(this, this.target, { scaleX: 1.24, scaleY: 0.78 });
		floatingScoreText(this, this.target.x, this.target.y - 72, '+10');
		burstParticles(this, this.target.x, this.target.y, { color: 0xffd23f, count: 18 });
		screenKick(this, 80, 0.004);
		this.moveTarget();
	}

	private tickRound() {
		this.secondsLeft -= 1;
		this.timerText.setText(`TIME ${this.secondsLeft}`);

		if (this.secondsLeft <= 0) {
			this.roundTimer?.remove();
			this.scene.start('GameOver', { score: this.score });
		}
	}

	private moveTarget() {
		const { width, height } = this.scale;
		const margin = Math.min(width, height) * 0.16;
		const x = this.pickBetween(margin, width - margin);
		const y = this.pickBetween(margin + 100, height - margin);
		const targetScale = Math.min(width, height) / 430;

		this.target.setPosition(x, y);
		this.target.setScale(Math.max(0.38, Math.min(0.82, targetScale)));
	}

	private layoutScene() {
		const { width, height } = this.scale;
		const centerX = width / 2;

		this.background.setPosition(centerX, height / 2);
		this.background.setDisplaySize(width, height);

		this.scoreText.setPosition(136, 56);
		this.timerText.setPosition(width - 132, 56);
		this.promptText.setPosition(centerX, Math.min(150, height * 0.16));
	}

	private pickBetween(min: number, max: number) {
		return min + Math.random() * Math.max(1, max - min);
	}
}
