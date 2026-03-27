export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 100 : size === 'sm' ? 60 : 80;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <path
            id="topCircle"
            d="M 60,60 m -44,0 a 44,44 0 1,1 88,0"
            fill="none"
          />
          <path
            id="bottomCircle"
            d="M 60,60 m -44,0 a 44,44 0 0,0 88,0"
            fill="none"
          />
        </defs>

        {/* Outer background circle */}
        <circle cx="60" cy="60" r="56" fill="white" stroke="#1B4F8A" strokeWidth="2.5" />
        <circle cx="60" cy="60" r="50" fill="none" stroke="#1B4F8A" strokeWidth="1" />

        {/* Circular text - top arc */}
        <text fontSize="7" fill="#1B4F8A" fontFamily="Arial, sans-serif" fontWeight="600" letterSpacing="0.5">
          <textPath href="#topCircle" startOffset="8%">
            Korean Minimally Invasive Spine
          </textPath>
        </text>

        {/* Circular text - bottom arc */}
        <text fontSize="7" fill="#1B4F8A" fontFamily="Arial, sans-serif" fontWeight="600" letterSpacing="0.5">
          <textPath href="#bottomCircle" startOffset="18%">
            Society · 2018
          </textPath>
        </text>

        {/* Spine vertebrae design */}
        <g transform="translate(60, 52)">
          {/* Vertebrae boxes */}
          <rect x="-12" y="-30" width="24" height="11" rx="2" fill="#1B4F8A" opacity="0.85" />
          <rect x="-10" y="-17" width="20" height="10" rx="2" fill="#1B4F8A" opacity="0.75" />
          <rect x="-11" y="-5" width="22" height="10" rx="2" fill="#1B4F8A" opacity="0.65" />
          <rect x="-10" y="7" width="20" height="10" rx="2" fill="#1B4F8A" opacity="0.55" />
          {/* Center canal line */}
          <line x1="0" y1="-30" x2="0" y2="17" stroke="white" strokeWidth="2" />
          {/* Small flag/emblem in center */}
          <rect x="-5" y="-28" width="10" height="7" rx="1" fill="#C8372D" />
          <rect x="-5" y="-21" width="10" height="3" rx="1" fill="#1B4F8A" />
        </g>

        {/* KOMISS text */}
        <text
          x="60"
          y="96"
          textAnchor="middle"
          fontSize="8.5"
          fill="#1B4F8A"
          fontFamily="Arial, sans-serif"
          fontWeight="bold"
          letterSpacing="1"
        >
          KOMISS
        </text>
      </svg>

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
