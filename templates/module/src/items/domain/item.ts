// What an item is, in this module's language. Rows are mapped to it in the adapter.

export interface Item {
  id: string;
  tenantId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
