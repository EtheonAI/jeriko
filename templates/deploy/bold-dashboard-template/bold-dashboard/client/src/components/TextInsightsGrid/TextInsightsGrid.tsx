/*
 * TEMPLATE COMPONENT - REQUIRES CUSTOMIZATION
 * 
 * This is a template text insights grid component. Before using:
 * 1. Update the data type to match your actual insights structure
 * 2. Modify the category, title, and description fields to match your insights
 * 3. Update the error message to reflect your context
 * 4. Grid layout automatically adjusts (1-4 cols based on insights count)
 * 5. Ensure your data provides meaningful insights content
 * 
 * DO NOT use this component as-is without customizing the data structure!
 */

import { ReactNode } from 'react';

import {
  Group,
  PaperProps,
  SimpleGrid,
  Skeleton,
  Text,
} from '@mantine/core';

import classes from './TextInsightsGrid.module.css';

import { ErrorAlert, Surface } from '@/components';

type TextInsight = {
  id: number;
  category: string;
  title: string;
  description: string;
};

type TextInsightsGridProps = {
  // TODO: Update this data structure to match your actual insights
  data?: TextInsight[]; // TEMPLATE DATA STRUCTURE - CUSTOMIZE FOR YOUR INSIGHTS
  paperProps?: PaperProps;
  error?: ReactNode;
  loading?: boolean;
};

const TextInsightsGrid = ({
  data,
  loading,
  error,
  paperProps,
}: TextInsightsGridProps) => {
  const insights = data || [];
  
  // Calculate optimal columns: min 1, max 4, based on number of insights
  const getOptimalColumns = (count: number) => {
    return Math.min(Math.max(count, 1), 4);
  };
  
  // For loading state, show 3 skeletons as default, otherwise use actual data count
  const optimalCols = loading ? 3 : getOptimalColumns(insights.length);

  const insightCards = insights?.map((insight) => (
    <Surface key={insight.id} {...paperProps}>
      <Group justify="space-between" mb="md">
        <Text size="xs" c="dimmed" className={classes.category}>
          {insight.category}
        </Text>
      </Group>
      <Text className={classes.insightTitle} mb="xs">
        {insight.title}
      </Text>
      <Text size="sm" c="dimmed" className={classes.description}>
        {insight.description}
      </Text>
    </Surface>
  ));

  return (
    <div className={classes.root}>
      {error ? (
        <ErrorAlert title="ERROR_TITLE_REPLACE_ME" message={error.toString()} />
      ) : (
        <SimpleGrid
          cols={{ base: 1, sm: Math.min(optimalCols, 2), md: optimalCols }}
          spacing={{ base: 10, sm: 'xl' }}
          verticalSpacing={{ base: 'md', sm: 'xl' }}
        >
          {loading
            ? Array.from({ length: optimalCols }).map((_, i) => (
                <Skeleton
                  key={`insight-loading-${i}`}
                  visible={true}
                  height={150}
                />
              ))
            : insightCards}
        </SimpleGrid>
      )}
    </div>
  );
};

export default TextInsightsGrid;