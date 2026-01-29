"use client";

import { useParams } from "next/navigation";

export default function TestPage() {
  const params = useParams();
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Test Page</h1>
      <p>ID: {params?.id}</p>
      <p>Lang: {params?.lang}</p>
    </div>
  );
}
