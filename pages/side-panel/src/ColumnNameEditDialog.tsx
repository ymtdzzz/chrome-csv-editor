import { Button, Flex, Modal, TextInput } from '@mantine/core';
import { ColumnInfo, exportToCsv, getOptionFromCsv } from './CsvEditor';
import { IVTable } from '@visactor/react-vtable/es/tables/base-table';
import {
  ListTableConstructorOptions,
  PivotChartConstructorOptions,
  PivotTableConstructorOptions,
} from '@visactor/vtable';

interface ColumnNameEditDialogProps {
  dialogOpened: boolean;
  close: () => void;
  colInfo: ColumnInfo;
  setColInfo: React.Dispatch<React.SetStateAction<ColumnInfo>>;
  table: IVTable | null;
  setOption: React.Dispatch<
    React.SetStateAction<ListTableConstructorOptions | PivotTableConstructorOptions | PivotChartConstructorOptions>
  >;
}

const ColumnNameEditDialog: React.FC<ColumnNameEditDialogProps> = ({
  dialogOpened,
  close,
  colInfo,
  setColInfo,
  table,
  setOption,
}) => {
  const onColumnNameUpdate: React.ChangeEventHandler<HTMLInputElement> = async event => {
    const columnName = event.currentTarget.value;
    setColInfo({ ...colInfo, name: columnName });
  };

  const onColNameChange = () => {
    if (!table) {
      close();
      return;
    }
    const csv = exportToCsv(table);
    const cell = table.getCellInfo(colInfo.col, colInfo.row);
    const newColName = colInfo.name;
    const newOption = getOptionFromCsv(
      csv,
      records => {
        return [
          records.map(record => {
            record[newColName] = record[cell.value];
            delete record[cell.value];
            return record;
          }),
          [newColName],
        ];
      },
      cols => {
        cols.splice(cell.col, 0, {
          field: newColName,
          title: newColName,
          width: 'auto',
        });
        return cols;
      },
    );
    setOption(newOption);
    close();
  };

  return (
    <Modal
      title="Edit column name"
      opened={dialogOpened}
      withCloseButton
      onClose={close}
      size="xs"
      radius="md"
      centered>
      <TextInput style={{ marginBottom: '5px' }} value={colInfo.name} onChange={onColumnNameUpdate} />
      <Flex justify="flex-end">
        <Button onClick={onColNameChange}>Save</Button>
      </Flex>
    </Modal>
  );
};

export default ColumnNameEditDialog;
