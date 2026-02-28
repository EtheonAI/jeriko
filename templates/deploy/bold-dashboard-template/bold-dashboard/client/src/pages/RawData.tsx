import { Container, Stack } from '@mantine/core';
import { PageHeader, RawDataTable } from '@/components';
import { useFetchData } from '@/hooks';

const PAPER_PROPS = {
  p: 'md',
  style: { minHeight: '100%' },
};

export default function RawDataPage() {
  const {
    data: invoicesData,
    error: invoicesError,
    loading: invoicesLoading,
  } = useFetchData('/mocks/Invoices.json');

  return (
    <Container fluid>
      <Stack gap="lg">
        <PageHeader title="Raw data" withActions={false} />
        
        <RawDataTable
          data={invoicesData}
          error={invoicesError}
          loading={invoicesLoading}
          {...PAPER_PROPS}
        />
      </Stack>
    </Container>
  );
}

