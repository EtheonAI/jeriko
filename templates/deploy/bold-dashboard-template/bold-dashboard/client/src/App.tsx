import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';
import 'mantine-datatable/styles.layer.css';
import './styles/globals.css';
import './index.css';

import { useMemo, useEffect } from 'react';
import { MantineProvider, MantineTheme, ColorSchemeScript } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { Route, Switch } from 'wouter';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeCustomizerProvider, useThemeCustomizer, COLOR_SCHEMES } from './contexts/theme-customizer';
import { MainLayout } from './layouts/Main';
import { createDynamicTheme } from './theme';
import Dashboard from './pages/Dashboard';
import RawDataPage from './pages/RawData';
import NotFound from './pages/NotFound';

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { config } = useThemeCustomizer();

  const dynamicTheme: MantineTheme = useMemo(() => {
    return createDynamicTheme({
      primaryColor: config.appearance.primaryColor,
      borderRadius: config.appearance.borderRadius,
      compact: config.appearance.compact,
    });
  }, [
    config.appearance.primaryColor,
    config.appearance.borderRadius,
    config.appearance.compact,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    const primaryColor = COLOR_SCHEMES[config.appearance.primaryColor];
    root.style.setProperty('--theme-primary-color', primaryColor.color);

    const radiusMap = {
      xs: '0.125rem',
      sm: '0.25rem',
      md: '0.5rem',
      lg: '0.75rem',
      xl: '1rem',
    };
    root.style.setProperty('--theme-border-radius', radiusMap[config.appearance.borderRadius]);

    const spacingScale = config.appearance.compact ? '0.8' : '1';
    root.style.setProperty('--theme-spacing-scale', spacingScale);
    root.style.setProperty('--theme-compact', config.appearance.compact ? '1' : '0');

    root.style.setProperty('--sidebar-width', `${config.layout.sidebar.width}px`);
    root.style.setProperty('--header-height', `${config.layout.header.height}px`);
  }, [config]);

  return (
    <MantineProvider theme={dynamicTheme} defaultColorScheme={config.appearance.colorScheme}>
      <DatesProvider settings={{ firstDayOfWeek: 0, weekendDays: [0], timezone: 'UTC' }}>
        <Notifications position="bottom-right" zIndex={1000} />
        <ModalsProvider>
          <MainLayout>{children}</MainLayout>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/raw-data" component={RawDataPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeCustomizerProvider>
        <ThemeProvider>
          <Router />
        </ThemeProvider>
      </ThemeCustomizerProvider>
    </ErrorBoundary>
  );
}

export default App;

