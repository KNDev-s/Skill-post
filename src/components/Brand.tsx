import { Code2 } from 'lucide-react';
import { brand } from '../config/brand';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? 'compact' : ''}`}>
      {brand.logoUrl ? (
        <img src={brand.logoUrl} alt={brand.name} />
      ) : (
        <>
          <span className="brand-symbol">
            <Code2 size={22} strokeWidth={2.4} />
          </span>
          <span>
            KNDev<span className="brand-accent">'s</span>
          </span>
        </>
      )}
    </span>
  );
}
