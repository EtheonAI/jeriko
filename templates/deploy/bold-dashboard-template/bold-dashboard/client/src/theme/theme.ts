import { MantineTheme, createTheme, rem } from '@mantine/core';

export const createDynamicTheme = (config: {
  primaryColor: string;
  borderRadius: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  compact: boolean;
}): Partial<MantineTheme> | any => {
  const spacingScale = config.compact ? 0.8 : 1;

  return createTheme({
    primaryColor: config.primaryColor,
    fontFamily: 'Open Sans, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
    fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    spacing: {
      xs: rem(8 * spacingScale),
      sm: rem(12 * spacingScale),
      md: rem(16 * spacingScale),
      lg: rem(20 * spacingScale),
      xl: rem(24 * spacingScale),
    },
    radius: {
      xs: rem(config.borderRadius === 'xs' ? 2 : 4),
      sm: rem(config.borderRadius === 'sm' ? 4 : config.borderRadius === 'xs' ? 2 : 6),
      md: rem(config.borderRadius === 'xs' ? 4 : config.borderRadius === 'sm' ? 6 : config.borderRadius === 'md' ? 8 : config.borderRadius === 'lg' ? 12 : 16),
      lg: rem(config.borderRadius === 'xs' ? 6 : config.borderRadius === 'sm' ? 8 : config.borderRadius === 'md' ? 12 : config.borderRadius === 'lg' ? 16 : 20),
      xl: rem(config.borderRadius === 'xs' ? 8 : config.borderRadius === 'sm' ? 12 : config.borderRadius === 'md' ? 16 : config.borderRadius === 'lg' ? 20 : 24),
    },
    fontSizes: {
      xs: rem(10 * spacingScale),
      sm: rem(12 * spacingScale),
      md: rem(14 * spacingScale),
      lg: rem(16 * spacingScale),
      xl: rem(18 * spacingScale),
    },
    components: {
      Button: {
        defaultProps: { radius: config.borderRadius },
      },
      Card: {
        defaultProps: { radius: config.borderRadius, padding: config.compact ? 'sm' : 'md' },
      },
      Paper: {
        defaultProps: { radius: config.borderRadius },
      },
    },
  });
};

export const myTheme = createDynamicTheme({
  primaryColor: 'blue',
  borderRadius: 'sm',
  compact: false,
});

