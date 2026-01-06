import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dimensions: string[] }> }
) {
  const { dimensions } = await params;
  const width = parseInt(dimensions?.[0] ?? '400') || 400;
  const height = parseInt(dimensions?.[1] ?? '300') || 300;

  // Create SVG placeholder
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#f3f4f6"/>
      <text
        text-anchor="middle"
        x="${width / 2}"
        y="${height / 2}"
        style="fill:#9ca3af;font-size:${Math.min(width, height) / 10}px;font-family:Arial,sans-serif"
      >
        ${width} × ${height}
      </text>
    </svg>
  `;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}