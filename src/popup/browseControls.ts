// The browse-at-rest controls (sort + folder scope): two quiet text triggers
// that open styled dropdowns (dropdown.ts). This module owns the chosen
// values and the trigger labels; popup.ts owns what a change means (re-running
// browse) via the onChange callback.
import type { BrowseSort } from '../core/search';
import { openDropdown } from './dropdown';

const SORT_OPTIONS: readonly { label: string; value: BrowseSort }[] = [
  { label: 'Recent', value: 'recent' },
  { label: 'Name', value: 'name' },
];

export type BrowseControls = {
  sort(): BrowseSort;
  folder(): string;
  /** True while scoped to a folder — the footer shows "N of M" then. */
  isScoped(): boolean;
  /** Refreshes the folder dropdown's options from the latest browse response;
   * a vanished chosen folder (deleted, excluded) falls back to everything. */
  setFolders(folders: string[]): void;
};

export function initBrowseControls(args: {
  sortBtn: HTMLButtonElement;
  folderBtn: HTMLButtonElement;
  onChange: () => void;
}): BrowseControls {
  const { sortBtn, folderBtn, onChange } = args;
  let sortValue: BrowseSort = 'recent';
  /** '' = whole library; otherwise a full folderPath scoping to its subtree. */
  let folderValue = '';
  let folderList: string[] = [];

  /** The visible text of each quiet trigger mirrors the current choice. */
  const syncLabels = (): void => {
    const sortLabel = document.querySelector('#sort-label');
    const folderLabel = document.querySelector('#folder-label');
    if (sortLabel) {
      sortLabel.textContent = SORT_OPTIONS.find((o) => o.value === sortValue)?.label ?? 'Recent';
    }
    if (folderLabel) folderLabel.textContent = folderValue || 'All folders';
  };

  sortBtn.addEventListener('click', () =>
    openDropdown({
      trigger: sortBtn,
      options: SORT_OPTIONS.map((o) => ({ ...o })),
      selectedValue: sortValue,
      onSelect: (value) => {
        sortValue = value === 'name' ? 'name' : 'recent';
        syncLabels();
        onChange();
      },
    }),
  );

  folderBtn.addEventListener('click', () =>
    openDropdown({
      trigger: folderBtn,
      options: [
        { label: 'All folders', value: '' },
        // Long paths clip from the START so the deepest (identifying) folder
        // segment stays visible — same rule as the detail card's folder line.
        ...folderList.map((path) => ({ label: path, value: path, clipStart: true })),
      ],
      selectedValue: folderValue,
      onSelect: (value) => {
        folderValue = value;
        syncLabels();
        onChange();
      },
    }),
  );

  return {
    sort: () => sortValue,
    folder: () => folderValue,
    isScoped: () => folderValue !== '',
    setFolders: (folders) => {
      folderList = folders;
      if (folderValue && !folders.includes(folderValue)) {
        folderValue = '';
        syncLabels();
      }
    },
  };
}
