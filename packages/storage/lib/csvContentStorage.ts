import { createStorage } from './base';
import { StorageEnum } from './enums';
import type { CsvContent, CsvContentStorage } from './types';

const storage = createStorage<CsvContent>(
  'csv-content-key',
  {},
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const csvContentStorage: CsvContentStorage = storage;
