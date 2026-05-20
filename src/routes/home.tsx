import { useRef, useState, useEffect, useMemo } from 'react';
import { ArrowRight } from 'react-feather';
import { useNavigate } from 'react-router';
import { ProjectModeSelector, type ProjectModeOption } from '../components/project-mode-selector';
import {
	MAX_AGENT_QUERY_LENGTH,
	SUPPORTED_CHAT_MEDIA_MIME_TYPES,
	type ImageAttachment,
	type ProjectType,
} from '@/api-types';
import { useFeature } from '@/features';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { useInviteCode } from '../hooks/useInviteCode';
import clsx from 'clsx';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useDragDrop } from '@/hooks/use-drag-drop';
import { AttachmentPickerDropdown } from '@/components/attachment-picker-dropdown';
import { CameraCaptureButton } from '@/components/camera-capture-button';
import { KlipyMediaPicker } from '@/components/klipy-media-picker';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import { getClipboardFiles } from '@/utils/clipboard-files';
import { toast } from 'sonner';
import { Box, Laugh, Layers2, Shuffle } from 'lucide-react';
import { useAppI18n } from '@/i18n';

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

const SURPRISE_PROMPTS_ZH = [
	'做一个“房间都着火了还说没事”的互动小游戏，玩家可以拖动灭火器救场，也可以拖动汽油桶让场面更失控。',
	'帮一只胆小的小猫穿过满是黄瓜的房间。黄瓜移动时，玩家要点击让小猫停住。',
	'做一个“三心二意男友”的互动短剧，玩家可以把不同标签拖到角色身上，看男友做出夸张反应。',
	'设计一个 30 秒电梯求生小游戏，玩家要点击“点头”或“微笑”，让理智值不要归零。',
	'做一个“梦中约会对象”生成器，玩家把 3 个随机物品拖进传送门，最后得到一张离谱人设卡。',
	'做一个红色按钮两难选择小游戏，出现两个不可能的选择，并显示其他玩家选择相同答案的比例。',
	'做一个暴躁 AI 厨师小游戏，玩家把奇怪食材拖进锅里，厨师会做出动画反应。',
	'做一个红毯换装小游戏，每件装扮都会改变背景音乐和观众欢呼程度。',
	'做一个偷宝石小游戏，玩家要在沉睡的巨龙醒来前尽量多拿宝石，并分享自己的贪心分数。',
	'做一个 2026 幸运饼干小游戏，玩家摇晃手机打开饼干，看到 AI 生成的专属祝福。',
	'做一个迷你解压房，玩家通过滑动砸碎坏消息标题，最后得到一张“今天也撑过去了”成绩卡。',
	'做一个地铁跑酷小游戏，角色要躲开飞来的账单，并收集咖啡获得连击分数。',
	'做一个“你是群聊里的哪种朋友”小游戏，玩家点击不断消失的可疑消息，最后得到一张混乱角色卡。',
	'做一个桌面整理限时挑战，玩家要在老板走过来前，把零食、线缆和神秘杂物拖进抽屉。',
	'做一个心情股票小游戏，玩家要在倒计时结束前买入或卖出“开心”“慌张”等情绪。',
	'做一个反应测试小游戏，闹钟变红时才能拍掉它，最后分享自己的起床困难户等级。',
	'做一个坏选择抓娃娃机，玩家移动爪子抓取一个选择，然后得到一句犀利占卜。',
	'做一个主角出场节奏游戏，玩家按节拍点击，躲开尴尬对视和掉落的通知。',
	'做一个零食潜入小游戏，玩家点击阴影躲避摄像头，偷偷收集便利店零食。',
	'做一个室友模拟器，玩家选择洗碗、无视或留纸条，然后观察公寓混乱值变化。',
	'做一个“回复还是装没看见”的聊天小游戏，玩家要在输入气泡爆炸前快速选择回复。',
	'做一个生日蜡烛挑战，玩家通过吹气、点击或摇晃熄灭会不断复燃的蜡烛。',
	'做一个可爱幽灵约会小游戏，玩家在日出前拖动礼物赢得幽灵好感。',
	'做一个“选择你的反派起源故事”小游戏，玩家点击三个小烦恼，得到戏剧化漫画结果。',
	'做一个食堂托盘平衡游戏，玩家通过拖动或倾斜，避免汤、薯条和八卦洒出来。',
	'做一个迷你法庭小游戏，玩家把证据拖到可疑面包旁，法官会根据证据做反应。',
	'做一个节日红包小游戏，玩家点击幸运红包，同时避开会偷走分数的整蛊红包。',
	'做一个“你能养活这盆植物吗”小游戏，玩家拖动阳光、水和夸奖，避免植物情绪崩溃。',
	'做一个卡拉 OK 手忙脚乱挑战，玩家按节奏点击歌词，同时控制观众评价值。',
	'做一个停车场 Boss 战，玩家把小车拖进不可能的车位，同时躲开路锥攻击。',
	'做一个“选择你的周一装备”换装小游戏，每件物品都会改变体力、混乱值和咖啡依赖。',
	'做一个情侣默契街机小游戏，两名玩家按相同节奏点击爱心，最后得到一个离谱组合称号。',
	'做一个家庭聚餐求生小游戏，玩家点击安全话题，躲开关于工资、恋爱和人生规划的问题。',
	'做一个遛狗混乱小游戏，玩家拖动牵引绳收集零食，同时避开水坑和各种分心事件。',
	'做一个“评评我的冰箱”小游戏，玩家把随机剩菜拖进搅拌机，得到一份可疑食谱评分。',
	'做一个女巫药水挑战，玩家按时机投放材料，最后揭晓一种个性诅咒。',
	'做一个办公室打印机 Boss 战，玩家可以猛按、拍打或温柔鼓励打印机，让它在会议前工作。',
	'做一个“你是哪种累”小游戏，玩家接住掉落的借口，最后得到一张疲惫人格卡。',
	'做一个咖啡店高峰期小游戏，玩家要在顾客耐心值耗尽前把订单拖给对应顾客。',
	'做一个“帮我收行李”旅行挑战，玩家在出租车到达前选择 5 件物品，最后得到灾难预报。',
	'做一个迷你健身挑战，玩家点击举起小道具，解锁冠军姿势。',
	'做一个闹鬼电梯小游戏，玩家选择楼层、躲开异常事件，最后得到通勤灵异评分。',
	'做一个“要不要发这封危险邮件”小游戏，玩家把短语拖进邮件，观察老板、朋友或同事的反应。',
	'做一个网络热梗博物馆，玩家点击画作改写标题，并解锁馆长的毒舌点评。',
	'做一个失恋恢复街机游戏，玩家滑走伤感歌曲，收集零食补满体面值。',
	'做一个迷你龙咖啡馆，玩家把宝石、茶或烤焦吐司拖给顾客，同时控制火灾风险值。',
	'做一个“猜哪句是假话”派对小游戏，玩家在倒计时结束前点击三句话中的假话，并获得识破分数。',
	'做一个健身动力小游戏，玩家躲开借口、收集蛋白饮料，最后解锁“猛练还是补觉”结果。',
	'做一个学校走廊潜行小游戏，玩家点击储物柜躲开突击测验，并收集八卦纸条。',
	'做一个“你是哪件神秘宝物”小游戏，玩家从宝藏堆里选择发光物品，得到一张可分享结果卡。',
	'做一个天气神模拟器，玩家把云、太阳和闪电拖到城市上，尽量提高混乱或幸福指数。',
	'做一个约会红旗探测器，玩家在浪漫值下降前点击可疑行为。',
	'做一个睡猫节奏小游戏，玩家按呼噜节拍点击，让猫继续做梦并解锁奇怪梦境。',
	'做一个产品发布会彩带小游戏，玩家点击 bug，别让它们冲上舞台毁掉演示。',
	'做一个评论区求生小游戏，玩家滑走恶意评论，并置顶友善回复获得护盾。',
	'做一个商场扶梯小游戏，玩家在完美时机点击上扶梯，避开购物袋连环撞击。',
	'做一个迷你房租谈判小游戏，玩家拖动理由、租金和小礼物，降低房东怒气值。',
	'做一个新年计划转盘，玩家旋转、接住一个习惯，并得到一句犀利的 2026 预测。',
	'做一个好友心灵感应小游戏，两名玩家选择相同的零食、心情和借口，最后得到同步分数。',
	'做一个“不要按这个按钮”的互动玩具，每点一次按钮都会更戏剧化，直到揭晓你的混乱等级。',
];

const PENDING_MEDIA_STORAGE_PREFIX = 'buzzplay-pending-media:';
type PlayableType = '2d' | '3d';

function createPendingMediaKey(): string {
	const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
	return `${PENDING_MEDIA_STORAGE_PREFIX}${Date.now()}:${randomId}`;
}

function storePendingMedia(attachments: ImageAttachment[]): string | null {
	if (attachments.length === 0 || typeof window === 'undefined') return null;

	try {
		const key = createPendingMediaKey();
		window.sessionStorage.setItem(key, JSON.stringify(attachments));
		return key;
	} catch (error) {
		console.warn('Failed to store pending media for chat route:', error);
		return null;
	}
}

export default function Home() {
	const navigate = useNavigate();
	const { locale, t } = useAppI18n();
	const { requireAuth } = useAuthGuard();
	const { requireInviteCode } = useInviteCode();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const lastSurprisePromptIndex = useRef<number | null>(null);
	const [projectMode, setProjectMode] = useState<ProjectType>('app');
	const [playableType, setPlayableType] = useState<PlayableType>('2d');
	const [query, setQuery] = useState('');
	const [isKlipyMediaPickerOpen, setIsKlipyMediaPickerOpen] = useState(false);
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

	const handlePasteAttachments = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
		if (isProcessing) return;

		const files = getClipboardFiles(event.clipboardData, SUPPORTED_CHAT_MEDIA_MIME_TYPES);
		if (files.length === 0) return;

		event.preventDefault();
		void addImages(files);
	};


	const placeholderPhrases = useMemo(() => {
		if (locale === 'zh-CN') {
			return [
				'多人答题小游戏',
				'复古像素画生成器',
				'互动冒险故事',
				'音乐节奏垫',
				'会成长的虚拟伙伴',
				'表情菜谱猜谜游戏',
				'太空射击 Boss 战',
				'互动漫画生成器',
			];
		}

		return [
			'multiplayer trivia quiz',
			'retro pixel art maker',
			'choose-your-own-adventure story',
			'music beat pad with effects',
			'virtual pet that learns tricks',
			'emoji recipe guessing game',
			'space invaders with boss fights',
			'interactive comic strip builder',
		];
	}, [locale]);
	const [currentPlaceholderPhraseIndex, setCurrentPlaceholderPhraseIndex] = useState(0);
	const [currentPlaceholderText, setCurrentPlaceholderText] = useState("");
	const [isPlaceholderTyping, setIsPlaceholderTyping] = useState(true);
	const currentSurprisePrompts = locale === 'zh-CN' ? SURPRISE_PROMPTS_ZH : SURPRISE_PROMPTS;
	const composerPlaceholder = locale === 'zh-CN'
		? `创建${currentPlaceholderText || '一个互动内容'}`
		: `Create a ${currentPlaceholderText || 'playable experience'}`;

	const handleCreateApp = (query: string, mode: ProjectType) => {
		if (playableType !== '2d') {
			toast.info(t('3D playable posts are coming soon.'));
			return;
		}

		if (query.length > MAX_AGENT_QUERY_LENGTH) {
			toast.error(
				`Prompt too large (${query.length} characters). Maximum allowed is ${MAX_AGENT_QUERY_LENGTH} characters.`,
			);
			return;
		}

		const encodedQuery = encodeURIComponent(query);
		const encodedMode = encodeURIComponent(mode);

		const mediaKey = storePendingMedia(images);
		const fallbackImageParam = images.length > 0 && !mediaKey
			? `&images=${encodeURIComponent(JSON.stringify(images))}`
			: '';
		const mediaParam = mediaKey ? `&mediaKey=${encodeURIComponent(mediaKey)}` : fallbackImageParam;
		const intendedUrl = `/chat/new?query=${encodedQuery}&projectType=${encodedMode}${mediaParam}`;
		const routeState = images.length > 0 ? { images } : undefined;

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
			navigate(intendedUrl, routeState ? { state: routeState } : undefined);
			clearImages();
		};
		if (!requireInviteCode({ onSuccess: goToChat })) {
			return;
		}
		goToChat();
	};

	// Keep the composer fixed-height; long prompts scroll inside the textarea.
	const adjustTextareaHeight = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = '';
		}
	};

	const handleSurprisePrompt = () => {
		let nextIndex = Math.floor(Math.random() * currentSurprisePrompts.length);
		if (
			currentSurprisePrompts.length > 1 &&
			lastSurprisePromptIndex.current !== null &&
			nextIndex === lastSurprisePromptIndex.current
		) {
			nextIndex = (nextIndex + 1) % currentSurprisePrompts.length;
		}

		lastSurprisePromptIndex.current = nextIndex;
		setQuery(currentSurprisePrompts[nextIndex]);
		requestAnimationFrame(() => {
			textareaRef.current?.focus();
			adjustTextareaHeight();
		});
	};

	useEffect(() => {
		adjustTextareaHeight();
	}, []);

	useEffect(() => {
		setCurrentPlaceholderPhraseIndex(0);
		setCurrentPlaceholderText('');
		setIsPlaceholderTyping(true);
		lastSurprisePromptIndex.current = null;
	}, [locale]);

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
				<div className="px-4 md:px-6 p-8 flex flex-col items-center z-10 mt-[6vh] sm:mt-[10vh] md:mt-[14vh]">
					{/* Neo-Brutalism Heading */}
					<div className="w-full mb-6 flex flex-col items-center">
						<div className="bg-neo-yellow border-3 border-[var(--neo-border-color)] rounded-2xl px-6 py-3 shadow-[6px_6px_0px_0px_var(--neo-border-color)] mb-3 inline-block">
							<h1 className="text-3xl sm:text-4xl font-black text-[#1a1a1a] tracking-tight text-center leading-tight">
								{t('Make it playable.')}
							</h1>
						</div>
						<p className="text-text-secondary font-bold text-sm tracking-wide">
							{t('Turn any idea, meme, or character into a playable post you can share')}
						</p>
					</div>

					<div className="group z-10 w-full transition-all duration-200 focus-within:-translate-x-[1px] focus-within:-translate-y-[1px]">
						<div className="relative z-20 mb-[-3px] ml-3 flex">
							<div
								className="inline-flex items-center gap-1 rounded-t-xl border-3 border-b-0 border-[var(--neo-border-color)] bg-bg-4 px-1 py-1"
								aria-label={t('Playable type')}
							>
								<button
									type="button"
									onClick={() => setPlayableType('2d')}
									aria-pressed={playableType === '2d'}
									className={clsx(
										'inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-black transition-all',
										playableType === '2d'
											? 'bg-neo-yellow text-[#1a1a1a] shadow-[1px_1px_0px_0px_var(--neo-border-color)]'
											: 'bg-transparent text-text-primary/60 hover:text-text-primary'
									)}
									title={t('Build a 2D playable with the current Phaser template')}
								>
									<Layers2 className="size-3.5" />
									2D
								</button>
								<button
									type="button"
									disabled
									className="inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-lg bg-transparent px-2.5 text-xs font-black text-text-primary/35"
									aria-label={t('3D Coming soon')}
									title={t('3D playable posts are coming soon.')}
								>
									<Box className="size-3.5" />
									3D
									<span className="hidden rounded-full bg-text-primary/10 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none text-text-primary/45 sm:inline">
										{t('Coming soon')}
									</span>
								</button>
							</div>
						</div>
						<form
							method="POST"
							onSubmit={(e) => {
								e.preventDefault();
								const query = textareaRef.current!.value;
								handleCreateApp(query, projectMode);
							}}
							className="relative z-10 flex h-[240px] w-full flex-col rounded-2xl border-3 border-[var(--neo-border-color)] bg-bg-4 p-5 shadow-[6px_6px_0px_0px_var(--neo-border-color)] transition-shadow duration-200 group-focus-within:shadow-[8px_8px_0px_0px_var(--neo-border-color)] sm:h-[260px]"
						>
							<div
								className={clsx(
									'flex min-h-0 flex-1 flex-col overflow-hidden relative',
									isDragging && 'ring-2 ring-neo-cyan ring-offset-2 rounded-lg'
								)}
								{...dragHandlers}
							>
								{isDragging && (
									<div className="absolute inset-0 flex items-center justify-center bg-neo-cyan/20 backdrop-blur-sm rounded-lg z-30 pointer-events-none border-2 border-dashed border-[var(--neo-border-color)]">
										<p className="text-[#1a1a1a] font-bold">{t('Drop images, audio, or video here')}</p>
									</div>
								)}
								<textarea
									className="z-20 min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent font-medium text-text-primary outline-0 ring-0 placeholder:text-text-tertiary"
									name="query"
									value={query}
									placeholder={composerPlaceholder}
									ref={textareaRef}
									onChange={(e) => {
										setQuery(e.target.value);
										adjustTextareaHeight();
									}}
									onInput={adjustTextareaHeight}
									onPaste={handlePasteAttachments}
									onKeyDown={(e) => {
										const nativeEvent = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
										if (nativeEvent.isComposing || nativeEvent.keyCode === 229) {
											return;
										}

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
										onClick={() => setIsKlipyMediaPickerOpen(true)}
										disabled={isProcessing}
										className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-[var(--neo-border-color)] bg-neo-pink px-2.5 py-1.5 text-xs font-black text-[#1a1a1a] shadow-[2px_2px_0px_0px_var(--neo-border-color)] transition-all duration-150 hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)] hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_var(--neo-border-color)] disabled:cursor-not-allowed disabled:opacity-40"
										aria-label={t('Pick KLIPY media')}
									>
										<Laugh className="size-3.5" />
										<span>{t('Media')}</span>
									</button>
									<button
										type="button"
										onClick={handleSurprisePrompt}
										className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-[var(--neo-border-color)] bg-neo-cyan px-2.5 py-1.5 text-xs font-black text-[#1a1a1a] shadow-[2px_2px_0px_0px_var(--neo-border-color)] transition-all duration-150 hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)] hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_var(--neo-border-color)]"
										aria-label={t('Fill with a surprise prompt')}
									>
										<Shuffle className="size-3.5" />
										<span>{t('Surprise')}</span>
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
									<CameraCaptureButton
										onPhotoCaptured={(files) => addImages(files)}
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
					</div>
				</div>
			</div>

			<KlipyMediaPicker
				open={isKlipyMediaPickerOpen}
				onOpenChange={setIsKlipyMediaPickerOpen}
				onFilesSelected={(files) => addImages(files)}
				disabled={isProcessing}
			/>

			</div>
		);
	}
