'use client';

/*
 * TEMPLATE COMPONENT - REQUIRES CUSTOMIZATION
 * 
 * This is a template map chart component for geographical data visualization. Before using:
 * 1. Update the data source from '/data.csv' to your actual geo data endpoint
 * 2. Modify the data structure to match your geographical dataset
 * 3. Update field names (city_code, lng, lat, population) to match your data
 * 4. Change the chart title to reflect what you're visualizing
 * 5. Adjust the scale and markers based on your data range and requirements
 * 6. Update the geography data source if needed (currently uses WorldCountriesMap)
 * 
 * DO NOT use this component as-is without customizing the data source and fields!
 */

import React, { useEffect, useMemo, useState } from 'react';

import {
  ActionIcon,
  Group,
  Paper,
  PaperProps,
  Text,
  useMantineTheme,
} from '@mantine/core';
import { IconDotsVertical } from '@tabler/icons-react';
import { csv } from 'd3-fetch';
import { scaleLinear } from 'd3-scale';
import sortBy from 'lodash/sortBy';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from 'react-simple-maps';

import { Surface } from '@/components';
const geoUrl = '/mocks/WorldAtlasCountries.json';

type MapChartProps = PaperProps;

const MapChart = ({ ...others }: MapChartProps) => {
  const theme = useMantineTheme();
  const [data, setData] = useState<any>([]);
  const [maxValue, setMaxValue] = useState(0);

  useEffect(() => {
    // TODO: Replace '/data.csv' with your actual geo data source
    csv('/data.csv').then((cities: any) => { // TEMPLATE DATA SOURCE - CUSTOMIZE FOR YOUR GEO DATA
      const sortedCities = sortBy(cities, (o) => -o.population); // TODO: Update field name 'population' to match your data
      setMaxValue(sortedCities[0].population); // TODO: Update field reference for your max value
      setData(sortedCities);
    });
  }, []);

  const popScale = useMemo(
    () => scaleLinear().domain([0, maxValue]).range([0, 24]),
    [maxValue],
  );

  return (
    <Surface {...others}>
      <Group justify="space-between" mb="md">
        <Text size="lg" fw={600}>
          CHART_TITLE_REPLACE_ME {/* TODO: Update with meaningful title for your geo data */}
        </Text>
        <ActionIcon variant="subtle">
          <IconDotsVertical size={16} />
        </ActionIcon>
      </Group>
      {/*@ts-ignore*/}
      <ComposableMap projectionConfig={{ rotate: [-10, 0, 0] }}>
        {/*@ts-ignore*/}
        <Geographies geography={geoUrl}>
          {({ geographies }: any) =>
            geographies.map((geo: any) => (
              // @ts-ignore
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={theme.colors[theme.primaryColor][1]}
              />
            ))
          }
        </Geographies>
        {data.map(({ city_code, lng, lat, population }: any) => { // TODO: Update field names to match your geo data structure
          return (
            // @ts-ignore
            <Marker key={city_code} coordinates={[lng, lat]}>
              <circle
                fill={theme.colors[theme.primaryColor][7]}
                stroke="#FFF"
                r={popScale(population)}
              />
            </Marker>
          );
        })}
      </ComposableMap>
    </Surface>
  );
};

export default MapChart;
