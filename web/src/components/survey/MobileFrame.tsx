import { ReactNode } from 'react';

interface MobileFrameProps {
  children: ReactNode;
}

export function MobileFrame({ children }: MobileFrameProps) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: '#f1f5f9',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '0',
      }}
    >
      {/* Mobile container */}
      <div
        style={{
          width: '100%',
          maxWidth: '430px',
          minHeight: '100dvh',
          backgroundColor: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxShadow: '0 0 40px rgba(0,0,0,0.12)',
        }}
      >
        {/* Page content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
