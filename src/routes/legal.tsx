import React from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type LegalTab = 'terms' | 'privacy';

const EFFECTIVE_DATE = '13 August 2024';
const SUPPORT_EMAIL = 'support@hekmat.cloud';

const termsSections = [
	{
		title: 'Company and Service',
		body: [
			'BuzzPlay is developed and provided by Hekmat Corp. These Terms govern your access to BuzzPlay, including the website, creation tools, feeds, generated interactive content, user accounts, and related services.',
			'By creating an account, signing in, posting content, or otherwise using BuzzPlay, you accept these Terms and any additional policies shown in the product.',
		],
	},
	{
		title: 'Accounts and Login',
		body: [
			'You may need an account to create, save, publish, remix, comment on, or otherwise interact with content. You are responsible for the activity under your account and for keeping your login credentials secure.',
			'If you sign in with a third-party provider, such as Google, that provider may process your login information under its own terms and privacy policy.',
		],
	},
	{
		title: 'Eligibility',
		body: [
			'You must be at least 18 years old, or old enough to consent to online services in your country. If you use BuzzPlay on behalf of a company or another person, you confirm that you have authority to do so.',
		],
	},
	{
		title: 'Acceptable Use',
		body: [
			'You may not use BuzzPlay to create, upload, publish, or distribute illegal content, harmful applications, abusive or harassing content, deceptive content, child exploitation material, privacy-invasive content, impersonation, malware, or content that infringes someone else\'s rights.',
			'You are responsible for making sure you have the rights and permissions needed for prompts, files, images, audio, code, references, and other materials you submit to BuzzPlay.',
		],
	},
	{
		title: 'User Content and Playable Posts',
		body: [
			'BuzzPlay can help generate interactive AI content, apps, games, stories, media experiences, and other playable posts. You are responsible for the content you create, publish, remix, or share.',
			'When you make content public, you allow BuzzPlay and Hekmat Corp to host, display, distribute, promote, and make that public content available to other users as part of the service.',
			'Hekmat Corp may remove content, restrict visibility, disable features, or suspend accounts when content appears to violate these Terms, applicable law, or platform safety requirements.',
		],
	},
	{
		title: 'AI Output and Accuracy',
		body: [
			'AI-generated content may be incomplete, inaccurate, unsafe, or unsuitable for a particular purpose. You should review and test generated content before relying on it or publishing it.',
			'BuzzPlay is provided for creative and productivity assistance. Hekmat Corp does not guarantee that generated content will be error-free, lawful for your intended use, or free of third-party rights issues.',
		],
	},
	{
		title: 'Ownership and License',
		body: [
			'Subject to these Terms and applicable law, you own the content and outputs you create with BuzzPlay. Hekmat Corp retains ownership of BuzzPlay, its software, systems, trademarks, branding, models, infrastructure, and service design.',
			'You grant Hekmat Corp the rights needed to operate BuzzPlay, including storing, processing, displaying, reproducing, and transmitting your content for service delivery, safety, moderation, support, and improvement.',
		],
	},
	{
		title: 'Payments',
		body: [
			'BuzzPlay may offer paid features or subscriptions. Fees, billing terms, renewal terms, cancellation options, and taxes will be shown when you purchase a paid feature. Unless required by law or stated otherwise, payments already made may be non-refundable.',
		],
	},
	{
		title: 'Third-Party Services',
		body: [
			'BuzzPlay may rely on third-party services for authentication, hosting, analytics, payments, AI model access, storage, deployment, and other functionality. Third-party services may have their own terms and privacy practices.',
		],
	},
	{
		title: 'DMCA and Rights Requests',
		body: [
			'Hekmat Corp respects intellectual property rights. If you believe content on BuzzPlay infringes your copyright, trademark, or other rights, contact us with enough detail to investigate the request.',
		],
	},
	{
		title: 'Service Changes and Termination',
		body: [
			'Hekmat Corp may change, suspend, limit, or discontinue parts of BuzzPlay. We may also suspend or terminate access if we believe an account or content violates these Terms or creates legal, security, or safety risk.',
		],
	},
	{
		title: 'Disclaimers and Liability',
		body: [
			'BuzzPlay is provided on an "as is" and "as available" basis. To the maximum extent permitted by law, Hekmat Corp disclaims warranties of merchantability, fitness for a particular purpose, non-infringement, availability, and accuracy.',
			'To the maximum extent permitted by law, Hekmat Corp will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, lost data, or costs of substitute services.',
		],
	},
	{
		title: 'Contact',
		body: [
			`Questions about BuzzPlay or these Terms can be sent to ${SUPPORT_EMAIL}.`,
		],
	},
] as const;

const privacySections = [
	{
		title: 'Scope',
		body: [
			'This Privacy Policy explains how Hekmat Corp collects, uses, shares, protects, and retains information when you use BuzzPlay. It applies to BuzzPlay pages, accounts, creation tools, feeds, published content, and related services that reference this policy.',
		],
	},
	{
		title: 'Information You Provide',
		body: [
			'We collect information you provide directly, such as your name, email address, profile information, prompts, uploaded files, comments, published content, support messages, and account settings.',
			'If you purchase paid features, payment details may be processed by payment providers. BuzzPlay may receive billing status, plan information, and transaction metadata.',
		],
	},
	{
		title: 'Information Collected Automatically',
		body: [
			'We may collect device and usage information such as IP address, browser type, operating system, device identifiers, pages viewed, interaction events, access times, referring URLs, performance data, and error logs.',
			'We may infer approximate location, preferences, or service state from information such as IP address, usage activity, or account metadata.',
		],
	},
	{
		title: 'Information From Third Parties',
		body: [
			'If you sign in through a third-party provider, BuzzPlay may receive account identifiers, email address, display name, avatar, and authentication status from that provider.',
			'Service providers may also give us information needed for fraud prevention, security, analytics, support, payments, or infrastructure operations.',
		],
	},
	{
		title: 'How We Use Information',
		body: [
			'We use information to provide BuzzPlay, authenticate users, generate and deploy interactive content, save projects, publish public posts, personalize feeds, process payments, provide support, communicate with you, improve reliability, and protect users and the service.',
			'We may also use information for safety reviews, moderation, abuse prevention, debugging, analytics, service development, and compliance with law.',
		],
	},
	{
		title: 'AI Processing',
		body: [
			'Prompts, files, project data, generated code, published posts, and other content may be processed by AI systems and infrastructure providers so BuzzPlay can generate, edit, preview, deploy, moderate, and improve interactive content.',
			'You should avoid submitting sensitive personal information unless it is necessary for your use of BuzzPlay.',
		],
	},
	{
		title: 'Public Content',
		body: [
			'When you publish content publicly, information such as the post, title, preview, author profile, comments, likes, view counts, and share links may be visible to other users and visitors.',
		],
	},
	{
		title: 'Sharing',
		body: [
			'We may share information with service providers that help operate BuzzPlay, including hosting, storage, authentication, analytics, payments, AI processing, deployment, customer support, security, and moderation providers.',
			'We may also share information with your consent, to comply with legal obligations, to respond to lawful requests, to protect rights and safety, or as part of a merger, acquisition, financing, reorganization, or transfer of assets.',
		],
	},
	{
		title: 'Security and Retention',
		body: [
			'We use administrative, technical, and organizational measures designed to protect personal information. No online service can guarantee absolute security.',
			'We keep information for as long as needed to provide BuzzPlay, comply with legal obligations, resolve disputes, enforce agreements, prevent abuse, and maintain security. Account removal requests can be sent to support.',
		],
	},
	{
		title: 'Your Choices',
		body: [
			'You may update account information in the product where available. You may contact us to request access, correction, deletion, or other privacy assistance, subject to applicable law and verification requirements.',
		],
	},
	{
		title: 'Third-Party Links',
		body: [
			'BuzzPlay may link to or integrate with third-party services. Their privacy practices are governed by their own policies, not this Privacy Policy.',
		],
	},
	{
		title: 'Contact',
		body: [
			`Questions about privacy or data requests can be sent to ${SUPPORT_EMAIL}.`,
		],
	},
] as const;

function isLegalTab(value: string | null): value is LegalTab {
	return value === 'terms' || value === 'privacy';
}

function SectionList({
	sections,
}: {
	sections: ReadonlyArray<{ title: string; body: readonly string[] }>;
}) {
	return (
		<div className="space-y-8">
			{sections.map((section) => (
				<section key={section.title} className="space-y-3">
					<h2 className="text-xl font-black text-text-primary">
						{section.title}
					</h2>
					{section.body.map((paragraph) => (
						<p key={paragraph} className="text-sm leading-7 text-text-secondary">
							{paragraph.includes(SUPPORT_EMAIL) ? (
								<>
									{paragraph.split(SUPPORT_EMAIL)[0]}
									<a
										href={`mailto:${SUPPORT_EMAIL}`}
										className="font-bold text-text-primary underline"
									>
										{SUPPORT_EMAIL}
									</a>
									{paragraph.split(SUPPORT_EMAIL)[1]}
								</>
							) : (
								paragraph
							)}
						</p>
					))}
				</section>
			))}
		</div>
	);
}

export default function LegalPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const tabParam = searchParams.get('tab');
	const currentTab: LegalTab = isLegalTab(tabParam) ? tabParam : 'terms';

	React.useEffect(() => {
		document.title =
			currentTab === 'terms'
				? 'BuzzPlay Terms of Service'
				: 'BuzzPlay Privacy Policy';
	}, [currentTab]);

	const handleTabChange = (value: string) => {
		if (!isLegalTab(value)) return;
		setSearchParams({ tab: value }, { replace: true });
	};

	return (
		<div className="min-h-full bg-bg-1 px-4 py-8 md:px-8 md:py-10">
			<div className="mx-auto max-w-4xl">
				<Link
					to="/"
					className="mb-6 inline-flex items-center gap-2 rounded-lg border-2 border-[var(--neo-border-color)] bg-bg-4 px-3 py-2 text-sm font-bold text-text-primary shadow-neo-sm transition-all hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] hover:shadow-neo"
				>
					<ArrowLeft className="size-4" />
					Back
				</Link>

				<header className="mb-8">
					<p className="mb-2 text-sm font-black uppercase tracking-wide text-text-tertiary">
						BuzzPlay Legal
					</p>
					<h1 className="text-4xl font-black text-text-primary md:text-5xl">
						Terms and Privacy
					</h1>
					<p className="mt-4 max-w-2xl text-sm leading-7 text-text-secondary">
						BuzzPlay is developed and provided by Hekmat Corp. These policies explain the terms that apply when you sign in and use BuzzPlay, and how information is handled across the service.
					</p>
					<p className="mt-3 text-xs font-bold text-text-tertiary">
						Last updated and effective date: {EFFECTIVE_DATE}
					</p>
				</header>

				<Tabs value={currentTab} onValueChange={handleTabChange} className="gap-5">
					<TabsList className="w-full justify-start overflow-x-auto md:w-fit">
						<TabsTrigger value="terms" className="min-w-32">
							Terms of Service
						</TabsTrigger>
						<TabsTrigger value="privacy" className="min-w-32">
							Privacy Policy
						</TabsTrigger>
					</TabsList>

					<div className="rounded-xl border-3 border-[var(--neo-border-color)] bg-bg-4 p-5 shadow-neo-lg md:p-8">
						<TabsContent
							value="terms"
							className={cn(currentTab !== 'terms' && 'hidden')}
						>
							<SectionList sections={termsSections} />
						</TabsContent>
						<TabsContent
							value="privacy"
							className={cn(currentTab !== 'privacy' && 'hidden')}
						>
							<SectionList sections={privacySections} />
						</TabsContent>
					</div>
				</Tabs>
			</div>
		</div>
	);
}
