import { Scene } from 'phaser';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        const { width, height } = this.scale;
        const centerX = width / 2;
        const centerY = height / 2;
        const barWidth = Math.min(width * 0.72, 468);
        const barHeight = 32;
        const fillPadding = 2;

        //  We loaded this image in our Boot Scene, so we can display it here
        this.add.image(centerX, centerY, 'background').setDisplaySize(width, height);

        //  A simple progress bar. This is the outline of the bar.
        this.add.rectangle(centerX, centerY, barWidth, barHeight).setStrokeStyle(1, 0xffffff);

        //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
        const bar = this.add
            .rectangle(centerX - (barWidth / 2) + fillPadding, centerY, 4, barHeight - (fillPadding * 2), 0xffffff)
            .setOrigin(0, 0.5);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar from left to right.
            bar.width = Math.max(4, (barWidth - (fillPadding * 2)) * progress);

        });
    }

    preload ()
    {
        //  Load the assets for the game - Replace with your own assets
        this.load.setPath('assets');

        this.load.image('logo', 'logo.png');
        this.load.image('star', 'star.png');
    }

    create ()
    {
        this.scene.start('Game');
    }
}
