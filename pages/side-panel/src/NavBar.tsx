import { csvContentStorage, csvNodeStorage } from '@extension/storage';
import { CsvNode } from '@extension/storage/lib/types';
import { ActionIcon, ActionIconGroup } from '@mantine/core';
import { IconBoxMultiple, IconFile, IconFolder, IconTrash } from '@tabler/icons-react';
import { MoveHandler, NodeApi, NodeRendererProps, Tree } from 'react-arborist';
import { addNode, copyNode, deleteNodeById, getTreeFromNode } from './nodes';
import { useEffect } from 'react';

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

interface NavBarProps {
  node: any[];
  setNode: React.Dispatch<React.SetStateAction<any[]>>;
  nodeSelected: NodeApi<{ name: string; type: string }> | null;
  onNodeSelect: (nodes: NodeApi<{ name: string; type: string }>[]) => Promise<void>;
  onNodeMove: MoveHandler<{ name: string; type: string }>;
  refreshTree: () => Promise<void>;
}

const NavBar: React.FC<NavBarProps> = ({ node, setNode, nodeSelected, onNodeSelect, onNodeMove, refreshTree }) => {
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

  useEffect(() => {
    (async () => {
      const csvNode = await csvNodeStorage.get();
      setNode(getTreeFromNode(csvNode));
      csvContentStorage.subscribe(async () => await refreshTree());
    })();
  }, []);

  return (
    <>
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
    </>
  );
};

export default NavBar;
