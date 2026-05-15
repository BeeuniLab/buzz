import React from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TimePeriod, AppSortOption } from '@/api-types';
import { useAppI18n } from '@/i18n';

interface AppFiltersFormProps {
  // Search props
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  searchPlaceholder?: string;
  showSearchButton?: boolean;

  // Framework filter props
  filterFramework: string;
  onFrameworkChange: (framework: string) => void;

  // Visibility filter props (optional - only for user apps)
  filterVisibility?: string;
  onVisibilityChange?: (visibility: string) => void;
  showVisibility?: boolean;

  // Time period props (conditional)
  period?: TimePeriod;
  onPeriodChange?: (period: TimePeriod) => void;
  sortBy?: AppSortOption;

  // Layout props
  className?: string;
}


export const AppFiltersForm: React.FC<AppFiltersFormProps> = ({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = 'Search apps...',
  showSearchButton = false,
  className = ''
}) => {
  const { t } = useAppI18n();

  return (
    <div className={`max-w-4xl mb-8 ${className}`}>
      <form onSubmit={onSearchSubmit} className="flex gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <Input
            type="text"
            placeholder={t(searchPlaceholder)}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 bg-bg-4 w-90"
          />
        </div>
        

        {showSearchButton && (
          <Button type="submit">
            {t('Search')}
          </Button>
        )}
      </form>
    </div>
  );
};
