import type { GameObjects, Scene } from 'phaser';

export type GameFeelColor = `#${string}` | number;

export type TextJuiceOptions = {
	fontFamily?: string;
	fontSize?: number;
	color?: string;
	stroke?: string;
	strokeThickness?: number;
	depth?: number;
};

export type FloatingTextOptions = TextJuiceOptions & {
	distance?: number;
	duration?: number;
	startScale?: number;
	endScale?: number;
};

export type BurstOptions = {
	color?: number;
	count?: number;
	radius?: number;
	distance?: number;
	duration?: number;
	depth?: number;
};

export type PulseOptions = {
	scale?: number;
	duration?: number;
	ease?: string;
};

export type SquashStretchOptions = {
	scaleX?: number;
	scaleY?: number;
	duration?: number;
	ease?: string;
};

export type ScreenFlashOptions = {
	color?: number;
	alpha?: number;
	duration?: number;
	depth?: number;
};

export type FeedbackTarget = GameObjects.GameObject & {
	scaleX: number;
	scaleY: number;
	setScale: (x: number, y?: number) => FeedbackTarget;
};

export type InteractiveFeedbackTarget = FeedbackTarget & {
	setInteractive: (...args: unknown[]) => InteractiveFeedbackTarget;
	on: (event: string, callback: (...args: unknown[]) => void) => InteractiveFeedbackTarget;
};

const DEFAULT_TEXT_STYLE = {
	fontFamily: 'Arial Black, Arial, sans-serif',
	fontSize: 42,
	color: '#ffffff',
	stroke: '#111827',
	strokeThickness: 8,
};

function toHexColor(color: GameFeelColor): string {
	return typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color;
}

export function createHudText(
	scene: Scene,
	x: number,
	y: number,
	text: string,
	options: TextJuiceOptions = {},
): GameObjects.Text {
	const hudText = scene.add.text(x, y, text, {
		fontFamily: options.fontFamily ?? DEFAULT_TEXT_STYLE.fontFamily,
		fontSize: options.fontSize ?? DEFAULT_TEXT_STYLE.fontSize,
		color: options.color ?? DEFAULT_TEXT_STYLE.color,
		stroke: options.stroke ?? DEFAULT_TEXT_STYLE.stroke,
		strokeThickness: options.strokeThickness ?? DEFAULT_TEXT_STYLE.strokeThickness,
		align: 'center',
	});

	hudText.setOrigin(0.5);
	hudText.setDepth(options.depth ?? 100);
	hudText.setShadow(0, 4, '#000000', 8, true, true);

	return hudText;
}

export function floatingScoreText(
	scene: Scene,
	x: number,
	y: number,
	text: string,
	options: FloatingTextOptions = {},
): GameObjects.Text {
	const startScale = options.startScale ?? 0.82;
	const endScale = options.endScale ?? 1.18;
	const label = createHudText(scene, x, y, text, {
		...options,
		fontSize: options.fontSize ?? 38,
		color: options.color ?? '#fff4a8',
		depth: options.depth ?? 130,
	});

	label.setScale(startScale);
	scene.tweens.add({
		targets: label,
		y: y - (options.distance ?? 76),
		alpha: 0,
		scale: endScale,
		duration: options.duration ?? 720,
		ease: 'Cubic.easeOut',
		onComplete: () => label.destroy(),
	});

	return label;
}

export function pulseTarget(
	scene: Scene,
	target: FeedbackTarget,
	options: PulseOptions = {},
): void {
	const baseScaleX = target.scaleX;
	const baseScaleY = target.scaleY;
	const scale = options.scale ?? 1.12;

	scene.tweens.add({
		targets: target,
		scaleX: baseScaleX * scale,
		scaleY: baseScaleY * scale,
		duration: options.duration ?? 110,
		ease: options.ease ?? 'Back.easeOut',
		yoyo: true,
		onComplete: () => target.setScale(baseScaleX, baseScaleY),
	});
}

export function squashStretchTarget(
	scene: Scene,
	target: FeedbackTarget,
	options: SquashStretchOptions = {},
): void {
	const baseScaleX = target.scaleX;
	const baseScaleY = target.scaleY;

	scene.tweens.add({
		targets: target,
		scaleX: baseScaleX * (options.scaleX ?? 1.16),
		scaleY: baseScaleY * (options.scaleY ?? 0.86),
		duration: options.duration ?? 120,
		ease: options.ease ?? 'Back.easeOut',
		yoyo: true,
		onComplete: () => target.setScale(baseScaleX, baseScaleY),
	});
}

export function burstParticles(
	scene: Scene,
	x: number,
	y: number,
	options: BurstOptions = {},
): void {
	const count = options.count ?? 14;
	const color = options.color ?? 0xffd23f;
	const radius = options.radius ?? 7;
	const distance = options.distance ?? 90;
	const duration = options.duration ?? 520;
	const depth = options.depth ?? 120;

	for (let index = 0; index < count; index += 1) {
		const angle = (Math.PI * 2 * index) / count;
		const travel = distance * (0.65 + Math.random() * 0.55);
		const particle = scene.add.circle(x, y, radius * (0.65 + Math.random() * 0.45), color, 0.95);
		particle.setDepth(depth);

		scene.tweens.add({
			targets: particle,
			x: x + Math.cos(angle) * travel,
			y: y + Math.sin(angle) * travel,
			alpha: 0,
			scale: 0.2,
			duration,
			ease: 'Cubic.easeOut',
			onComplete: () => particle.destroy(),
		});
	}
}

export function screenKick(scene: Scene, duration = 120, intensity = 0.006): void {
	const camera = scene.cameras.main as unknown as {
		shake?: (duration: number, intensity: number) => void;
	};

	if (typeof camera.shake === 'function') {
		camera.shake(duration, intensity);
	}
}

export function screenFlash(scene: Scene, options: ScreenFlashOptions = {}): void {
	const camera = scene.cameras.main as unknown as {
		flash?: (duration: number, red: number, green: number, blue: number) => void;
	};
	const color = options.color ?? 0xffffff;
	const red = (color >> 16) & 255;
	const green = (color >> 8) & 255;
	const blue = color & 255;

	if (typeof camera.flash === 'function') {
		camera.flash(options.duration ?? 110, red, green, blue);
		return;
	}

	const { width, height } = scene.scale;
	const overlay = scene.add.rectangle(width / 2, height / 2, width, height, color, options.alpha ?? 0.22);
	overlay.setDepth(options.depth ?? 150);
	scene.tweens.add({
		targets: overlay,
		alpha: 0,
		duration: options.duration ?? 160,
		ease: 'Cubic.easeOut',
		onComplete: () => overlay.destroy(),
	});
}

export function installPressFeedback(
	scene: Scene,
	target: InteractiveFeedbackTarget,
	onPress?: () => void,
	options: PulseOptions = {},
): InteractiveFeedbackTarget {
	const baseScaleX = target.scaleX;
	const baseScaleY = target.scaleY;

	target.setInteractive();
	target.on('pointerdown', () => pulseTarget(scene, target, { scale: options.scale ?? 0.94, duration: options.duration ?? 90 }));
	target.on('pointerup', () => {
		pulseTarget(scene, target, { scale: options.scale ?? 1.08, duration: options.duration ?? 120 });
		onPress?.();
	});
	target.on('pointerout', () => target.setScale(baseScaleX, baseScaleY));

	return target;
}

export function makePillButton(
	scene: Scene,
	x: number,
	y: number,
	label: string,
	onPress: () => void,
	options: TextJuiceOptions & { width?: number; height?: number; fill?: GameFeelColor } = {},
): GameObjects.Container {
	const width = options.width ?? 320;
	const height = options.height ?? 86;
	const fill = toHexColor(options.fill ?? '#ffd23f');
	const container = scene.add.container(x, y);
	const background = scene.add
		.rectangle(0, 0, width, height, Number.parseInt(fill.slice(1), 16), 1)
		.setStrokeStyle(6, 0x111827, 1);
	const text = createHudText(scene, 0, 0, label, {
		...options,
		fontSize: options.fontSize ?? 36,
		color: options.color ?? '#111827',
		stroke: options.stroke ?? '#ffffff',
		strokeThickness: options.strokeThickness ?? 4,
		depth: 1,
	});

	container.add([background, text]);
	container.setSize(width, height);
	container.setDepth(options.depth ?? 140);
	installPressFeedback(scene, container as InteractiveFeedbackTarget, onPress);

	return container;
}
