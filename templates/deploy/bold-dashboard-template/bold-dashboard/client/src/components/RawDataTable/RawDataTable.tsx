'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';

import {
  Avatar,
  Badge,
  Flex,
  HoverCard,
  MantineColor,
  MultiSelect,
  Stack,
  Text,
  TextInput,
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

import { ErrorAlert, Surface } from '@/components';

const PAGE_SIZES = [10, 20, 50, 100];

const ICON_SIZE = 18;

// Define status types locally for extensibility
const STATUS_TYPES = {
  SENT: 'sent',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
  APPROVED: 'approved',
  PENDING: 'pending',
} as const;

type StatusType = typeof STATUS_TYPES[keyof typeof STATUS_TYPES];

type StatusBadgeProps = {
  status: StatusType;
};

const StatusBadge = ({ status }: StatusBadgeProps) => {
  let color: MantineColor = '';

  switch (status) {
    case STATUS_TYPES.SENT:
      color = 'blue';
      break;
    case STATUS_TYPES.SUSPENDED:
      color = 'gray';
      break;
    case STATUS_TYPES.CANCELLED:
      color = 'red';
      break;
    case STATUS_TYPES.APPROVED:
      color = 'green.8';
      break;
    case STATUS_TYPES.PENDING:
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

type RawDataTableProps = {
  data: any[];
  error?: ReactNode;
  loading?: boolean;
};

const RawDataTable = ({ data, error, loading }: RawDataTableProps) => {
  const theme = useMantineTheme();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]); // Default to 20 for raw data
  const [selectedRecords, setSelectedRecords] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>(data?.slice(0, pageSize) || []);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<any>>({
    columnAccessor: 'full_name',
    direction: 'asc',
  });
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(query, 200);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  const statuses = useMemo(() => {
    const statuses = new Set(data?.map((e) => e.status) || []);
    // @ts-ignore
    return [...statuses];
  }, [data]);

  const columns: DataTableProps<any>['columns'] = [
    {
      accessor: 'full_name',
      title: 'Customer',
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
          label="Customer"
          description="Show customer whose names include the specified text"
          placeholder="Search customer..."
          leftSection={<IconSearch size={16} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      ),
      filtering: query !== '',
    },
    {
      accessor: 'status',
      render: (item: any) => <StatusBadge status={item.status} />,
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
      render: (item: any) => <Text>#{item.id?.slice(0, 7)}</Text>,
    },
    {
      accessor: 'amount',
      sortable: true,
      render: (item: any) => <Text>${item.amount}</Text>,
    },
    {
      accessor: 'issue_date',
    },
  ];

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    const d = sortBy(data || [], sortStatus.columnAccessor) as any[];
    const dd = sortStatus.direction === 'desc' ? d.reverse() : d;
    let filtered = dd?.slice(from, to) as any[];

    if (debouncedQuery || selectedStatuses.length) {
      filtered = (data || [])
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
        ?.slice(from, to);
    }

    setRecords(filtered || []);
  }, [sortStatus, data, page, pageSize, debouncedQuery, selectedStatuses]);

  return error ? (
    <ErrorAlert title="Error loading invoices" message={error.toString()} />
  ) : (
    <Surface p="md" style={{ overflow: 'hidden' }}>
      <DataTable
        minHeight="calc(100vh - 250px)"
        verticalSpacing="sm"
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
            : data?.length || 0
        }
        recordsPerPage={pageSize}
        page={page}
        onPageChange={(p) => setPage(p)}
        recordsPerPageOptions={PAGE_SIZES}
        onRecordsPerPageChange={setPageSize}
        sortStatus={sortStatus}
        onSortStatusChange={(s) => setSortStatus(s)}
        fetching={loading}
        style={{ 
          height: 'calc(100vh - 250px)',
          borderRadius: 'var(--theme-border-radius)'
        }}
      />
    </Surface>
  );
};

export default RawDataTable;
