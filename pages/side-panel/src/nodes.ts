import { CsvNode } from '@extension/storage/lib/types';

export const getTreeFromNode = (input: CsvNode[]): any[] => {
  return input.map(node => {
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      children: getTreeFromNode(node.children),
    };
  });
};

export const getNodeFromTree = (input: any[]): CsvNode[] => {
  return input.map(node => {
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      children: getNodeFromTree(node.children),
    };
  });
};

export const moveNode = (nodes: CsvNode[], targetId: string, parentId: string | null, destIndex: number) => {
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

export const addNode = (nodes: CsvNode[], selectedNodeId: string, newNode: CsvNode) => {
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

export const copyNode = (nodes: CsvNode[], copiedNode: CsvNode, selectedNodeId: string) => {
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

export const deleteNodeById = (nodes: CsvNode[], csvContent: CsvContent, id: string): [CsvNode[], CsvContent] => {
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
