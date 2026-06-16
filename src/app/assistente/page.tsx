"use client";
import { Suspense } from "react";
import AIPageContent from "@/components/AIPageContent";

export default function AssistentePage() {
  return (
    <Suspense fallback={null}>
      <AIPageContent />
    </Suspense>
  );
}
