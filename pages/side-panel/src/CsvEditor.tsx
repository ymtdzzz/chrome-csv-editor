import { TextInput, Text, Loader } from '@mantine/core';
import { ListTable } from '@visactor/react-vtable';
import { EventCallback } from '@visactor/react-vtable/es/eventsUtils';
import { IVTable } from '@visactor/react-vtable/es/tables/base-table';
import {
  ListTableConstructorOptions,
  MousePointerCellEvent,
  PivotChartConstructorOptions,
  PivotTableConstructorOptions,
} from '@visactor/vtable';
import dayjs from 'dayjs';
import { NodeApi } from 'react-arborist';
import ColumnNameEditDialog from './ColumnNameEditDialog';
import { exportVTableToCsv } from '@visactor/vtable-export';
import { defaultOption } from './SidePanel';
import { parse } from 'csv-parse/browser/esm/sync';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { csvContentStorage } from '@extension/storage';

export interface ColumnInfo {
  name: string;
  row: number;
  col: number;
}

export const exportToCsv = (tableInstance: IVTable) => {
  return exportVTableToCsv(tableInstance)
    .replaceAll('undefined', '')
    .split(/\r?\n/)
    .map(line => (line.endsWith(',') ? line.slice(0, -1) : line))
    .join('\n');
};

export const getOptionFromCsv = (
  input: string,
  recordsMofidier?: (records: any[]) => [any[], string[]],
  colsModifier?: (cols: any[]) => any[],
) => {
  const opt = defaultOption();

  // TODO: support other delimiters
  let records: any[] = parse(input, {
    delimiter: ',',
    columns: true,
  });

  let skipKeys: string[] = [];
  if (recordsMofidier) {
    [records, skipKeys] = recordsMofidier(records);
  }

  if (records.length === 0) return opt;
  // get columns
  let columns = [];
  for (const key in records[0]) {
    if (skipKeys.includes(key)) {
      continue;
    }
    columns.push({
      field: key,
      title: key,
      width: 'auto',
    });
  }

  if (colsModifier) {
    columns = colsModifier(columns);
  }

  opt.columns = columns;
  opt.records = records;

  return opt;
};

interface CsvEditorProps {
  nodeSelected: NodeApi<{ name: string; type: string }> | null;
  option: ListTableConstructorOptions | PivotTableConstructorOptions | PivotChartConstructorOptions;
  setOption: React.Dispatch<
    React.SetStateAction<ListTableConstructorOptions | PivotTableConstructorOptions | PivotChartConstructorOptions>
  >;
  csvName: string;
  onCsvNameUpdate: React.ChangeEventHandler<HTMLInputElement>;
}

const CsvEditor: React.FC<CsvEditorProps> = ({ nodeSelected, option, setOption, csvName, onCsvNameUpdate }) => {
  const [table, setTable] = useState<IVTable | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(dayjs());
  const [dialogOpened, { open, close }] = useDisclosure(false);
  const [colInfo, setColInfo] = useState<ColumnInfo>({
    name: '',
    row: -1,
    col: -1,
  });

  const onTableReady = (tableInstance: IVTable, isInitial: boolean) => {
    setTable(tableInstance);

    if (isInitial) {
      tableInstance.on('dropdown_menu_click', async args => {
        if (args.menuKey === 'add row') {
          let selectedCells = tableInstance.getSelectedCellInfos();
          let selectedRanges = tableInstance.getSelectedCellRanges();
          if (!selectedCells || selectedCells.length === 0 || selectedCells[0].length === 0) return;
          if (!selectedRanges || selectedRanges.length !== 1) return; // TODO: show error notification
          // insert a row below the last selected row
          const selectedLastRow = selectedCells[selectedCells.length - 1][0].row;
          const insertRowCount = Math.abs(selectedRanges[0].start.row - selectedRanges[0].end.row);
          const csv = exportToCsv(tableInstance);
          const newOption = getOptionFromCsv(csv, records => {
            for (let i = 0; i < insertRowCount + 1; i++) {
              records.splice(selectedLastRow, 0, []);
            }
            return [records, []];
          });
          setOption(newOption);
        } else if (args.menuKey === 'add column') {
          let selectedCells = tableInstance.getSelectedCellInfos();
          let selectedRanges = tableInstance.getSelectedCellRanges();
          if (!selectedCells || selectedCells.length === 0 || selectedCells[0].length === 0) return;
          if (!selectedRanges || selectedRanges.length !== 1) return; // TODO: show error notification
          // insert a row below the last selected row
          const selectedLastColumn = selectedCells[0][selectedCells[0].length - 1].col;
          const insertColumnCount = Math.abs(selectedRanges[0].start.col - selectedRanges[0].end.col);
          const csv = exportToCsv(tableInstance);
          const newOption = getOptionFromCsv(
            csv,
            records => {
              const skipKeys: string[] = [];
              const newRecords = records.map(record => {
                for (let i = 0; i < insertColumnCount + 1; i++) {
                  const newColName = `New Column (${i + 1})`;
                  skipKeys.push(newColName);
                  record[newColName] = '';
                }
                return record;
              });
              return [newRecords, skipKeys];
            },
            cols => {
              for (let i = 0; i < insertColumnCount + 1; i++) {
                const newColName = `New Column (${i + 1})`;
                cols.splice(selectedLastColumn + 1, 0, {
                  field: newColName,
                  title: newColName,
                  width: 'auto',
                });
              }
              return cols;
            },
          );
          setOption(newOption);
        } else if (args.menuKey === 'delete row') {
          let selectedCells = tableInstance.getSelectedCellInfos();
          let selectedRanges = tableInstance.getSelectedCellRanges();
          if (!selectedCells || selectedCells.length === 0 || selectedCells[0].length === 0) return;
          if (!selectedRanges || selectedRanges.length !== 1) return; // TODO: show error notification
          const deleteStartRow = selectedCells[0][0].row;
          const deleteRowCount = Math.abs(selectedRanges[0].start.row - selectedRanges[0].end.row);
          const csv = exportToCsv(tableInstance);
          const newOption = getOptionFromCsv(csv, records => {
            records.splice(deleteStartRow - 1, deleteRowCount + 1);
            return [records, []];
          });
          setOption(newOption);
        } else if (args.menuKey === 'delete column') {
          let selectedCells = tableInstance.getSelectedCellInfos();
          let selectedRanges = tableInstance.getSelectedCellRanges();
          if (!selectedCells || selectedCells.length === 0 || selectedCells[0].length === 0) return;
          if (!selectedRanges || selectedRanges.length !== 1) return; // TODO: show error notification
          const deleteStartCol = selectedCells[0][0].col;
          const deleteColCount = Math.abs(selectedRanges[0].start.col - selectedRanges[0].end.col);
          const deleteColNames: string[] = [];
          for (let i = 0; i < deleteColCount + 1; i++) {
            deleteColNames.push(tableInstance.getCellValue(deleteStartCol + i, 0));
          }
          const csv = exportToCsv(tableInstance);
          const newOption = getOptionFromCsv(csv, records => {
            records = records.map(record => {
              deleteColNames.forEach(name => {
                delete record[name];
              });
              return record;
            });
            return [records, []];
          });
          setOption(newOption);
        }
      });
    }
  };

  const handleUpdate = async () => {
    if (table && nodeSelected && nodeSelected.data.type === 'file') {
      setIsUpdating(true);
      const csvContent = await csvContentStorage.get();
      const csv = exportToCsv(table);
      csvContent[nodeSelected.id]['content'] = csv;
      await csvContentStorage.set(csvContent);
      setLastUpdated(dayjs());
      setIsUpdating(false);
    }
  };

  const onCellDblClicked: EventCallback<MousePointerCellEvent> = ({ col, row, value }) => {
    if (row === 0 && table) {
      setColInfo({
        name: value,
        row: row,
        col: col,
      });
      open();
    }
  };

  useEffect(() => {
    (async () => {
      handleUpdate();
    })();
  }, [option]);

  return (
    <>
      <ColumnNameEditDialog
        dialogOpened={dialogOpened}
        close={close}
        colInfo={colInfo}
        setColInfo={setColInfo}
        table={table}
        setOption={setOption}
      />
      <TextInput value={csvName} style={{ marginBottom: '5px' }} onChange={onCsvNameUpdate} />
      <Text size="sm" mb="xs" fw={500}>
        {isUpdating ? <Loader size="sm" /> : `Saved: ${lastUpdated.toString()}`}
      </Text>
      <ListTable
        option={option}
        height={1000}
        onReady={onTableReady}
        onChangCellValue={handleUpdate}
        onDblClickCell={onCellDblClicked}
      />
    </>
  );
};

export default CsvEditor;
