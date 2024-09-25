import '@src/SidePanel.css';
import '@mantine/core/styles.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { IOption, IVTable } from '@visactor/react-vtable/es/tables/base-table';
import { ListTable } from '@visactor/react-vtable';
import { InputEditor } from '@visactor/vtable-editors';
import * as VTable from '@visactor/vtable';
import { exportVTableToCsv } from '@visactor/vtable-export';
import { useEffect, useState } from 'react';
import { parse } from 'csv-parse/browser/esm/sync';
import { csvContentStorage, csvNodeStorage } from '@extension/storage';
import {
  ActionIcon,
  ActionIconGroup,
  AppShell,
  Burger,
  Button,
  Flex,
  Loader,
  MantineProvider,
  Modal,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { MoveHandler, NodeApi, NodeRendererProps, Tree } from 'react-arborist';
import { CsvContent, CsvNode } from '@extension/storage/lib/types';
import { IconBoxMultiple, IconFile, IconFolder, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { EventCallback } from '@visactor/react-vtable/es/eventsUtils';

const inputEditor = new InputEditor();
VTable.register.editor('input-editor', inputEditor);

const defaultOption = (): IOption => {
  return {
    columns: [],
    records: [],
    keyboardOptions: {
      moveEditCellOnArrowKeys: true,
      copySelected: true,
      pasteValueToCell: true,
    },
    editor: 'input-editor',
    editCellTrigger: 'doubleclick',
    dragHeaderMode: 'all',
    menu: {
      contextMenuItems: ['add row', 'add column', 'delete row', 'delete column'],
    },
  };
};

const getOptionFromCsv = (
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

const getTreeFromNode = (input: CsvNode[]): any[] => {
  return input.map(node => {
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      children: getTreeFromNode(node.children),
    };
  });
};

const getNodeFromTree = (input: any[]): CsvNode[] => {
  return input.map(node => {
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      children: getNodeFromTree(node.children),
    };
  });
};

const moveNode = (nodes: CsvNode[], targetId: string, parentId: string | null, destIndex: number) => {
  let targetNode: CsvNode | null = null;
  function removeNodeById(nodes: CsvNode[]) {
    return nodes.filter(node => {
      if (node.id === targetId) {
        targetNode = node;
        return false;
      }
      if (node.children) {
        node.children = removeNodeById(node.children);
      }
      return true;
    });
  }

  const updatedNodes = removeNodeById(nodes);

  if (!targetNode) {
    return updatedNodes;
  }

  if (parentId === null) {
    const newNodes = [...updatedNodes];
    newNodes.splice(destIndex, 0, targetNode);
    return newNodes;
  }

  function insertNodeAt(nodes: CsvNode[], parentId: string, nodeToInsert: CsvNode, index: number) {
    return nodes.map(node => {
      if (node.id === parentId) {
        const children = node.children ? [...node.children] : [];
        children.splice(index, 0, nodeToInsert);
        return { ...node, children };
      }
      if (node.children) {
        node.children = insertNodeAt(node.children, parentId, nodeToInsert, index);
      }
      return node;
    });
  }

  if (targetNode) {
    return insertNodeAt(updatedNodes, parentId, targetNode, destIndex);
  }

  return updatedNodes;
};

const addNode = (nodes: CsvNode[], selectedNodeId: string, newNode: CsvNode) => {
  function traverseAndAdd(nodes: CsvNode[]): CsvNode[] {
    return nodes.map(node => {
      if (node.id === selectedNodeId) {
        const updatedChildren = node.children ? [...node.children, newNode] : [newNode];
        return { ...node, children: updatedChildren };
      }

      if (node.children) {
        return { ...node, children: traverseAndAdd(node.children) };
      }

      return node;
    });
  }

  return traverseAndAdd(nodes);
};

const copyNode = (nodes: CsvNode[], copiedNode: CsvNode, selectedNodeId: string) => {
  let found = false;
  function traverseAndCopy(nodes: CsvNode[]): CsvNode[] {
    return nodes.map(node => {
      if (node.children) {
        const childIndex = node.children.findIndex(child => child.id === selectedNodeId);

        if (childIndex !== -1) {
          found = true;
          const updatedChildren = [
            ...node.children.slice(0, childIndex + 1),
            copiedNode,
            ...node.children.slice(childIndex + 1),
          ];

          return { ...node, children: updatedChildren };
        }

        return { ...node, children: traverseAndCopy(node.children) };
      }
      return node;
    });
  }

  const csvNode = traverseAndCopy(nodes);
  if (!found) {
    const index = csvNode.findIndex(node => node.id === selectedNodeId);
    if (index !== -1) {
      found = true;
      return [...csvNode.slice(0, index + 1), copiedNode, ...csvNode.slice(index + 1)];
    }
  }
  return csvNode;
};

const deleteNodeById = (nodes: CsvNode[], csvContent: CsvContent, id: string): [CsvNode[], CsvContent] => {
  function traverseAndDelete(nodes: CsvNode[]): CsvNode[] {
    return nodes
      .filter(node => {
        if (node.id === id) {
          delete csvContent[id];
          deleteCsvContent(node.children);
          return false;
        }
        return true;
      })
      .map(node => {
        if (node.children) {
          return { ...node, children: traverseAndDelete(node.children) };
        }
        return node;
      });
  }

  function deleteCsvContent(nodes: CsvNode[]) {
    nodes.forEach(node => {
      delete csvContent[node.id];
      if (node.children) {
        deleteCsvContent(node.children);
      }
    });
  }

  const updatedNodes = traverseAndDelete(nodes);
  return [updatedNodes, csvContent];
};

const Node: React.FC<NodeRendererProps<any>> = ({ node, style, dragHandle }) => {
  return (
    <div style={style} ref={dragHandle}>
      <p style={{ backgroundColor: node.isSelected ? '#ddd' : '#fff' }}>
        {node.data.type === 'file' ? '📄' : '📁'}
        {node.data.name}
      </p>
    </div>
  );
};

const exportToCsv = (tableInstance: IVTable) => {
  return exportVTableToCsv(tableInstance)
    .replaceAll('undefined', '')
    .split(/\r?\n/)
    .map(line => (line.endsWith(',') ? line.slice(0, -1) : line))
    .join('\n');
};

interface ColumnInfo {
  name: string;
  row: number;
  col: number;
}

const SidePanel = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(dayjs());
  const [table, setTable] = useState<IVTable | null>(null);
  const [option, setOption] = useState(defaultOption());
  const [node, setNode] = useState<any[]>([]);
  const [nodeSelected, setNodeSelected] = useState<NodeApi<{ name: string; type: string }> | null>(null);
  const [opened, { toggle }] = useDisclosure(true);
  const [dialogOpened, { open, close }] = useDisclosure(false);
  const [csvName, setCsvName] = useState('');
  const [colInfo, setColInfo] = useState<ColumnInfo>({
    name: '',
    row: -1,
    col: -1,
  });
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
  const onCellDblClicked: EventCallback<VTable.MousePointerCellEvent> = ({ col, row, value }) => {
    if (row === 0 && table) {
      setColInfo({
        name: value,
        row: row,
        col: col,
      });
      open();
    }
  };
  const onTableReady = (tableInstance: IVTable, isInitial: boolean) => {
    console.log('ready');
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
  const onCsvNameUpdate: React.ChangeEventHandler<HTMLInputElement> = async event => {
    const csvName = event.currentTarget.value;
    setCsvName(csvName);
    if (nodeSelected === null) return;
    let csvNode = await csvNodeStorage.get();
    csvNode = updateNodeNameById(nodeSelected.id, csvName, csvNode);
    await csvNodeStorage.set(csvNode);
    await refreshTree();
  };
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
  const onNodeSelect = async (nodes: NodeApi<{ name: string; type: string }>[]) => {
    if (nodes.length === 0) return;
    const key = nodes[0].id;
    const csvContent = await csvContentStorage.get();
    setNodeSelected(nodes[0]);
    setCsvName(nodes[0].data.name);
    if (key in csvContent) {
      // FIXME: terrible solution...
      setOption(defaultOption);
      setTimeout(() => {
        setOption(getOptionFromCsv(csvContent[key].content));
      }, 1);
    } else {
      setOption(defaultOption);
    }
  };
  const onNodeMove: MoveHandler<{ name: string; type: string }> = async ({ dragIds, dragNodes, parentId, index }) => {
    // NOTE: the length of dragIds and dragNodes is always expected to be 1.
    if (dragIds.length !== 1 || dragNodes.length !== 1) return;
    let csvNode = await csvNodeStorage.get();
    csvNode = moveNode(csvNode, dragIds[0], parentId, index);
    await csvNodeStorage.set(csvNode);
    await refreshTree();
  };
  const onCreateFile = async () => {
    const csvContent = await csvContentStorage.get();
    let csvNode = await csvNodeStorage.get();
    const key = window.crypto.randomUUID();
    csvContent[key] = {
      content: 'column1,column2\nvalue1,value2',
    };
    const newNode: CsvNode = {
      id: key,
      name: 'New CSV',
      type: 'file',
      children: [],
    };
    if (nodeSelected !== null && nodeSelected.data.type === 'folder') {
      csvNode = addNode(csvNode, nodeSelected.id, newNode);
    } else {
      csvNode.push(newNode);
    }
    await csvContentStorage.set(csvContent);
    await csvNodeStorage.set(csvNode);
    await refreshTree();
  };
  const onCreateFolder = async () => {
    let csvNode = await csvNodeStorage.get();
    const newNode: CsvNode = {
      id: window.crypto.randomUUID(),
      name: 'New Folder',
      type: 'folder',
      children: [],
    };
    if (nodeSelected !== null && nodeSelected.data.type === 'folder') {
      csvNode = addNode(csvNode, nodeSelected.id, newNode);
    } else {
      csvNode.push(newNode);
    }
    await csvNodeStorage.set(csvNode);
    await refreshTree();
  };
  const onDuplicate = async () => {
    if (nodeSelected === null || nodeSelected.data.type === 'folder') return;
    const csvContent = await csvContentStorage.get();
    let csvNode = await csvNodeStorage.get();
    const key = window.crypto.randomUUID();
    csvContent[key] = {
      content: csvContent[nodeSelected.id].content,
    };
    const copiedNode: CsvNode = {
      id: key,
      name: nodeSelected.data.name + ' (Copy)',
      type: 'file',
      children: [],
    };
    csvNode = copyNode(csvNode, copiedNode, nodeSelected.id);
    await csvContentStorage.set(csvContent);
    await csvNodeStorage.set(csvNode);
    await refreshTree();
  };
  const onDelete = async () => {
    if (nodeSelected === null) return;
    let csvContent = await csvContentStorage.get();
    let csvNode = await csvNodeStorage.get();
    [csvNode, csvContent] = deleteNodeById(csvNode, csvContent, nodeSelected.id);
    await csvContentStorage.set(csvContent);
    await csvNodeStorage.set(csvNode);
    await refreshTree();
  };
  const updateNodeNameById = (id: string, newName: string, nodes: any[]): any[] => {
    return nodes.map(node => {
      if (node.id === id) {
        return {
          ...node,
          name: newName,
        };
      }
      return {
        ...node,
        children: node.children ? updateNodeNameById(id, newName, node.children) : node.children,
      };
    });
  };
  const refreshTree = async () => {
    const csvNode = await csvNodeStorage.get();
    setNode(getTreeFromNode(csvNode));
  };
  useEffect(() => {
    (async () => {
      const csvNode = await csvNodeStorage.get();
      setNode(getTreeFromNode(csvNode));
      csvContentStorage.subscribe(async () => await refreshTree());
    })();
  }, []);
  useEffect(() => {
    (async () => {
      handleUpdate();
    })();
  }, [option]);

  return (
    <MantineProvider>
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
      <AppShell
        header={{ height: 60 }}
        navbar={{
          width: 300,
          breakpoint: 'sm',
          collapsed: {
            mobile: !opened,
            desktop: !opened,
          },
        }}
        padding="md">
        <AppShell.Header>
          <Burger opened={opened} onClick={toggle} size="sm" />
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <ActionIconGroup style={{ marginBottom: '6px' }}>
            <ActionIcon variant="default" aria-label="CreateFile" onClick={onCreateFile}>
              <IconFile style={{ width: '70%', height: '70%' }} stroke={1.5} />
            </ActionIcon>
            <ActionIcon variant="default" aria-label="CreateFolder" onClick={onCreateFolder}>
              <IconFolder style={{ width: '70%', height: '70%' }} stroke={1.5} />
            </ActionIcon>
            <ActionIcon variant="default" aria-label="Duplicate" onClick={onDuplicate}>
              <IconBoxMultiple style={{ width: '70%', height: '70%' }} stroke={1.5} />
            </ActionIcon>
            <ActionIcon variant="default" aria-label="Delete" onClick={onDelete}>
              <IconTrash style={{ width: '70%', height: '70%' }} stroke={1.5} />
            </ActionIcon>
          </ActionIconGroup>
          <Tree data={node} onSelect={onNodeSelect} onMove={onNodeMove} width={'100%'} height={1000}>
            {Node}
          </Tree>
        </AppShell.Navbar>

        <AppShell.Main>
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
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
};

export default withErrorBoundary(withSuspense(SidePanel, <div> Loading ... </div>), <div> Error Occur </div>);
