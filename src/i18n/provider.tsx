import React from 'react';
import { I18nProvider } from '@lingui/react';
import { setupI18n } from '@lingui/core';
import {
	DEFAULT_LOCALE,
	type AppLocale,
	isAppLocale,
	messages,
} from './catalogs';

const STORAGE_KEY = 'buzzplay-locale';

const i18n = setupI18n({
	locale: DEFAULT_LOCALE,
	messages: {
		[DEFAULT_LOCALE]: messages[DEFAULT_LOCALE],
	},
});

type AppI18nContextValue = {
	locale: AppLocale;
	setLocale: (locale: AppLocale) => void;
	t: (id: string, values?: Record<string, unknown>) => string;
};

const AppI18nContext = React.createContext<AppI18nContextValue | null>(null);

function getInitialLocale(): AppLocale {
	if (typeof window === 'undefined') return DEFAULT_LOCALE;

	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (isAppLocale(stored)) return stored;

	const browserLocales = [window.navigator.language, ...window.navigator.languages];
	const prefersChinese = browserLocales.some((locale) => locale.toLowerCase().startsWith('zh'));
	return prefersChinese ? 'zh-CN' : DEFAULT_LOCALE;
}

function activateLocale(locale: AppLocale) {
	i18n.load(locale, messages[locale]);
	i18n.activate(locale);
	if (typeof document !== 'undefined') {
		document.documentElement.lang = locale;
	}
}

export function AppI18nProvider({ children }: { children: React.ReactNode }) {
	const [locale, setLocaleState] = React.useState<AppLocale>(() => {
		const initialLocale = getInitialLocale();
		activateLocale(initialLocale);
		return initialLocale;
	});

	React.useEffect(() => {
		window.localStorage.setItem(STORAGE_KEY, locale);
	}, [locale]);

	const setLocale = React.useCallback((nextLocale: AppLocale) => {
		activateLocale(nextLocale);
		setLocaleState(nextLocale);
	}, []);

	const value = React.useMemo<AppI18nContextValue>(() => ({
		locale,
		setLocale,
		t: (id, values) => i18n._(id, values),
	}), [locale, setLocale]);

	return (
		<AppI18nContext.Provider value={value}>
			<I18nProvider i18n={i18n}>
				{children}
			</I18nProvider>
		</AppI18nContext.Provider>
	);
}

export function useAppI18n() {
	const context = React.useContext(AppI18nContext);
	if (!context) {
		throw new Error('useAppI18n must be used within AppI18nProvider');
	}
	return context;
}
