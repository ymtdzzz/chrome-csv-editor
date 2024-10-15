import { createStorage } from './base';
import { StorageEnum } from './enums';
import { CsvNode, CsvNodeStorage } from './types';

const storage = createStorage<CsvNode[]>('csv-node-key', [], {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export const csvNodeStorage: CsvNodeStorage = storage;
