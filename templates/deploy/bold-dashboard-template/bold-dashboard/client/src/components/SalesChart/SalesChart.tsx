'use client';

/*
 * TEMPLATE COMPONENT - REQUIRES CUSTOMIZATION
 * 
 * This is a template donut chart component. Before using:
 * 1. Update the series data with your actual values
 * 2. Modify the data source (currently loads from /mocks/Sales.json)
 * 3. Update the chart title and DataTable columns
 * 4. Ensure the data structure matches your dataset
 * 
 * DO NOT use this component as-is without customizing the data!
 */

import React from 'react';

import {
  Group,
  PaperProps,
  Text,
  useMantineColorScheme,
  useMantineTheme,
} from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { lazy, Suspense } from 'react';
import { ErrorAlert, Surface } from '@/components';
import { useFetchData } from '@/hooks';

const Chart = lazy(() => import('react-apexcharts'));

type SalesChartProps = PaperProps;

const SalesChart = ({ ...others }: SalesChartProps) => {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  
  const CATEGORY_NUM = 4;
  
  // Configurable chart title
  const CHART_TITLE = 'Sales Overview'; // TODO: Replace with meaningful title for your data
  
  const {
    data: salesData,
    error: salesError,
    loading: salesLoading,
  } = useFetchData('/mocks/Sales.json');

  // Generate series data dynamically from the first CATEGORY_NUM items
  // with NO fallback data
  const series = salesData?.length ? 
    salesData.slice(0, CATEGORY_NUM).map((item: any) => Math.max(item.value || 0, 0.1)) : [];

  const options: any = {
    chart: { 
      type: 'donut' as const, 
      fontFamily: 'Open Sans, sans-serif',
      redrawOnParentResize: true,
      redrawOnWindowResize: true,
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
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: { enabled: false },
    states: {
      hover: { filter: { type: 'lighten', value: 0.5 } },
      active: { filter: { type: 'none', value: 0 } },
    },
    stroke: { width: 0 },
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: '75%',
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: '12px',
              fontWeight: '400',
              color:
                colorScheme === 'dark' ? theme.white : theme.colors.dark[6],
            },
            value: {
              show: true,
              fontSize: '22px',
              fontWeight: '600',
              color:
                colorScheme === 'dark' ? theme.white : theme.colors.dark[6],
            },
            total: {
              show: true,
              showAlways: true,
              formatter: function (w: any) {
                const totals = w.globals.seriesTotals;

                const result = totals.reduce(
                  (a: number, b: number) => a + b,
                  0,
                );

                return (result / 1000).toFixed(3);
              },
              color:
                colorScheme === 'dark' ? theme.white : theme.colors.dark[6],
            },
          },
        },
      },
    },
    colors: Array.from({ length: CATEGORY_NUM }, (_, i) => {
      const shades = [9, 7, 5, 3, 2, 1];
      return theme.colors[theme.primaryColor][shades[i] || 1];
    }),
  };

  return (
    <Surface {...others}>
      <Group mb="md">
        <Text size="lg" fw={600}>
          {CHART_TITLE}
        </Text>
      </Group>
      {salesLoading ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text size="sm" c="dimmed">Loading chart...</Text>
        </div>
      ) : series.length > 0 && series.some((val: any) => val > 0) ? (
        <Suspense fallback={<div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text size="sm" c="dimmed">Loading chart...</Text></div>}>
          {/*@ts-ignore*/}
          <Chart
            key={`chart-${series.join('-')}`}
            options={options}
            series={series}
            type="donut"
            height={160}
            width={'100%'}
          />
        </Suspense>
      ) : (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text size="sm" c="dimmed">No data available</Text>
        </div>
      )}
      {salesError ? (
        <ErrorAlert
          title="Error loading sales data"
          message={salesError.toString()}
        />
      ) : (
        <DataTable
          highlightOnHover
          columns={[
            { accessor: 'source' },
            { accessor: 'revenue' },
            { accessor: 'value' },
          ]}
          records={salesData?.slice(0, CATEGORY_NUM) || []}
          height={200}
          fetching={salesLoading}
          styles={{
            root: { backgroundColor: 'transparent' },
            table: { backgroundColor: 'transparent' }
          }}
        />
      )}
    </Surface>
  );
};

export default SalesChart;
