import { useRef, useState, useEffect, useMemo } from 'react';
import { ArrowRight, Info } from 'react-feather';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/auth-context';
import { ProjectModeSelector, type ProjectModeOption } from '../components/project-mode-selector';
import { MAX_AGENT_QUERY_LENGTH, SUPPORTED_IMAGE_MIME_TYPES, type ProjectType } from '@/api-types';
import { useFeature } from '@/features';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { usePaginatedApps } from '@/hooks/use-paginated-apps';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { AppCard } from '@/components/shared/AppCard';
import clsx from 'clsx';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useDragDrop } from '@/hooks/use-drag-drop';
import { ImageUploadButton } from '@/components/image-upload-button';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import { toast } from 'sonner';

export default function Home() {
	const navigate = useNavigate();
	const { requireAuth } = useAuthGuard();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [projectMode, setProjectMode] = useState<ProjectType>('app');
	const [query, setQuery] = useState('');
	const { user } = useAuth();
	const { isLoadingCapabilities, capabilities, getEnabledFeatures } = useFeature();

	const modeOptions = useMemo<ProjectModeOption[]>(() => {
		if (isLoadingCapabilities || !capabilities) return [];
		return getEnabledFeatures().map((def) => ({
			id: def.id,
			label:
				def.id === 'presentation'
					? 'Slides'
					: def.id === 'general'
						? 'General'
						: 'App',
			description: def.description,
		}));
	}, [capabilities, getEnabledFeatures, isLoadingCapabilities]);

	const showModeSelector = modeOptions.length > 1;

	useEffect(() => {
		if (isLoadingCapabilities) return;
		if (modeOptions.length === 0) {
			if (projectMode !== 'app') setProjectMode('app');
			return;
		}
		if (!modeOptions.some((m) => m.id === projectMode)) {
			setProjectMode(modeOptions[0].id);
		}
	}, [isLoadingCapabilities, modeOptions, projectMode]);

	const { images, addImages, removeImage, clearImages, isProcessing } = useImageUpload({
		onError: (error) => {
			console.error('Image upload error:', error);
			toast.error(error);
		},
	});

	const { isDragging, dragHandlers } = useDragDrop({
		onFilesDropped: addImages,
		accept: [...SUPPORTED_IMAGE_MIME_TYPES],
	});


	const placeholderPhrases = useMemo(() => [
		"multiplayer trivia quiz",
		"retro pixel art maker",
		"choose-your-own-adventure story",
		"music beat pad with effects",
		"virtual pet that learns tricks",
		"emoji recipe guessing game",
		"space invaders with boss fights",
		"interactive comic strip builder",
	], []);
	const [currentPlaceholderPhraseIndex, setCurrentPlaceholderPhraseIndex] = useState(0);
	const [currentPlaceholderText, setCurrentPlaceholderText] = useState("");
	const [isPlaceholderTyping, setIsPlaceholderTyping] = useState(true);

	const {
		apps,
		loading,
	} = usePaginatedApps({
		type: 'public',
		defaultSort: 'popular',
		defaultPeriod: 'week',
		limit: 6,
	});

	// Discover section should appear only when enough apps are available and loading is done
	const discoverReady = useMemo(() => !loading && (apps?.length ?? 0) > 5, [loading, apps]);

	const handleCreateApp = (query: string, mode: ProjectType) => {
		if (query.length > MAX_AGENT_QUERY_LENGTH) {
			toast.error(
				`Prompt too large (${query.length} characters). Maximum allowed is ${MAX_AGENT_QUERY_LENGTH} characters.`,
			);
			return;
		}

		const encodedQuery = encodeURIComponent(query);
		const encodedMode = encodeURIComponent(mode);

		// Encode images as JSON if present
		const imageParam = images.length > 0 ? `&images=${encodeURIComponent(JSON.stringify(images))}` : '';
		const intendedUrl = `/chat/new?query=${encodedQuery}&projectType=${encodedMode}${imageParam}`;

		if (
			!requireAuth({
				requireFullAuth: true,
				actionContext: 'to create applications',
				intendedUrl: intendedUrl,
			})
		) {
			return;
		}

		// User is already authenticated, navigate immediately
		navigate(intendedUrl);
		// Clear images after navigation
		clearImages();
	};

	// Auto-resize textarea based on content
	const adjustTextareaHeight = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			const scrollHeight = textareaRef.current.scrollHeight;
			const maxHeight = 300; // Maximum height in pixels
			textareaRef.current.style.height =
				Math.min(scrollHeight, maxHeight) + 'px';
		}
	};

	useEffect(() => {
		adjustTextareaHeight();
	}, []);

	// Typewriter effect
	useEffect(() => {
		const currentPhrase = placeholderPhrases[currentPlaceholderPhraseIndex];

		if (isPlaceholderTyping) {
			if (currentPlaceholderText.length < currentPhrase.length) {
				const timeout = setTimeout(() => {
					setCurrentPlaceholderText(currentPhrase.slice(0, currentPlaceholderText.length + 1));
				}, 100); // Typing speed
				return () => clearTimeout(timeout);
			} else {
				// Pause before erasing
				const timeout = setTimeout(() => {
					setIsPlaceholderTyping(false);
				}, 2000); // Pause duration
				return () => clearTimeout(timeout);
			}
		} else {
			if (currentPlaceholderText.length > 0) {
				const timeout = setTimeout(() => {
					setCurrentPlaceholderText(currentPlaceholderText.slice(0, -1));
				}, 50); // Erasing speed
				return () => clearTimeout(timeout);
			} else {
				// Move to next phrase
				setCurrentPlaceholderPhraseIndex((prev) => (prev + 1) % placeholderPhrases.length);
				setIsPlaceholderTyping(true);
			}
		}
	}, [currentPlaceholderText, currentPlaceholderPhraseIndex, isPlaceholderTyping, placeholderPhrases]);

	const discoverLinkRef = useRef<HTMLDivElement>(null);

	return (
		<div className="relative flex flex-col items-center size-full overflow-auto">
			{/* Neo-Brutalism Background */}
			<div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
				{/* Grid pattern */}
				<svg width="100%" height="100%" className="opacity-[0.06]">
					<defs>
						<pattern id="neo-grid" patternUnits="userSpaceOnUse" width="40" height="40">
							<path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--neo-border-color)" strokeWidth="1"/>
						</pattern>
					</defs>
					<rect width="100%" height="100%" fill="url(#neo-grid)"/>
				</svg>

				{/* Floating SVG decorative elements */}

				{/* Game controller */}
				<div className="absolute top-[8%] left-[6%] w-16 h-16 bg-neo-yellow border-3 border-[var(--neo-border-color)] rounded-xl shadow-[4px_4px_0px_0px_var(--neo-border-color)] rotate-12 opacity-40 flex items-center justify-center">
					<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
						<rect x="2" y="6" width="20" height="12" rx="6"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="4" y1="12" x2="8" y2="12"/><circle cx="16" cy="10" r="1" fill="#1a1a1a"/><circle cx="18" cy="13" r="1" fill="#1a1a1a"/>
					</svg>
				</div>

				{/* Lightning bolt */}
				<div className="absolute top-[15%] right-[8%] w-14 h-14 bg-neo-cyan border-3 border-[var(--neo-border-color)] rounded-lg shadow-[3px_3px_0px_0px_var(--neo-border-color)] -rotate-6 opacity-35 flex items-center justify-center">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="#1a1a1a" stroke="none">
						<path d="M13 2L4.5 13H12L11 22L19.5 11H12L13 2Z"/>
					</svg>
				</div>

				{/* Code brackets */}
				<div className="absolute top-[35%] left-[4%] w-12 h-12 bg-neo-pink border-3 border-[var(--neo-border-color)] rounded-full shadow-[3px_3px_0px_0px_var(--neo-border-color)] rotate-6 opacity-30 flex items-center justify-center">
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
						<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
					</svg>
				</div>

				{/* Rocket */}
				<div className="absolute top-[55%] right-[5%] w-14 h-14 bg-neo-green border-3 border-[var(--neo-border-color)] rounded-xl shadow-[4px_4px_0px_0px_var(--neo-border-color)] -rotate-12 opacity-35 flex items-center justify-center">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
					</svg>
				</div>

				{/* Light bulb */}
				<div className="absolute bottom-[25%] left-[8%] w-12 h-12 bg-neo-purple border-3 border-[var(--neo-border-color)] rounded-lg shadow-[3px_3px_0px_0px_var(--neo-border-color)] rotate-[20deg] opacity-30 flex items-center justify-center">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
					</svg>
				</div>

				{/* Crosshair / target */}
				<div className="absolute bottom-[15%] right-[10%] w-16 h-16 bg-neo-orange border-3 border-[var(--neo-border-color)] rounded-xl shadow-[4px_4px_0px_0px_var(--neo-border-color)] -rotate-[15deg] opacity-35 flex items-center justify-center">
					<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
						<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
					</svg>
				</div>

				{/* Sparkle star */}
				<div className="absolute top-[70%] left-[15%] w-10 h-10 bg-neo-yellow border-3 border-[var(--neo-border-color)] rounded-full shadow-[2px_2px_0px_0px_var(--neo-border-color)] rotate-45 opacity-25 flex items-center justify-center">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="#1a1a1a" stroke="none">
						<path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z"/>
					</svg>
				</div>

				{/* Pixel heart */}
				<div className="absolute top-[20%] left-[45%] w-10 h-10 bg-neo-cyan/50 border-2 border-[var(--neo-border-color)] rounded-lg shadow-[2px_2px_0px_0px_var(--neo-border-color)] rotate-[30deg] opacity-25 flex items-center justify-center">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="#1a1a1a">
						<rect x="2" y="2" width="4" height="2"/><rect x="10" y="2" width="4" height="2"/><rect x="0" y="4" width="8" height="2"/><rect x="8" y="4" width="8" height="2"/><rect x="0" y="6" width="16" height="2"/><rect x="2" y="8" width="12" height="2"/><rect x="4" y="10" width="8" height="2"/><rect x="6" y="12" width="4" height="2"/>
					</svg>
				</div>

				{/* Cursor click */}
				<div className="absolute bottom-[40%] right-[20%] w-9 h-9 bg-neo-pink/50 border-2 border-[var(--neo-border-color)] rounded-full shadow-[2px_2px_0px_0px_var(--neo-border-color)] opacity-20 flex items-center justify-center">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="#1a1a1a" stroke="none">
						<path d="M4 2l6 18 3-8 8-3z"/>
					</svg>
				</div>

				{/* Decorative zigzag lines */}
				<svg className="absolute top-[45%] left-[2%] opacity-10 rotate-12" width="80" height="30" viewBox="0 0 80 30">
					<polyline points="0,15 10,5 20,25 30,5 40,25 50,5 60,25 70,5 80,15" fill="none" stroke="var(--neo-border-color)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
				</svg>
				<svg className="absolute bottom-[30%] right-[3%] opacity-10 -rotate-6" width="60" height="24" viewBox="0 0 60 24">
					<polyline points="0,12 10,2 20,22 30,2 40,22 50,2 60,12" fill="none" stroke="var(--neo-border-color)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
				</svg>
			</div>
			
			<LayoutGroup>
				<div className="rounded-md w-full max-w-2xl overflow-hidden">
					<motion.div
						layout
						transition={{ layout: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }}
						className={clsx(
							"px-6 p-8 flex flex-col items-center z-10",
							discoverReady ? "mt-48" : "mt-[16vh] sm:mt-[20vh] md:mt-[24vh]"
						)}>
						{/* Neo-Brutalism Heading */}
						<div className="w-full mb-6 flex flex-col items-center">
							<div className="bg-neo-yellow border-3 border-[var(--neo-border-color)] rounded-2xl px-6 py-3 shadow-[6px_6px_0px_0px_var(--neo-border-color)] mb-3 inline-block">
								<h1 className="text-3xl sm:text-4xl font-black text-[#1a1a1a] tracking-tight text-center leading-tight">
									What should we build?
								</h1>
							</div>
							<p className="text-text-secondary font-bold text-sm tracking-wide">
								Games, stories, art, music — if you can imagine it, let's build it 🐝
							</p>
						</div>

						<form
							method="POST"
							onSubmit={(e) => {
								e.preventDefault();
								const query = textareaRef.current!.value;
								handleCreateApp(query, projectMode);
							}}
							className="flex z-10 flex-col w-full min-h-[140px] bg-bg-4 border-3 border-[var(--neo-border-color)] rounded-2xl shadow-[6px_6px_0px_0px_var(--neo-border-color)] p-5 transition-all duration-200 focus-within:shadow-[8px_8px_0px_0px_var(--neo-border-color)] focus-within:-translate-x-[1px] focus-within:-translate-y-[1px]"
						>
							<div 
								className={clsx(
									"flex-1 flex flex-col relative",
									isDragging && "ring-2 ring-neo-cyan ring-offset-2 rounded-lg"
								)}
								{...dragHandlers}
							>
								{isDragging && (
									<div className="absolute inset-0 flex items-center justify-center bg-neo-cyan/20 backdrop-blur-sm rounded-lg z-30 pointer-events-none border-2 border-dashed border-[var(--neo-border-color)]">
										<p className="text-[#1a1a1a] font-bold">Drop images here</p>
									</div>
								)}
								<textarea
									className="w-full resize-none ring-0 z-20 outline-0 placeholder:text-text-tertiary text-text-primary font-medium bg-transparent"
									name="query"
									value={query}
									placeholder={`Create a ${currentPlaceholderText}`}
									ref={textareaRef}
									onChange={(e) => {
										setQuery(e.target.value);
										adjustTextareaHeight();
									}}
									onInput={adjustTextareaHeight}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											const query = textareaRef.current!.value;
											handleCreateApp(query, projectMode);
										}
									}}
								/>
								{images.length > 0 && (
									<div className="mt-3">
										<ImageAttachmentPreview
											images={images}
											onRemove={removeImage}
										/>
									</div>
								)}
							</div>
							<div
								className={clsx(
									'flex items-center mt-4 pt-1',
									showModeSelector ? 'justify-between' : 'justify-end',
								)}
							>
								{showModeSelector && (
									<ProjectModeSelector
										value={projectMode}
										onChange={setProjectMode}
										modes={modeOptions}
										className="flex-1"
									/>
								)}

								<div className={clsx('flex items-center gap-2', showModeSelector && 'ml-4')}>
									<ImageUploadButton
										onFilesSelected={addImages}
										disabled={isProcessing}
									/>
									<button
										type="submit"
										disabled={!query.trim()}
										className="bg-neo-orange text-[#1a1a1a] p-1.5 rounded-lg border-2 border-[var(--neo-border-color)] shadow-[3px_3px_0px_0px_var(--neo-border-color)] hover:shadow-[4px_4px_0px_0px_var(--neo-border-color)] hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_var(--neo-border-color)] *:size-5 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)] disabled:hover:translate-x-0 disabled:hover:translate-y-0"
									>
										<ArrowRight />
									</button>
								</div>
							</div>
						</form>
					</motion.div>

				</div>

				<AnimatePresence>
					{images.length > 0 && (
						<motion.div
							initial={{ opacity: 0, y: -10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="w-full max-w-2xl px-6"
						>
							<div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-neo-yellow/20 border-2 border-[var(--neo-border-color)] shadow-[3px_3px_0px_0px_var(--neo-border-color)]">
								<Info className="size-4 text-[#1a1a1a] flex-shrink-0 mt-0.5" />
								<p className="text-xs text-text-secondary leading-relaxed font-medium">
									<span className="font-bold text-text-primary">Images Beta:</span> Images guide app layout and design but may not be replicated exactly.
								</p>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				<AnimatePresence>
					{discoverReady && (
						<motion.section
							key="discover-section"
							layout
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
							className={clsx('max-w-6xl mx-auto px-4 z-10', images.length > 0 ? 'mt-10' : 'mt-16 mb-8')}
						>
							<div className='flex flex-col items-start'>
								<div className="flex items-center gap-3 mb-1">
									<div className="bg-neo-cyan border-2 border-[var(--neo-border-color)] rounded-lg px-3 py-1 shadow-[3px_3px_0px_0px_var(--neo-border-color)]">
										<h2 className="text-lg font-black text-[#1a1a1a]">🔥 Trending</h2>
									</div>
								</div>
								<div ref={discoverLinkRef} className="text-sm font-bold mb-4 text-text-tertiary hover:text-neo-orange underline-offset-4 select-text cursor-pointer transition-colors" onClick={() => navigate('/discover')} >View All →</div>
								<motion.div
									layout
									transition={{ duration: 0.4 }}
									className="grid grid-cols-2 xl:grid-cols-3 gap-6"
								>
									<AnimatePresence mode="popLayout">
										{apps.map(app => (
											<AppCard
												key={app.id}
												app={app}
												onClick={() => navigate(`/feed/${app.id}`)}
												showStats={true}
												showUser={true}
												showActions={false}
											/>
										))}
									</AnimatePresence>
								</motion.div>
							</div>
						</motion.section>
					)}
				</AnimatePresence>
			</LayoutGroup>

			{/* Nudge towards Discover */}
			{user && <CurvedArrow sourceRef={discoverLinkRef} target={{ x: 50, y: window.innerHeight - 60 }} />}
		</div>
	);
}



type ArrowProps = {
	/** Ref to the source element the arrow starts from */
	sourceRef: React.RefObject<HTMLElement | null>;
	/** Target point in viewport/client coordinates */
	target: { x: number; y: number };
	/** Curve intensity (0.1 - 1.5 is typical) */
	curvature?: number;
	/** Optional pixel offset from source element edge */
	sourceOffset?: number;
	/** If true, hides the arrow when the source is offscreen/not measurable */
	hideWhenInvalid?: boolean;
};

type Point = { x: number; y: number };

export const CurvedArrow: React.FC<ArrowProps> = ({
	sourceRef,
	target,
	curvature = 0.5,
	sourceOffset = 6,
	hideWhenInvalid = true,
}) => {
	const [start, setStart] = useState<Point | null>(null);
	const [end, setEnd] = useState<Point | null>(null);

	const rafRef = useRef<number | null>(null);
	const roRef = useRef<ResizeObserver | null>(null);

	const compute = () => {
		const el = sourceRef.current;
		if (!el) {
			setStart(null);
			setEnd(null);
			return;
		}

		const rect = el.getBoundingClientRect();
		if (!rect || rect.width === 0 || rect.height === 0) {
			setStart(null);
			setEnd(null);
			return;
		}

		const endPoint: Point = { x: target.x, y: target.y };

		// Choose an anchor on the source: midpoint of the side facing the target
		const centers = {
			right: { x: rect.right, y: rect.top + rect.height / 2 },
			left: { x: rect.left, y: rect.top + rect.height / 2 },
		};

		// Distances to target from each side center
		const dists = Object.fromEntries(
			Object.entries(centers).map(([side, p]) => [
				side,
				(p.x - endPoint.x) ** 2 + (p.y - endPoint.y) ** 2,
			])
		) as Record<keyof typeof centers, number>;

		const bestSide = (Object.entries(dists).sort((a, b) => a[1] - b[1])[0][0] ||
			"right") as keyof typeof centers;

		// Nudge start point slightly outside the element for visual clarity
		const nudge = (p: Point, side: keyof typeof centers, offset: number) => {
			switch (side) {
				case "right":
					return { x: p.x + offset, y: p.y };
				case "left":
					return { x: p.x - offset, y: p.y };
			}
		};

		const startPoint = nudge(centers[bestSide], bestSide, sourceOffset);

		setStart(startPoint);
		setEnd(endPoint);
	};

	// Throttle updates with rAF to avoid layout thrash
	const scheduleCompute = () => {
		if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
		rafRef.current = requestAnimationFrame(compute);
	};

	useEffect(() => {
		scheduleCompute();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [target.x, target.y, sourceRef.current]);

	useEffect(() => {
		const onScroll = () => scheduleCompute();
		const onResize = () => scheduleCompute();

		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onResize);

		// Track source element size changes
		const el = sourceRef.current;
		if ("ResizeObserver" in window) {
			roRef.current = new ResizeObserver(() => scheduleCompute());
			if (el) roRef.current.observe(el);
		}

		scheduleCompute();

		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onResize);
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
			if (roRef.current && el) roRef.current.unobserve(el);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const d = useMemo(() => {
		if (!start || !end) return "";

		const dx = end.x - start.x;
		const dy = end.y - start.y;

		// Control points: bend the curve based on the primary axis difference.
		// This gives a nice S or C curve without sharp kinks.
		const cpOffset = Math.max(Math.abs(dx), Math.abs(dy)) * curvature;

		const c1: Point = { x: start.x + cpOffset * (dx >= 0 ? 1 : -1), y: start.y };
		const c2: Point = { x: end.x - cpOffset * (dx >= 0 ? 1 : -1), y: end.y };

		return `M ${start.x},${start.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}`;
	}, [start, end, curvature]);

	const hidden = hideWhenInvalid && (!start || !end);

	if (start && end && (end.y - start.y > 420 || start.x - end.x < 100)) {
		return null;
	}

	return (
		<svg
			aria-hidden="true"
			style={{
				position: "fixed",
				inset: 0,
				width: "100vw",
				height: "100vh",
				pointerEvents: "none",
				overflow: "visible",
				zIndex: 9999,
				display: hidden ? "none" : "block",
			}}
		>
			<defs>
				<filter id="discover-squiggle" x="-20%" y="-20%" width="140%" height="140%">
					<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="3" result="noise" />
					<feDisplacementMap in="SourceGraphic" in2="noise" scale="1" xChannelSelector="R" yChannelSelector="G" />
				</filter>
				<marker id="discover-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth" opacity={0.20}>
					<path d="M 0 1.2 L 7 4" stroke="var(--color-text-tertiary)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
					<path d="M 0 6.8 L 7 4" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
				</marker>
			</defs>

			<path
				d={d}
				// stroke="var(--color-accent)"
				stroke="var(--color-text-tertiary)"
				strokeOpacity={0.20}
				strokeWidth={1.6}
				fill="none"
				strokeLinecap="round"
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
				markerEnd="url(#discover-arrowhead)"
			/>
			{/* Soft squiggle overlay for hand-drawn feel */}
			<g filter="url(#discover-squiggle)">
				<path
					d={d}
					// stroke="var(--color-accent)"
					stroke="var(--color-text-tertiary)"
					strokeOpacity={0.12}
					strokeWidth={1}
					fill="none"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeDasharray="8 6 4 9 5 7"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
		</svg>
	);
};
