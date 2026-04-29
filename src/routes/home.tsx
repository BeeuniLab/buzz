import { useRef, useState, useEffect, useMemo } from 'react';
import { ArrowRight } from 'react-feather';
import { useNavigate } from 'react-router';
import { ProjectModeSelector, type ProjectModeOption } from '../components/project-mode-selector';
import { MAX_AGENT_QUERY_LENGTH, SUPPORTED_CHAT_MEDIA_MIME_TYPES, type ProjectType } from '@/api-types';
import { useFeature } from '@/features';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { useInviteCode } from '../hooks/useInviteCode';
import clsx from 'clsx';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useDragDrop } from '@/hooks/use-drag-drop';
import { AttachmentPickerDropdown } from '@/components/attachment-picker-dropdown';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import { toast } from 'sonner';
import { Shuffle } from 'lucide-react';

const SURPRISE_PROMPTS = [
	"A 'This is Fine' dog meme but the user can drag a fire extinguisher to save the room or a gasoline can to make it worse.",
	"Help a shy cat cross a room full of cucumbers. The user must tap to freeze the cat when the cucumbers move.",
	"Distracted Boyfriend meme: The user can drag different labels onto the girl in the red dress to see the boyfriend's hilarious reactions.",
	"Can you survive a 30-second elevator ride with an annoying boss? Tap to 'nod' or 'smile' to keep your sanity bar from hitting zero.",
	"Build your 'Dream Date' by dragging 3 random items into a portal. Get a ridiculous persona result card at the end.",
	"Red Button Dilemma: Two impossible choices appear. See what percentage of other players chose the same as you.",
	"A grumpy AI chef. Drag ingredients like 'a shoe' or 'glitter' into the pot and see the chef's animated rage or confusion.",
	"Dress up a Capybara for a red carpet event. Each item chosen changes the background music and the crowd's cheering level.",
	"Poke a sleeping dragon to see how many gems you can steal before it wakes up. Share your 'Greed Score' with friends.",
	"Create a 'Fortune Cookie' for 2026. Users shake their phone to crack the cookie and reveal a personalized AI-generated blessing.",
	"Make a tiny rage-room toy where users smash floating bad-news headlines by swiping, then get a 'Today I Survived' score card.",
	"Create a brainrot subway runner where a screaming frog dodges flying invoices and collects tiny coffees for combo points.",
	"Build a 'Which Group Chat Friend Are You?' game where users tap suspicious messages before they disappear to reveal a chaotic role card.",
	"Make a desk-cleaning speed challenge where users drag snacks, cables, and mystery objects into drawers before the boss walks by.",
	"Create a fake stock market for moods. Users tap buy or sell on emotions like 'delulu' and 'panic' before the timer ends.",
	"Build a reaction test where users must slap the alarm clock only when it turns red, then share their 'morning goblin' rank.",
	"Make a tiny claw machine full of bad decisions. Users drag the claw to grab one and receive a brutally honest fortune.",
	"Create a 'main character walk' rhythm game where users tap on beat to dodge awkward eye contact and falling notifications.",
	"Build a snack heist game where a raccoon sneaks through a convenience store and users tap shadows to hide from cameras.",
	"Make a roommate simulator where users choose whether to wash dishes, ignore them, or leave a note, then watch the apartment chaos meter.",
	"Create a 'reply or ghost?' texting game where users choose fast responses before the typing bubble explodes.",
	"Build a birthday candle challenge where users blow, tap, or shake to extinguish cursed candles that keep relighting.",
	"Make a cute ghost dating sim where users drag spooky gifts to impress the ghost before sunrise.",
	"Create a 'pick your villain origin story' toy where users tap three tiny annoyances and get a dramatic comic-book result.",
	"Build a cafeteria tray balancing game where users tilt or drag to keep soup, fries, and gossip from spilling.",
	"Make a tiny court trial where a cat judge reacts as users drag evidence onto a suspicious loaf of bread.",
	"Create a festival red-envelope game where users tap lucky packets while avoiding prank packets that steal points.",
	"Build a 'Can you keep the plant alive?' micro-game where users drag sun, water, and compliments before the plant gets dramatic.",
	"Make a karaoke panic challenge where users tap lyrics in time while the crowd's judgment meter rises.",
	"Create a parking-lot boss fight where users drag a tiny car into impossible spaces while cones attack.",
	"Build a 'choose your Monday armor' dress-up toy where every item changes your stamina, chaos, and coffee dependency.",
	"Make a love compatibility arcade toy where two players tap hearts at the same rhythm to reveal a ridiculous couple title.",
	"Create a family dinner survival game where users tap safe topics and dodge questions about salary, dating, and life plans.",
	"Build a dog-walking chaos game where users drag the leash to collect treats while avoiding squirrels and puddles.",
	"Make a 'rate my fridge' mini-game where users drag random leftovers into a blender and get a questionable recipe score.",
	"Create a witch potion challenge where users drop ingredients by timing taps, then reveal a personality curse.",
	"Build a tiny office printer boss battle where users mash, kick, or gently encourage the printer before the meeting starts.",
	"Make a 'what kind of tired are you?' game where users catch falling excuses to reveal a sleep-deprived creature card.",
	"Create a coffee shop rush game where users drag orders to customers before their patience bubbles pop.",
	"Build a 'pack my bag' travel challenge where users choose 5 items before the taxi arrives, then get a disaster forecast.",
	"Make a dramatic hamster gym game where users tap to lift sunflower seeds and unlock a tiny champion pose.",
	"Create a haunted elevator game where users choose floors, dodge ghosts, and get a paranormal commute rating.",
	"Build a 'send the risky email' dilemma toy where users drag phrases into an email and watch HR, boss, or friend reactions.",
	"Make a meme museum where users tap paintings to remix captions and unlock a cursed curator review.",
	"Create a breakup recovery arcade where users swipe away sad songs and collect snacks to refill dignity.",
	"Build a tiny dragon cafe where users drag gems, tea, or burnt toast to customers and manage the fire hazard meter.",
	"Make a 'guess the lie' party game where users tap one of three claims before time runs out and get a deception score.",
	"Create a gym motivation game where users dodge excuses, collect protein shakes, and unlock a 'beast mode or nap mode' result.",
	"Build a school hallway stealth game where users tap lockers to hide from pop quizzes and collect gossip notes.",
	"Make a 'which cursed artifact are you?' toy where users choose shiny objects from a treasure pile and get a shareable curse card.",
	"Create a tiny weather god simulator where users drag clouds, suns, and lightning onto a city to maximize chaos or happiness.",
	"Build a dinner date red-flag detector where users tap suspicious behaviors before the romance meter drops.",
	"Make a sleepy cat rhythm toy where users tap purr beats to keep the cat dreaming and unlock weird dream scenes.",
	"Create a product launch confetti game where users tap bugs before they reach the stage and ruin the keynote.",
	"Build a 'survive the comment section' game where users swipe away trolls and pin wholesome replies for shield power.",
	"Make a mall escalator mini-game where users tap to step on at the perfect moment and avoid shopping bag avalanches.",
	"Create a 'tiny landlord negotiation' game where users drag excuses, rent, and cookies to lower the angry meter.",
	"Build a New Year resolution roulette where users spin, catch a habit, and get a brutally funny 2026 prediction.",
	"Make a best-friend telepathy game where two players choose matching snacks, moods, and excuses to reveal a sync score.",
	"Create a 'do not press the button' toy where every tap makes the button more dramatic until it reveals your chaos level.",
];

export default function Home() {
	const navigate = useNavigate();
	const { requireAuth } = useAuthGuard();
	const { requireInviteCode } = useInviteCode();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const lastSurprisePromptIndex = useRef<number | null>(null);
	const [projectMode, setProjectMode] = useState<ProjectType>('app');
	const [query, setQuery] = useState('');
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
		mode: 'chat-media',
		onError: (error) => {
			console.error('Attachment upload error:', error);
			toast.error(error);
		},
	});

	const { isDragging, dragHandlers } = useDragDrop({
		onFilesDropped: addImages,
		accept: [...SUPPORTED_CHAT_MEDIA_MIME_TYPES],
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

		// User is already authenticated, check invite code
		const goToChat = () => {
			navigate(intendedUrl);
			clearImages();
		};
		if (!requireInviteCode({ onSuccess: goToChat })) {
			return;
		}
		goToChat();
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

	const handleSurprisePrompt = () => {
		let nextIndex = Math.floor(Math.random() * SURPRISE_PROMPTS.length);
		if (
			SURPRISE_PROMPTS.length > 1 &&
			lastSurprisePromptIndex.current !== null &&
			nextIndex === lastSurprisePromptIndex.current
		) {
			nextIndex = (nextIndex + 1) % SURPRISE_PROMPTS.length;
		}

		lastSurprisePromptIndex.current = nextIndex;
		setQuery(SURPRISE_PROMPTS[nextIndex]);
		requestAnimationFrame(() => {
			textareaRef.current?.focus();
			adjustTextareaHeight();
		});
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

	return (
		<div className="relative flex flex-col items-center size-full overflow-auto">
			{/* Neo-Brutalism Background */}
			<div className="fixed inset-0 z-0 pointer-events-none overflow-hidden hidden md:block">
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

			<div className="rounded-md w-full max-w-2xl overflow-hidden">
				<div className="px-4 md:px-6 p-8 flex flex-col items-center z-10 mt-[10vh] sm:mt-[16vh] md:mt-[24vh]">
					{/* Neo-Brutalism Heading */}
					<div className="w-full mb-6 flex flex-col items-center">
						<div className="bg-neo-yellow border-3 border-[var(--neo-border-color)] rounded-2xl px-6 py-3 shadow-[6px_6px_0px_0px_var(--neo-border-color)] mb-3 inline-block">
							<h1 className="text-3xl sm:text-4xl font-black text-[#1a1a1a] tracking-tight text-center leading-tight">
								Create interactive AI content with BuzzPlay
							</h1>
						</div>
						<p className="text-text-secondary font-bold text-sm tracking-wide">
							Turn an idea, meme, or character into a playable post you can share
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
									<p className="text-[#1a1a1a] font-bold">Drop images, audio, or video here</p>
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
						<div className="flex items-center justify-between mt-4 pt-1 gap-3">
							<div className="flex min-w-0 flex-1 items-center gap-2">
								<button
									type="button"
									onClick={handleSurprisePrompt}
									className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-[var(--neo-border-color)] bg-neo-cyan px-2.5 py-1.5 text-xs font-black text-[#1a1a1a] shadow-[2px_2px_0px_0px_var(--neo-border-color)] transition-all duration-150 hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)] hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_var(--neo-border-color)]"
									aria-label="Fill with a surprise prompt"
								>
									<Shuffle className="size-3.5" />
									<span>Surprise</span>
								</button>

								{showModeSelector && (
									<ProjectModeSelector
										value={projectMode}
										onChange={setProjectMode}
										modes={modeOptions}
										className="flex-1"
									/>
								)}
							</div>

							<div className="flex shrink-0 items-center gap-2">
								<AttachmentPickerDropdown
									onFilesSelected={(files) => {
										void addImages(files);
									}}
									disabled={isProcessing}
									triggerClassName="p-1.5 rounded-lg border-2 border-[var(--neo-border-color)] shadow-[2px_2px_0px_0px_var(--neo-border-color)] bg-bg-4 hover:bg-bg-3 text-[#1a1a1a] dark:text-text-primary dark:hover:text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5"
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
				</div>
			</div>

			</div>
		);
	}
