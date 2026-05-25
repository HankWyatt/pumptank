export function EpisodeEmbed({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div className="aspect-video">
      <iframe className="h-full w-full" src={url} title="Shark Tank episode"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen />
    </div>
  );
}
