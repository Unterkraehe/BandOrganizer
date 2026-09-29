import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface VirtualListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Typical row height in px – with fixed-height rows this is exact, otherwise it's measured. */
  estimateSize: (item: T, index: number) => number;
  className?: string;
  /** Below this many items everything is rendered (no virtualization, simpler + always testable). */
  threshold?: number;
  overscan?: number;
}

/**
 * List of rows that only renders the rows around the viewport, scrolling with the page (window).
 * 300+ songs render in a few milliseconds instead of hundreds. Each row is wrapped in an <li>.
 */
export function VirtualList<T>({ items, getKey, renderItem, estimateSize, className, threshold = 60, overscan = 8 }: VirtualListProps<T>) {
  if (items.length <= threshold) {
    return (
      <ul className={className}>
        {items.map((item, i) => (
          <li key={getKey(item)} style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}>
            {renderItem(item, i)}
          </li>
        ))}
      </ul>
    );
  }
  return <Windowed items={items} getKey={getKey} renderItem={renderItem} estimateSize={estimateSize} className={className} overscan={overscan} />;
}

function Windowed<T>({ items, getKey, renderItem, estimateSize, className, overscan }: Omit<VirtualListProps<T>, 'threshold'>) {
  const ref = useRef<HTMLUListElement>(null);
  const [margin, setMargin] = useState(0);

  // Where the list starts in the document: recomputed when content above it changes height.
  const measure = () => {
    const el = ref.current;
    if (el) setMargin(Math.round(el.getBoundingClientRect().top + window.scrollY));
  };
  useLayoutEffect(measure);
  useEffect(() => {
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: (i) => estimateSize(items[i]!, i),
    overscan,
    scrollMargin: margin,
    getItemKey: (i) => getKey(items[i]!),
  });

  return (
    <ul ref={ref} className={className} style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => (
        <li
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          aria-setsize={items.length}
          aria-posinset={row.index + 1}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${row.start - margin}px)`,
            borderTop: row.index > 0 ? '1px solid var(--border)' : undefined,
          }}
        >
          {renderItem(items[row.index]!, row.index)}
        </li>
      ))}
    </ul>
  );
}
