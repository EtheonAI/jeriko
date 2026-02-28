export type InvoiceStatus = 'sent' | 'suspended' | 'cancelled' | 'approved' | 'pending';

export interface Invoices {
  id: string;
  full_name: string;
  email: string;
  address: string;
  country: string;
  status: InvoiceStatus;
  amount: number;
  issue_date: string;
  description: string;
  client_email: string;
  client_address: string;
  client_country: string;
  client_name: string;
  client_company: string;
}