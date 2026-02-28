/*
 * TEMPLATE COMPONENT - REQUIRES CUSTOMIZATION
 * 
 * This is a template stats grid component for displaying KPI summaries. Before using:
 * 1. Update the data type to match your actual metrics structure
 * 2. Modify the title, value, diff, and period fields to match your KPIs
 * 3. Update the error message to reflect your context
 * 4. Adjust the grid layout if needed (cols, spacing)
 * 5. Ensure your data provides meaningful titles and values
 * 
 * DO NOT use this component as-is without customizing the data structure!
 */

import { ReactNode } from 'react';

import { PaperProps, SimpleGrid, Skeleton } from '@mantine/core';

import classes from './StatsGrid.module.css';

import { ErrorAlert } from '@/components';
import StatsCard from '@/components/StatsCard/StatsCard';

type StatsGridProps = {
  // TODO: Update this data structure to match your actual KPI metrics
  data?: { title: string; value: string; diff: number; period?: string }[]; // TEMPLATE DATA STRUCTURE - CUSTOMIZE FOR YOUR METRICS
  paperProps?: PaperProps;
  error?: ReactNode;
  loading?: boolean;
};

export default function StatsGrid({
  data,
  loading,
  error,
  paperProps,
}: StatsGridProps) {
  const stats = data?.map((stat) => (
    <StatsCard key={stat.title} data={stat} {...paperProps} />
  ));

  return (
    <div className={classes.root}>
      {error ? (
        <ErrorAlert title="ERROR_TITLE_REPLACE_ME" message={error.toString()} />
      ) : (
        <SimpleGrid
          cols={{ base: 1, sm: 2, lg: 4 }}
          spacing={{ base: 10, sm: 'xl' }}
          verticalSpacing={{ base: 'md', sm: 'xl' }}
        >
          {loading
            ? Array.from({ length: 4 }).map((o, i) => (
                <Skeleton
                  key={`stats-loading-${i}`}
                  visible={true}
                  height={200}
                />
              ))
            : stats}
        </SimpleGrid>
      )}
    </div>
  );
}
