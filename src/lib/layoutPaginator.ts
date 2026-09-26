import { AppIconConfig, WidgetConfig } from '../types';

export const PAGE_MAX_SLOTS = 12; // 3 rows of 4 columns = 12 slots max per page

export function getWidgetSlotCost(widget: WidgetConfig): number {
  switch (widget.type) {
    case 'calendar':
      return 8; // 2 full rows (8 slots)
    case 'weather':
    case 'menstrual':
    case 'memo':
    case 'photo':
    case 'time':
    case 'sticker':
    default:
      return 4; // 1 full row (4 slots)
  }
}

export interface PaginateResult {
  widgets: WidgetConfig[];
  icons: AppIconConfig[];
  pagesCount: number;
  hasChanged: boolean;
}

export function autoPaginateLayout(
  widgets: WidgetConfig[],
  icons: AppIconConfig[],
  currentPagesCount: number = 2
): PaginateResult {
  let hasChanged = false;

  // Find max pageIndex present in input
  let maxInputPageIndex = 0;
  widgets.forEach((w) => {
    if (typeof w.pageIndex === 'number' && w.pageIndex > maxInputPageIndex) {
      maxInputPageIndex = w.pageIndex;
    }
  });
  icons.forEach((i) => {
    if (typeof i.pageIndex === 'number' && i.pageIndex > maxInputPageIndex) {
      maxInputPageIndex = i.pageIndex;
    }
  });

  const totalInputPages = Math.max(currentPagesCount, maxInputPageIndex + 1, 1);

  const newWidgets: WidgetConfig[] = [];
  const newIcons: AppIconConfig[] = [];

  let currPage = 0;
  let currSlots = 0;

  for (let p = 0; p < totalInputPages; p++) {
    if (currPage < p) {
      currPage = p;
      currSlots = 0;
    }

    const pWidgets = widgets.filter((w) => (w.pageIndex ?? 0) === p);
    const pIcons = icons
      .filter((i) => (i.pageIndex ?? 0) === p)
      .sort((a, b) => (a.positionIndex ?? 0) - (b.positionIndex ?? 0));

    // Process widgets on input page p
    pWidgets.forEach((w) => {
      const cost = getWidgetSlotCost(w);
      if (currSlots + cost > PAGE_MAX_SLOTS && currSlots > 0) {
        currPage += 1;
        currSlots = 0;
      }

      if (w.pageIndex !== currPage) {
        hasChanged = true;
      }

      newWidgets.push({
        ...w,
        pageIndex: currPage,
      });

      currSlots += cost;
    });

    // Process icons on input page p (1 icon = 1 slot)
    pIcons.forEach((icon) => {
      const cost = 1;
      if (currSlots + cost > PAGE_MAX_SLOTS && currSlots > 0) {
        currPage += 1;
        currSlots = 0;
      }

      if (icon.pageIndex !== currPage) {
        hasChanged = true;
      }

      newIcons.push({
        ...icon,
        pageIndex: currPage,
      });

      currSlots += cost;
    });
  }

  const maxResultPageIndex = Math.max(
    ...newWidgets.map((w) => w.pageIndex),
    ...newIcons.map((i) => i.pageIndex),
    0
  );

  // Re-index positionIndex for icons per page
  const finalIcons: AppIconConfig[] = [];
  for (let p = 0; p <= maxResultPageIndex; p++) {
    const pageIcons = newIcons.filter((i) => i.pageIndex === p);
    pageIcons.forEach((icon, idx) => {
      if (icon.positionIndex !== idx) {
        hasChanged = true;
      }
      finalIcons.push({
        ...icon,
        positionIndex: idx,
      });
    });
  }

  const finalPagesCount = Math.max(1, maxResultPageIndex + 1);
  if (finalPagesCount !== currentPagesCount) {
    hasChanged = true;
  }

  return {
    widgets: newWidgets,
    icons: finalIcons,
    pagesCount: finalPagesCount,
    hasChanged,
  };
}
