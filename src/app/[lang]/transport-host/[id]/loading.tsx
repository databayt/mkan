import React from 'react';

export default function TransportHostLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" aria-hidden="true"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
