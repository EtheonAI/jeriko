import { Group, Text } from '@mantine/core';

const FooterNav = () => {
  return (
    <Group justify="space-between">
      <Text size="sm" c="dimmed">
        Made by Manus
      </Text>
      <Text size="sm" c="dimmed">
        &copy;&nbsp;{new Date().getFullYear()}
      </Text>
    </Group>
  );
};

export default FooterNav;
