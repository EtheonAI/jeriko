'use client';

/*
 * TEMPLATE COMPONENT - REQUIRES CUSTOMIZATION
 * 
 * This is a template data table component for invoices/tabular data. Before using:
 * 1. Update the data type from Invoices[] to match your dataset structure
 * 2. Modify column definitions to match your data fields
 * 3. Update column titles, accessors, and rendering logic
 * 4. Adjust filter components (TextInput/MultiSelect) for your data types
 * 5. Update status badge logic if you have status fields
 * 6. Change error messages and tooltips to match your context
 * 
 * DO NOT use this component as-is without customizing for your data structure!
 */

import { ReactNode, useEffect, useMemo, useState } from 'react';

import {
  ActionIcon,
  Avatar,
  Badge,
  Flex,
  Group,
  HoverCard,
  MantineColor,
  MultiSelect,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
  useMantineTheme,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCloudDownload, IconEye, IconSearch } from '@tabler/icons-react';
import sortBy from 'lodash/sortBy';
import {
  DataTable,
  DataTableProps,
  DataTableSortStatus,
} from 'mantine-datatable';
import { useLocation } from 'wouter';

import { ErrorAlert } from '@/components';
import { InvoiceStatus, Invoices } from '@/types';

const PAGE_SIZES = [5, 10, 20];

const ICON_SIZE = 18;

type StatusBadgeProps = {
  status: InvoiceStatus;
};

const StatusBadge = ({ status }: StatusBadgeProps) => {
  let color: MantineColor = '';

  switch (status) {
    case 'sent':
      color = 'blue';
      break;
    case 'suspended':
      color = 'gray';
      break;
    case 'cancelled':
      color = 'red';
      break;
    case 'approved':
      color = 'green.8';
      break;
    case 'pending':
      color = 'cyan.7';
      break;
    default:
      color = 'dark';
  }

  return (
    <Badge color={color} variant="filled" radius="sm">
      {status}
    </Badge>
  );
};

type InvoicesTableProps = {
  data: Invoices[]; // TODO: Replace Invoices[] with your actual data type
  error?: ReactNode;
  loading?: boolean;
};

const InvoicesTable = ({ data, error, loading }: InvoicesTableProps) => {
  const theme = useMantineTheme();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [selectedRecords, setSelectedRecords] = useState<Invoices[]>([]);
  const [records, setRecords] = useState<Invoices[]>(data.slice(0, pageSize));
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Invoices>>({
    columnAccessor: 'full_name',
    direction: 'asc',
  });
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(query, 200);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [, setLocation] = useLocation();
  const statuses = useMemo(() => {
    const statuses = new Set(data.map((e) => e.status));
    // @ts-ignore
    return [...statuses];
  }, [data]);

  // TODO: Customize these column definitions for your dataset
  const columns: DataTableProps<Invoices>['columns'] = [
    {
      accessor: 'full_name', // TODO: Replace with actual field name from your data
      title: 'COLUMN_TITLE_REPLACE_ME', // TODO: Update with meaningful column title
      render: ({ full_name, email }: any) => {
        const spaceIndex = full_name?.indexOf(' ') ?? -1;
        const firstName = spaceIndex > -1 ? full_name.substring(0, spaceIndex) : (full_name || '');
        const lastName = spaceIndex > -1 ? full_name.substring(spaceIndex + 1) : '';

        return (
          <HoverCard shadow="md" openDelay={500} closeDelay={500}>
            <HoverCard.Target>
              <Flex component="div" role="button" tabIndex={0} gap="xs" align="center">
                <Avatar
                  src={null}
                  alt={`${firstName} ${lastName}`}
                  variant="filled"
                  radius="xl"
                  color={theme.colors[theme.primaryColor][7]}
                >
                  {`${Array.from(firstName)[0]}`}
                  {`${Array.from(lastName)[0]}`}
                </Avatar>
                <Stack gap={1}>
                  <Text fw={600}>{full_name}</Text>
                  <Text fz="sm">{email}</Text>
                </Stack>
              </Flex>
            </HoverCard.Target>
            <HoverCard.Dropdown>
              <Stack gap="xs">
                <Text fz="sm">First name: {firstName}</Text>
                <Text fz="sm">Last name: {lastName}</Text>
                <Text fz="sm">Email: {email}</Text>
              </Stack>
            </HoverCard.Dropdown>
          </HoverCard>
        );
      },
      sortable: true,
      filter: (
        <TextInput
          label="FILTER_LABEL_REPLACE_ME" // TODO: Update with appropriate filter label
          description="FILTER_DESCRIPTION_REPLACE_ME" // TODO: Update filter description
          placeholder="SEARCH_PLACEHOLDER_REPLACE_ME..." // TODO: Update placeholder text
          leftSection={<IconSearch size={16} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      ),
      filtering: query !== '',
    },
    {
      accessor: 'status', // TODO: Replace with actual status field from your data
      render: (item: any) => <StatusBadge status={item.status} />, // TODO: Update rendering logic for your data
      filter: (
        <MultiSelect
          label="Status"
          description="Show all products with status"
          data={statuses}
          value={selectedStatuses}
          placeholder="Search statuses…"
          onChange={setSelectedStatuses}
          leftSection={<IconSearch size={16} />}
          clearable
          searchable
        />
      ),
      filtering: selectedStatuses.length > 0,
    },
    {
      accessor: 'id',
      render: (item: any) => <Text>#{item.id.slice(0, 7)}</Text>,
    },
    {
      accessor: 'amount',
      sortable: true,
      render: (item: any) => <Text>${item.amount}</Text>,
    },
    {
      accessor: 'issue_date',
    },
    {
      accessor: '',
      title: 'Actions',
      render: (item: any) => (
        <Group gap="sm">
          <Tooltip label="Download invoice">
            <ActionIcon>
              <IconCloudDownload size={ICON_SIZE} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="View invoice details">
            <ActionIcon disabled>
              <IconEye size={ICON_SIZE} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ),
    },
  ];

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    const d = sortBy(data, sortStatus.columnAccessor) as Invoices[];
    const dd = sortStatus.direction === 'desc' ? d.reverse() : d;
    let filtered = dd.slice(from, to) as Invoices[];

    if (debouncedQuery || selectedStatuses.length) {
      filtered = data
        .filter(({ full_name, status }) => {
          if (
            debouncedQuery !== '' &&
            !full_name
              .toLowerCase()
              .includes(debouncedQuery.trim().toLowerCase())
          ) {
            return false;
          }

          // @ts-ignore
          if (
            selectedStatuses.length &&
            !selectedStatuses.some((s) => s === status)
          ) {
            return false;
          }
          return true;
        })
        .slice(from, to);
    }

    setRecords(filtered);
  }, [sortStatus, data, page, pageSize, debouncedQuery, selectedStatuses]);

  return error ? (
    <ErrorAlert title="Error loading invoices" message={error.toString()} />
  ) : (
    <DataTable
      minHeight={200}
      verticalSpacing="xs"
      striped
      highlightOnHover
      // @ts-ignore
      columns={columns}
      records={records}
      selectedRecords={selectedRecords}
      // @ts-ignore
      onSelectedRecordsChange={setSelectedRecords}
      totalRecords={
        debouncedQuery || selectedStatuses.length > 0
          ? records.length
          : data.length
      }
      recordsPerPage={pageSize}
      page={page}
      onPageChange={(p) => setPage(p)}
      recordsPerPageOptions={PAGE_SIZES}
      onRecordsPerPageChange={setPageSize}
      sortStatus={sortStatus}
      onSortStatusChange={(s) => setSortStatus(s)}
      fetching={loading}
    />  
  );
};

export default InvoicesTable;
