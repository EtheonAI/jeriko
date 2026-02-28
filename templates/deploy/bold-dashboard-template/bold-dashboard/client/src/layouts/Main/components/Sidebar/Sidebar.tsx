import React from 'react';
import { ActionIcon, Box, Flex, Group, ScrollArea, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconX } from '@tabler/icons-react';

import { Logo } from '@/components';
import { SIDEBAR_LINKS } from '@/constants/sidebar-links';
import { useSidebarConfig } from '@/contexts/theme-customizer';
import { useResponsiveSidebar } from '@/hooks/useResponsiveSidebar';

import { LinksGroup } from '../NavLinks';
import classes from './Sidebar.module.css';

type NavigationProps = {
  onClose: () => void;
  showCloseButton?: boolean;
};

const SidebarNav = ({ onClose, showCloseButton = false }: NavigationProps) => {
  const tablet_match = useMediaQuery('(max-width: 768px)');
  const sidebarConfig = useSidebarConfig();
  
  // Use responsive sidebar hook
  const responsiveSidebar = useResponsiveSidebar({
    minWidth: 160, // Increased to accommodate active button state
    maxWidth: 400,
    defaultWidth: 220, // Default overridden by CSS variable
    autoCollapse: true,
    storageKey: 'sidebar-width',
  });
  const links = SIDEBAR_LINKS.map((m) => (
    <Box key={m.title} pl={0} mb="lg">
      {!responsiveSidebar.isMini && (
        <Text
          tt="uppercase"
          size="xs"
          fw={500}
          mb="md"
          className={classes.linkHeader}
        >
          {m.title}
        </Text>
      )}
      {m.links.map((item) => (
        <LinksGroup
          key={item.label}
          {...item}
          isMini={responsiveSidebar.isMini}
          isHydrated={responsiveSidebar.isHydrated}
          closeSidebar={() => {
            setTimeout(() => {
              onClose();
            }, 250);
          }}
        />
      ))}
    </Box>
  ));

  // Determine close button color based on sidebar variant
  const getCloseButtonColor = () => {
    if (sidebarConfig.variant === 'colored') {
      return 'white';
    }
    return undefined; // Use default color
  };



  return (
    <div
      className={classes.navbar}
      data-variant={sidebarConfig.variant}
      data-position={sidebarConfig.position}
      data-resizable-sidebar
      style={{ position: 'relative' }}
    >
      <div className={classes.header}>
        <Flex justify="space-between" align="center" gap="sm">
          <Group
            justify="space-between"
            style={{ flex: tablet_match ? 'auto' : 1 }}
          >
            <Logo className={classes.logo} showText={true} />
          </Group>
          {showCloseButton && (
            <ActionIcon onClick={onClose} variant="transparent" size="sm">
              <IconX color={getCloseButtonColor()} size={18} />
            </ActionIcon>
          )}
        </Flex>
      </div>

      <ScrollArea className={classes.links}>
        <div className={classes.linksInner}>{links}</div>
      </ScrollArea>


    </div>
  );
};

export default SidebarNav;
