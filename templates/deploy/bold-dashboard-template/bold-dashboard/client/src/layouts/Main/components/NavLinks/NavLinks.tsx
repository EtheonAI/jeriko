import { useEffect, useMemo, useState } from 'react';

import {
  Box,
  Collapse,
  Group,
  Menu,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronRight } from '@tabler/icons-react';
import * as _ from 'lodash';
import { useLocation, useRouter } from 'wouter';

import classes from './NavLinks.module.css';

interface LinksGroupProps {
  icon?: any;
  label: string;
  initiallyOpened?: boolean;
  link?: string;
  links?: {
    label: string;
    link: string;
  }[];
  closeSidebar: () => void;
  isMini?: boolean;
  isHydrated?: boolean;
}

export function LinksGroup(props: LinksGroupProps) {
  const {
    icon: Icon,
    label,
    initiallyOpened,
    link,
    links,
    closeSidebar,
    isMini,
    isHydrated = true, // Default to true for backward compatibility
  } = props;
  const [, setLocation] = useLocation();
  const [pathname] = useLocation();
  const hasLinks = Array.isArray(links);
  const [opened, setOpened] = useState(initiallyOpened || false);
  const [currentPath, setCurrentPath] = useState<string | undefined>();
  const ChevronIcon = IconChevronRight;
  const tablet_match = useMediaQuery('(max-width: 768px)');

  const LinkItem = ({ link }: { link: { label: string; link: string } }) => {
    return (
      <Text
        className={classes.link}
        onClick={() => {
          setLocation(link.link);
          // Only close sidebar on mobile screens or when in overlay mode
          if (tablet_match) {
            closeSidebar();
          }
        }}
        data-active={link.link.toLowerCase() === pathname || undefined}
        data-mini={isMini}
      >
        {link.label}
      </Text>
    );
  };

  const items = (hasLinks ? links : []).map((link) =>
    // Only use mini mode after hydration to prevent hydration mismatches
    isHydrated && isMini ? (
      <Menu.Item key={`menu-${link.label}`}>
        <LinkItem link={link} />
      </Menu.Item>
    ) : (
      <LinkItem key={link.label} link={link} />
    ),
  );

  const handleMainButtonClick = () => {
    if (hasLinks) {
      // If it has nested links, just toggle the collapse
      setOpened((o) => !o);
    } else if (link) {
      // If it's a direct link, navigate and close sidebar only on mobile
      setLocation(link);
      if (tablet_match) {
        closeSidebar();
      }
    }
  };

  // Check if current route matches this link or any of its nested links
  const isActive = useMemo(() => {
    if (link && pathname === link) {
      return true;
    }
    if (hasLinks && links) {
      return links.some(subLink => pathname === subLink.link);
    }
    return false;
  }, [link, pathname, hasLinks, links]);

  const handleMiniButtonClick = (evt: React.MouseEvent) => {
    evt.preventDefault();
    if (hasLinks) {
      // For mini mode with nested links, just toggle
      setOpened((o) => !o);
    } else if (link) {
      // For mini mode with direct link, navigate and close only on mobile
      setLocation(link);
      if (tablet_match) {
        closeSidebar();
      }
    }
  };

  const content: React.ReactElement = useMemo(() => {
    let view: React.ReactElement;
    // Only use mini mode after hydration to prevent hydration mismatches
    if (isHydrated && isMini) {
      view = (
        <>
          <Menu
            position="right-start"
            withArrow
            arrowPosition="center"
            trigger="hover"
            openDelay={100}
            closeDelay={400}
          >
            <Menu.Target>
              <UnstyledButton
                onClick={handleMiniButtonClick}
                className={classes.control}
                data-active={isActive || undefined}
                data-mini={isMini}
              >
                <Tooltip
                  label={label}
                  position="right"
                  transitionProps={{ duration: 0 }}
                >
                  <Icon size={24} />
                </Tooltip>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>{items}</Menu.Dropdown>
          </Menu>
        </>
      );
    } else {
      view = (
        <>
          <UnstyledButton
            onClick={handleMainButtonClick}
            className={classes.control}
            data-active={isActive || undefined}
            data-mini={isMini}
          >
            <Group justify="space-between" gap={0}>
              <Box style={{ display: 'flex', alignItems: 'center' }}>
                <Icon size={18} />
                {!isMini && <Box ml="md">{label}</Box>}
              </Box>
              {hasLinks && (
                <ChevronIcon
                  className={classes.chevron}
                  size="1rem"
                  stroke={1.5}
                  style={{
                    transform: opened ? `rotate(90deg)` : 'none',
                  }}
                />
              )}
            </Group>
          </UnstyledButton>
          {hasLinks ? (
            <Collapse in={opened} className={classes.linksInner}>
              {items}
            </Collapse>
          ) : null}
        </>
      );
    }

    return view;
  }, [
    ChevronIcon,
    Icon,
    hasLinks,
    isMini,
    isHydrated,
    items,
    label,
    link,
    opened,
    handleMainButtonClick,
    handleMiniButtonClick,
  ]);

  useEffect(() => {
    const paths = pathname.split('/');
    // Auto-open navigation groups when a nested link is active
    if (isActive) {
      setOpened(true);
    }
    setCurrentPath(_.last(paths)?.toLowerCase() || undefined);
  }, [pathname, label, isActive]);

  return <>{content}</>;
}