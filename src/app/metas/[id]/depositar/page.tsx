"use client";
import { useParams } from "next/navigation";
import GoalDepositFormPage from "@/components/GoalDepositFormPage";

export default function DepositarPage() {
  const { id } = useParams<{ id: string }>();
  return <GoalDepositFormPage goalId={id} />;
}
