"use client";
import { use } from "react";
import { useApp } from "@/context/AppContext";
import AccountFormPage from "@/components/AccountFormPage";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function EditarContaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state } = useApp();
  const router = useRouter();

  const account = state.accounts.find(a => a.id === id);

  useEffect(() => {
    if (state.accounts.length > 0 && !account) router.replace("/contas");
  }, [account, state.accounts.length, router]);

  if (!account) return null;

  return <AccountFormPage account={account} />;
}
