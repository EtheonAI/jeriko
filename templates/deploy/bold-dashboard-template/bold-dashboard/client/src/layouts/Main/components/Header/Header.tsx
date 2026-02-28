'use client';

import {
  ActionIcon,
  Group,
  TextInput,
  Tooltip,
  rem,
  useMantineColorScheme,
  useMantineTheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconMenu2 } from '@tabler/icons-react';

import { HeaderVariant, useSidebarConfig } from '@/contexts/theme-customizer';

const ICON_SIZE = 20;

type HeaderNavProps = {
  mobileOpened?: boolean;
  toggleMobile?: () => void;
  sidebarVisible: boolean;
  onSidebarToggle: () => void;
  onSidebarShow?: () => void;
  headerVariant: HeaderVariant;
};

const HeaderNav = (props: HeaderNavProps) => {
  const {
    toggleMobile,
    mobileOpened,
    headerVariant,
    sidebarVisible,
    onSidebarToggle,
    onSidebarShow,
  } = props;
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const tablet_match = useMediaQuery('(max-width: 768px)');
  const mobile_match = useMediaQuery('(max-width: 640px)');
  const sidebarConfig = useSidebarConfig();

  // Determine text color based on header variant
  const getTextColor = () => {
    if (headerVariant === 'colored') {
      return 'white';
    }
    return undefined; // Use default theme colors
  };

  const textColor = getTextColor();

  const handleSidebarToggle = () => {
    if (mobile_match) {
      // Mobile: toggle mobile menu
      toggleMobile?.();
    } else if (sidebarConfig.overlay && !sidebarVisible) {
      // Desktop overlay mode: show sidebar if hidden
      onSidebarShow?.();
    } else {
      // Normal mode or overlay mode with visible sidebar: toggle
      onSidebarToggle();
    }
  };

  const getSidebarToggleIcon = () => {
    if (mobile_match) {
      // For mobile, we need to manually create the burger lines to avoid nested buttons
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '18px', height: '18px', position: 'relative', justifyContent: 'center' }}>
          <div style={{ 
            width: '100%', 
            height: '2px', 
            backgroundColor: textColor || 'currentColor',
            transition: 'all 0.3s ease',
            transform: mobileOpened ? 'rotate(45deg)' : 'none',
            position: 'absolute',
            top: '50%',
            transformOrigin: 'center'
          }} />
          <div style={{ 
            width: '100%', 
            height: '2px', 
            backgroundColor: textColor || 'currentColor',
            transition: 'all 0.3s ease',
            opacity: mobileOpened ? 0 : 1,
            position: 'absolute',
            top: '50%'
          }} />
          <div style={{ 
            width: '100%', 
            height: '2px', 
            backgroundColor: textColor || 'currentColor',
            transition: 'all 0.3s ease',
            transform: mobileOpened ? 'rotate(-45deg)' : 'none',
            position: 'absolute',
            top: '50%',
            transformOrigin: 'center'
          }} />
        </div>
      );
    }

    // Desktop: use menu icon for overlay mode or when sidebar is hidden
    if (sidebarConfig.overlay || !sidebarVisible) {
      return <IconMenu2 size={ICON_SIZE} color={textColor} />;
    }

    // For desktop sidebar toggle, also use manual burger to avoid nested buttons
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '18px', height: '18px', position: 'relative', justifyContent: 'center' }}>
        <div style={{ 
          width: '100%', 
          height: '2px', 
          backgroundColor: textColor || 'currentColor',
          transition: 'all 0.3s ease',
          transform: sidebarVisible ? 'rotate(45deg)' : 'none',
          position: 'absolute',
          top: '50%',
          transformOrigin: 'center'
        }} />
        <div style={{ 
          width: '100%', 
          height: '2px', 
          backgroundColor: textColor || 'currentColor',
          transition: 'all 0.3s ease',
          opacity: sidebarVisible ? 0 : 1,
          position: 'absolute',
          top: '50%'
        }} />
        <div style={{ 
          width: '100%', 
          height: '2px', 
          backgroundColor: textColor || 'currentColor',
          transition: 'all 0.3s ease',
          transform: sidebarVisible ? 'rotate(-45deg)' : 'none',
          position: 'absolute',
          top: '50%',
          transformOrigin: 'center'
        }} />
      </div>
    );
  };

  const getSidebarToggleTooltip = () => {
    if (mobile_match) return 'Toggle menu';
    if (!sidebarVisible) return 'Show sidebar';
    return 'Hide sidebar';
  };

    return (
    <Group justify="space-between">
      <Group gap={0}>
        <Tooltip label={getSidebarToggleTooltip()}>
          <ActionIcon
            onClick={handleSidebarToggle}
            variant={headerVariant === 'colored' ? 'transparent' : 'default'}
            size="lg"
            radius="sm"
            style={{ overflow: 'visible' }}
          >
            {getSidebarToggleIcon()}
          </ActionIcon>
        </Tooltip>


      </Group>
      <Group>
      </Group>
    </Group>
  );
};

export default HeaderNav;
