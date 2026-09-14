"use client";
import { useParams } from "next/navigation";
import InvestmentMoveFormPage from "@/components/InvestmentMoveFormPage";

export default function ResgatarPage() {
  const { id } = useParams<{ id: string }>();
  return <InvestmentMoveFormPage boxId={id} mode="resgatar" />;
}
