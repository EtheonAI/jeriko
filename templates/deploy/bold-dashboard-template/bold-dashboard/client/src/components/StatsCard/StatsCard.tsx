/*
 * TEMPLATE COMPONENT - REQUIRES CUSTOMIZATION
 * 
 * This is a template individual stats card component for displaying single KPIs. Before using:
 * 1. Update the data type to match your actual metric structure
 * 2. Modify the title and value fields to match your KPIs
 * 3. Optionally provide diff, period, and comparedTo fields as needed
 * 4. Adjust the diff calculation and coloring logic if needed
 * 5. Ensure your data provides meaningful titles and values
 * 
 * DO NOT use this component as-is without customizing the data and comparison text!
 */

import { Badge, Group, PaperProps, Text } from '@mantine/core';
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react';

import classes from './Stats.module.css';

import { Surface } from '@/components';

type StatsCardProps = {
  // TODO: Update this data structure to match your actual metric
  data: { 
    title: string; 
    value: string; 
    diff?: number; 
    period?: string;
    comparedTo?: string; // Optional custom comparison text
  }; // TEMPLATE DATA STRUCTURE - CUSTOMIZE FOR YOUR KPI
} & PaperProps;

const StatsCard = ({ data, ...others }: StatsCardProps) => {
  const { title, value, period, diff, comparedTo } = data;
  const DiffIcon = diff !== undefined && diff > 0 ? IconArrowUpRight : IconArrowDownRight;

  return (
    <Surface {...others}>
      <Group justify="space-between">
        <Text size="xs" className={classes.title}>
          {title}
        </Text>
        {period && (
          <Badge variant="filled" radius="sm">
            {period}
          </Badge>
        )}
      </Group>

      <Group align="flex-end" gap="xs" mt={25}>
        <Text className={classes.value}>{value}</Text>
        {diff !== undefined && (
          <Text
            c={diff > 0 ? 'teal' : 'red'}
            fz="sm"
            fw={500}
            className={classes.diff}
          >
            <span>{diff}%</span>
            <DiffIcon size="1rem" stroke={1.5} />
          </Text>
        )}
      </Group>

      {comparedTo && (
        <Text fz="xs" mt={7}>
          {comparedTo}
        </Text>
      )}
    </Surface>
  );
};

export default StatsCard;
