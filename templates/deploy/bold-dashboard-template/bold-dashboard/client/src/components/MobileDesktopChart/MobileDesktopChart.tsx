'use client';

/*
 * TEMPLATE COMPONENT - REQUIRES CUSTOMIZATION
 * 
 * This is a template bar chart component. Before using:
 * 1. Update the series data with your actual dataset values
 * 2. Change category names and x-axis labels to match your data
 * 3. Update the chart title to reflect what you're visualizing
 * 4. Adjust colors if needed to match your theme
 * 
 * DO NOT use this component as-is without customizing the data!
 */

import React, { useState } from 'react';

import {
  Group,
  PaperProps,
  Text,
  useMantineColorScheme,
  useMantineTheme,
} from '@mantine/core';
import { lazy, Suspense } from 'react';

import { Surface } from '@/components';

const Chart = lazy(() => import('react-apexcharts'));

type MobileDesktopChartProps = PaperProps;
const MobileDesktopChart = ({ ...others }: MobileDesktopChartProps) => {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();

  // Configuration constants
  const CATEGORY_NUM = 2;
  const TIME_PERIODS_NUM = 7;
  
  // Configurable category names
  const CATEGORY_NAMES = ['Mobile', 'Desktop']; // TODO: Replace with actual category names
  
  // Configurable time period labels
  const TIME_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']; // TODO: Replace with actual time periods
  
  // Configurable chart title
  const CHART_TITLE = 'Mobile vs Desktop Traffic'; // TODO: Replace with meaningful title for your data
  
  // TEMPLATE DATA - MUST BE CUSTOMIZED FOR YOUR USE CASE
  const DATA_SETS = [
    [44, 55, 41, 67, 22, 43, 34], // Mobile data - TODO: Replace with actual data values
    [13, 23, 20, 8, 13, 27, 10],  // Desktop data - TODO: Replace with actual data values
  ];

   // DO NOT REMOVE THE useState hook
  // Alternative: const chartOptions = useMemo(() => {...}, [])
  const [state] = useState({
    series: Array.from({ length: CATEGORY_NUM }, (_, i) => ({
      name: CATEGORY_NAMES[i] || `Category ${i + 1}`,
      data: DATA_SETS[i] || Array(TIME_PERIODS_NUM).fill(0),
    })),
    options: {
      chart: {
        type: 'bar' as const,
        stacked: true,
        toolbar: {
          show: true,
        },
        zoom: {
          enabled: true,
        },
        fontFamily: 'Open Sans, sans-serif',
        redrawOnParentResize: true,
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 400,
          animateGradually: {
            enabled: true,
            delay: 50
          },
          dynamicAnimation: {
            enabled: true,
            speed: 350
          }
        },
      },
      dataLabels: {
        enabled: false,
      },
      plotOptions: {
        bar: {
          horizontal: false,
          borderRadius: 4,
          columnWidth: '25%',
          dataLabels: {
            total: {
              enabled: false,
              style: {
                fontSize: '13px',
                fontWeight: 900,
              },
            },
          },
        },
      },
      xaxis: {
        categories: TIME_LABELS,
        labels: {
          style: {
            colors: colorScheme === 'dark' ? theme.white : theme.black,
          },
        },
      },
      yaxis: {
        labels: {
          style: {
            colors: colorScheme === 'dark' ? theme.white : theme.black,
          },
        },
      },
      colors: Array.from({ length: CATEGORY_NUM }, (_, i) => {
        const shades = [8, 2, 6, 4, 9, 1];
        return theme.colors[theme.primaryColor][shades[i] || 5];
      }),
      legend: {
        labels: {
          colors: [colorScheme === 'dark' ? theme.white : theme.black],
        },
      },
    },
  });

  return (
    <Surface {...others}>
      <Group mb="md">
        <Text size="lg" fw={600}>
          {CHART_TITLE}
        </Text>
      </Group>
      <div>
        <Suspense fallback={<div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text size="sm" c="dimmed">Loading chart...</Text></div>}>
          {/*@ts-ignore*/}
          <Chart 
            options={state.options} 
            series={state.series} 
            type="bar" 
            height={350} 
            width={'100%'}
          />
        </Suspense>
      </div>
    </Surface>
  );
};

export default MobileDesktopChart;
