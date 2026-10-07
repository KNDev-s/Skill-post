import { ArrowUpRight, ImageOff } from 'lucide-react';
import { useState } from 'react';
import type { Slide } from '../types/post';

export function SlidePreview({
  slide,
  index,
  total,
  miniature = false,
}: {
  slide: Slide;
  index: number;
  total: number;
  miniature?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const imageFailed = slide.imageUrl && failedUrl === slide.imageUrl;
  return (
    <div className={`slide-art ${slide.layout} ${miniature ? 'miniature' : ''}`}>
      {slide.imageUrl && !imageFailed ? (
        <img
          className="rendered-slide"
          src={slide.imageUrl}
          alt={`Slide ${index + 1}: ${slide.title}`}
          onError={() => setFailedUrl(slide.imageUrl)}
        />
      ) : (
        <>
          <div className="slide-top">
            <span>
              <img src="/brand/logo-dark.png" alt="KNDev's Solutions" />
            </span>
            <span>IDEIAS EM MOVIMENTO</span>
          </div>
          <div className="slide-copy">
            <span className="slide-kicker">
              {slide.layout === 'cover'
                ? 'TECNOLOGIA + NEGÓCIOS'
                : slide.layout === 'closing'
                  ? 'VAMOS CONVERSAR?'
                  : `INSIGHT ${String(index).padStart(2, '0')}`}
            </span>
            <h3>{slide.title}</h3>
            <p>{slide.body}</p>
          </div>
          <div className="slide-bottom">
            <span>
              {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </span>
            <ArrowUpRight />
          </div>
          {imageFailed && !miniature && (
            <span className="image-error">
              <ImageOff size={12} /> Imagem indisponível · preview textual
            </span>
          )}
        </>
      )}
    </div>
  );
}
