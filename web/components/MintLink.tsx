export function MintLink({ mint }: { mint: string | null }) {
  if (!mint) return <span className="text-muted">Launching soon</span>;
  return (
    <a className="text-accent underline" href={`https://pump.fun/${mint}`} target="_blank" rel="noopener noreferrer">
      Trade on pump.fun
    </a>
  );
}
