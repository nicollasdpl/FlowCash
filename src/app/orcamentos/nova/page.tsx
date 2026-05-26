"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { currentMonth } from "@/engine/financialEngine";
import BudgetFormPage from "@/components/BudgetFormPage";

function Content() {
  const searchParams = useSearchParams();
  const month = searchParams.get("month") ?? currentMonth();
  return <BudgetFormPage month={month} />;
}

export default function NovoOrcamentoPage() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
