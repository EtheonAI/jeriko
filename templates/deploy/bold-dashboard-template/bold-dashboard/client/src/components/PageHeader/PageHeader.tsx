'use client';

import {
  Breadcrumbs,
  BreadcrumbsProps,
  Divider,
  Flex,
  Stack,
  Text,
  Title,
  rem,
  useMantineTheme,
} from '@mantine/core';
import { useColorScheme } from '@mantine/hooks';

type PageHeaderProps = {
  title: string;
  withActions?: boolean;
  breadcrumbItems?: any;
  actionButton?: React.ReactNode;
  actionContent?: React.ReactNode;
};

const PageHeader = (props: PageHeaderProps) => {
  const {
    withActions,
    breadcrumbItems,
    title,
    actionButton,
    actionContent,
  } = props;

  const theme = useMantineTheme();
  const colorScheme = useColorScheme();

  const BREADCRUMBS_PROPS: Omit<BreadcrumbsProps, 'children'> = {
    style: {
      a: {
        padding: rem(8),
        borderRadius: theme.radius.sm,
        fontWeight: 500,
        color: colorScheme === 'dark' ? theme.white : theme.black,

        '&:hover': {
          transition: 'all ease 150ms',
          backgroundColor:
            colorScheme === 'dark'
              ? theme.colors.dark[5]
              : theme.colors.gray[2],
          textDecoration: 'none',
        },
      },
    },
  };

  const renderActions = () => {
    // Custom action content takes precedence
    if (actionContent) {
      return actionContent;
    }

    // Custom action button
    if (actionButton) {
      return actionButton;
    }

    // Default actions for the dashboard view
    if (withActions) {
      return null;
    }

    return null;
  };

  return (
    <>
      <div style={{ paddingTop: '1rem', paddingBottom: '1rem' }}>
        {withActions ? (
          <Flex
            justify="space-between"
            direction={{ base: 'column', sm: 'row' }}
            gap={{ base: 'sm', sm: 4 }}
          >
            <Stack gap={4}>
              <Title order={3}>{title}</Title>
              <Text>Welcome back!</Text>
            </Stack>
            {renderActions()}
          </Flex>
        ) : (
          <Flex
            align="center"
            justify="space-between"
            direction={{ base: 'row', sm: 'row' }}
            gap={{ base: 'sm', sm: 4 }}
          >
            <Stack>
              <Title order={3}>{title}</Title>
              {breadcrumbItems && (
                <Breadcrumbs {...BREADCRUMBS_PROPS}>
                  {breadcrumbItems}
                </Breadcrumbs>
              )}
            </Stack>
            {renderActions()}
          </Flex>
        )}
      </div>
      <Divider />
    </>
  );
};

export default PageHeader;
