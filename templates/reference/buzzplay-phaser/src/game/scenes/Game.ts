import { EventBus } from '../EventBus';
import { Scene, type Cameras, type GameObjects } from 'phaser';

export class Game extends Scene
{
    camera: Cameras.Scene2D.Camera;
    background: GameObjects.Image;
    logo: GameObjects.Image;

    constructor ()
    {
        super('Game');
    }

    create ()
    {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x050914);

        this.background = this.add.image(512, 384, 'background');
        this.logo = this.add.image(512, 384, 'logo').setDepth(100);

        this.layoutScene();
        this.scale.on('resize', this.layoutScene, this);
        this.events.once('shutdown', () => {
            this.scale.off('resize', this.layoutScene, this);
        });

        EventBus.emit('current-scene-ready', this);
    }

    changeScene ()
    {
        this.scene.start('GameOver');
    }

    private layoutScene ()
    {
        const { width, height } = this.scale;
        const centerX = width / 2;
        const centerY = height / 2;

        this.background.setPosition(centerX, centerY);
        this.background.setDisplaySize(width, height);

        const logoScale = Math.min(width / 1024, height / 768, 1);
        this.logo.setPosition(centerX, centerY);
        this.logo.setScale(Math.max(0.35, logoScale));
    }
}
