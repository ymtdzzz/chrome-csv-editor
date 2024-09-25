import 'webextension-polyfill';
import { csvContentStorage, csvNodeStorage, exampleThemeStorage } from '@extension/storage';
import { randomUUID } from 'crypto';
import { CsvNode } from '@extension/storage/lib/types';

exampleThemeStorage.get().then(theme => {
  console.log('theme', theme);
});

csvNodeStorage.subscribe(() => updateContextMenu());

console.log('service worker started');

chrome.runtime.onInstalled.addListener(() => {
  updateContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const key = '456389ce-0bcb-4b8c-af2b-24ba7e163ebb';
  if (tab !== undefined) {
    switch (info.menuItemId) {
      case 'download-csv':
        if (info.linkUrl !== undefined) {
          const res = await fetch(info.linkUrl, {
            method: 'GET',
            mode: 'cors',
          });
          const type = res.headers.get('Content-Type');
          if (type !== null && type === 'text/csv') {
            const csvBlob = await res.blob();
            const csvText = await csvBlob.text();
            const csvContent = await csvContentStorage.get();
            const csvNode = await csvNodeStorage.get();
            const key = randomUUID();
            csvContent[key] = {
              content: csvText,
            };
            csvNode.push({
              id: key,
              name: 'Downloaded CSV (TODO: add timestamp)',
              type: 'file',
              children: [],
            });
            console.log(csvNode);
            await csvContentStorage.set(csvContent);
            await csvNodeStorage.set(csvNode);
            console.log(`saved csv(id: ${key}): ${csvContent[key]}`);
          } else {
            console.log('invalid Content-Type in the response header');
          }
        }
        break;
      case 'attach-csv':
        const csvContent = await csvContentStorage.get();
        chrome.tabs.sendMessage(
          tab.id as number,
          JSON.stringify({
            type: 'attach-csv',
            csv: csvContent[key]['content'],
          }),
        );
        break;
    }

    const match = info.menuItemId.toString().match(/attach-csv-(.+)/);
    if (match && match.length === 2) {
      const key = match[1];
      const csvContent = await csvContentStorage.get();
      const csvNode = await csvNodeStorage.get();
      const name = getNodeNameById(csvNode, key);
      if (!name) return;

      chrome.tabs.sendMessage(
        tab.id as number,
        JSON.stringify({
          type: 'attach-csv',
          name: name,
          csv: csvContent[key]['content'],
        }),
      );
    }
  }
});

const getNodeNameById = (nodes: CsvNode[], id: string): string | null => {
  for (const node of nodes) {
    if (node.id === id) {
      return node.name;
    }
    if (node.children) {
      const result = getNodeNameById(node.children, id);
      if (result) {
        return result;
      }
    }
  }
  return null;
};

const updateContextMenu = async () => {
  chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'download-csv',
    title: 'リンク先をcsv-editorに保存',
    contexts: ['link'],
  });
  chrome.contextMenus.create({
    id: 'attach-csv',
    title: 'フォームにCSVをセット(test)',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'attach-csv-root',
    title: 'フォームにCSVをセット',
    contexts: ['page'],
  });

  const csvNode = await csvNodeStorage.get();
  generateContextMenu(csvNode, 'attach-csv-root');
};

const generateContextMenu = (nodes: CsvNode[], parentId: string) => {
  nodes.forEach(node => {
    const menuId = chrome.contextMenus.create({
      id: `attach-csv-${node.id}`,
      title: node.name,
      parentId: parentId,
      contexts: ['page'],
    });

    if (node.children && node.children.length > 0) {
      generateContextMenu(node.children, menuId as string);
    }
  });
};
