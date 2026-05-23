import { EventBus } from '../EventBus';
import { Scene, type Cameras, type GameObjects } from 'phaser';
import { createHudText, makePillButton, screenFlash } from '../game-feel';

type GameOverData = {
	score?: number;
};

export class GameOver extends Scene {
	camera: Cameras.Scene2D.Camera;
	background: GameObjects.Image;
	overlay: GameObjects.Rectangle;
	titleText: GameObjects.Text;
	scoreText: GameObjects.Text;
	replayButton: GameObjects.Container;

	constructor() {
		super('GameOver');
	}

	create(data: GameOverData = {}) {
		this.camera = this.cameras.main;
		this.camera.setBackgroundColor(0x09111f);

		const score = data.score ?? 0;
		const { width, height } = this.scale;
		const centerX = width / 2;

		this.background = this.add.image(centerX, height / 2, 'background').setAlpha(0.46);

		this.overlay = this.add.rectangle(centerX, height / 2, width, height, 0x07111f, 0.46).setDepth(10);
		this.titleText = createHudText(this, centerX, height * 0.34, 'ROUND COMPLETE', {
			fontSize: 58,
			color: '#fff4a8',
			depth: 30,
		});
		this.scoreText = createHudText(this, centerX, height * 0.45, `SCORE ${score}`, {
			fontSize: 52,
			depth: 30,
		});
		this.replayButton = makePillButton(this, centerX, height * 0.62, 'PLAY AGAIN', () => {
			this.scene.start('Game');
		});
		this.layoutScene();
		this.scale.on('resize', this.layoutScene, this);
		this.events.once('shutdown', () => {
			this.scale.off('resize', this.layoutScene, this);
		});
		screenFlash(this, { color: 0xffd23f, duration: 140 });

		EventBus.emit('current-scene-ready', this);
	}

	private layoutScene() {
		const { width, height } = this.scale;
		const centerX = width / 2;

		this.background.setPosition(centerX, height / 2);
		this.background.setDisplaySize(width, height);
		this.overlay.setPosition(centerX, height / 2);
		this.overlay.setSize(width, height);
		this.titleText.setPosition(centerX, height * 0.34);
		this.scoreText.setPosition(centerX, height * 0.45);
		this.replayButton.setPosition(centerX, height * 0.62);
	}
}
