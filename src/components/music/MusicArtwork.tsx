import { useEffect, useRef, useState } from 'react';
import { Music2 } from 'lucide-react';
import { fetchMusicArtwork } from '../../features/integrations/music-artwork';
export function MusicArtwork({ url }: { url: string | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [image, setImage] = useState<{ url: string; data: string } | null>(
    null,
  );
  useEffect(() => {
    if (!url || !ref.current) return;
    let alive = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void fetchMusicArtwork(url).then(
          (data) => {
            if (alive) setImage({ url, data });
          },
          () => {},
        );
      },
      { rootMargin: '80px' },
    );
    observer.observe(ref.current);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [url]);
  return (
    <span className="music-artwork" ref={ref}>
      {image?.url === url ? (
        <img src={image.data} alt="" />
      ) : (
        <Music2 size={20} />
      )}
    </span>
  );
}
