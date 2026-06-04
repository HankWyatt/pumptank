/* Renders a 16:9 YouTube embed. Tolerant of any common link form (Postel's Law):
   full embed URL, watch?v=, youtu.be/, or a bare 11-char video id all work, so
   data/products.json can carry whichever shape is convenient. Returns null when
   no url is given, so callers can gate the whole block on it. */
function toEmbedSrc(url: string): string | null {
  const s = url.trim();
  if (!s) return null;
  // bare 11-char id
  if (/^[\w-]{11}$/.test(s)) return `https://www.youtube-nocookie.com/embed/${s}`;
  let id = "";
  try {
    const u = new URL(s);
    if (u.hostname.includes("youtu.be")) id = u.pathname.slice(1);
    else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/embed/")[1];
    else id = u.searchParams.get("v") ?? "";
    id = id.split("/")[0].split("?")[0];
  } catch {
    return s; // not a parseable URL; hand it back untouched
  }
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : s;
}

export function EpisodeEmbed({ url }: { url: string | null }) {
  if (!url) return null;
  const src = toEmbedSrc(url);
  if (!src) return null;
  return (
    <div className="aspect-video">
      <iframe
        className="h-full w-full"
        src={src}
        title="Shark Tank pitch"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
