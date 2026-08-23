"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("@/components/dashboard"), { ssr: false });

export default function ClientPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Đang tải…</div>}>
      <Dashboard />
    </Suspense>
  );
}
