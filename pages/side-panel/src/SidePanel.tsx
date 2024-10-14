import '@src/SidePanel.css';
import '@mantine/core/styles.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { IOption } from '@visactor/react-vtable/es/tables/base-table';
import { InputEditor } from '@visactor/vtable-editors';
import * as VTable from '@visactor/vtable';
import { useState } from 'react';
import { csvContentStorage, csvNodeStorage } from '@extension/storage';
import { AppShell, Burger, MantineProvider } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { MoveHandler, NodeApi } from 'react-arborist';
import NavBar from './NavBar';
import { getTreeFromNode, moveNode } from './nodes';
import CsvEditor, { getOptionFromCsv } from './CsvEditor';

const inputEditor = new InputEditor();
VTable.register.editor('input-editor', inputEditor);

export const defaultOption = (): IOption => {
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

const SidePanel = () => {
  const [option, setOption] = useState<
    VTable.ListTableConstructorOptions | VTable.PivotTableConstructorOptions | VTable.PivotChartConstructorOptions
  >(defaultOption());
  const [node, setNode] = useState<any[]>([]);
  const [nodeSelected, setNodeSelected] = useState<NodeApi<{ name: string; type: string }> | null>(null);
  const [opened, { toggle }] = useDisclosure(true);
  const [csvName, setCsvName] = useState('');

  const onCsvNameUpdate: React.ChangeEventHandler<HTMLInputElement> = async event => {
    const csvName = event.currentTarget.value;
    setCsvName(csvName);
    if (nodeSelected === null) return;
    let csvNode = await csvNodeStorage.get();
    csvNode = updateNodeNameById(nodeSelected.id, csvName, csvNode);
    await csvNodeStorage.set(csvNode);
    await refreshTree();
  };
  const refreshTree = async () => {
    const csvNode = await csvNodeStorage.get();
    setNode(getTreeFromNode(csvNode));
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

  return (
    <MantineProvider>
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
          <NavBar
            node={node}
            setNode={setNode}
            nodeSelected={nodeSelected}
            onNodeSelect={onNodeSelect}
            onNodeMove={onNodeMove}
            refreshTree={refreshTree}
          />
        </AppShell.Navbar>

        <AppShell.Main>
          <CsvEditor
            nodeSelected={nodeSelected}
            option={option}
            setOption={setOption}
            csvName={csvName}
            onCsvNameUpdate={onCsvNameUpdate}
          />
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
};

export default withErrorBoundary(withSuspense(SidePanel, <div> Loading ... </div>), <div> Error Occur </div>);
