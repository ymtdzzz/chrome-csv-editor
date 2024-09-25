import { toggleTheme } from '@src/toggleTheme';

console.log('content script loaded');

void toggleTheme();

var clickedElement: HTMLInputElement | null = null;

document.addEventListener(
  'contextmenu',
  ev => {
    clickedElement = ev.target as HTMLInputElement;
  },
  true,
);

const isElemFileInput = () => {
  if (clickedElement === null) return false;
  return clickedElement.getAttribute('type') === 'file';
};

chrome.runtime.onMessage.addListener(request => {
  console.log('mesasge from background', request);
  const msg = JSON.parse(request);
  if (msg.type === 'attach-csv') {
    if (clickedElement === null || !isElemFileInput()) {
      console.log('selected element is null or not file input so do nothing');
      return;
    }
    const csv = msg.csv as string;
    const myCsv = csv
      .split(/\r?\n/)
      .map(line => (line.endsWith(',') ? line.slice(0, -1) : line))
      .join('\n');
    const myFile = new File([myCsv], `${msg.name}.csv`);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(myFile);
    const fileList = dataTransfer.files;
    clickedElement.files = fileList;
    clickedElement.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('attached csv\n', myCsv);
  }
});
