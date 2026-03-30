export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 100 : size === 'sm' ? 60 : 80;

  return (
    <div className="flex flex-col items-center gap-1">
      <img
        src="/favicon.png"
        alt="KOMISS Logo"
        width={dim}
        height={dim}
        style={{ objectFit: 'contain' }}
      />
      {size !== 'sm' && (
        <p
          style={{
            fontSize: '11px',
            color: '#555',
            letterSpacing: '0.5px',
            marginTop: '2px',
          }}
        >
          KOMISS &amp; KSOR
        </p>
      )}
    </div>
  );
}
