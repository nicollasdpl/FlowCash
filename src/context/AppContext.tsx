"use client";
import {
  createContext, useContext, useReducer, useEffect,
  useState, ReactNode,
} from "react";
import type { User } from "firebase/auth";
import {
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider,
  signOut as fbSignOut,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type {
  Account, Transaction, CreditCard, CardPurchase, CardInstallment,
  Goal, Category, Budget,
} from "@/types/financial";
import { generateInstallments } from "@/engine/invoiceEngine";

export type {
  Account, Transaction, CreditCard, CardPurchase, CardInstallment,
  Goal, Category, Budget,
};

// ─── STATE ────────────────────────────────────────────────────────────────────

interface AppState {
  userName: string;
  accounts: Account[];
  transactions: Transaction[];
  cards: CreditCard[];
  purchases: CardPurchase[];
  installments: CardInstallment[];
  goals: Goal[];
  categories: Category[];
  budgets: Budget[];
}

type Action =
  | { type: "LOAD"; payload: AppState }
  | { type: "SET_USER_NAME"; payload: string }
  | { type: "ADD_ACCOUNT"; payload: Account }
  | { type: "UPD_ACCOUNT"; payload: Account }
  | { type: "DEL_ACCOUNT"; payload: string }
  | { type: "ADD_TX"; payload: Transaction }
  | { type: "UPD_TX"; payload: Transaction }
  | { type: "DEL_TX"; payload: string }
  | { type: "ADD_CARD"; payload: CreditCard }
  | { type: "UPD_CARD"; payload: CreditCard }
  | { type: "DEL_CARD"; payload: string }
  | { type: "ADD_PURCHASE"; payload: { purchase: CardPurchase; card: CreditCard } }
  | { type: "DEL_PURCHASE"; payload: string }
  | { type: "PAY_INSTALLMENT"; payload: { installmentId: string; paidAt: string } }
  | { type: "UNPAY_INSTALLMENT"; payload: string }
  | { type: "ADD_GOAL"; payload: Goal }
  | { type: "UPD_GOAL"; payload: Goal }
  | { type: "DEL_GOAL"; payload: string }
  | { type: "ADD_BUDGET"; payload: Budget }
  | { type: "UPD_BUDGET"; payload: Budget }
  | { type: "DEL_BUDGET"; payload: string };

// ─── SEED ─────────────────────────────────────────────────────────────────────

const SEED_CATEGORIES: Category[] = [
  { id: "cat_alimentacao", name: "Alimentação",   type: "expense", color: "#00E5C3", icon: "🍔" },
  { id: "cat_transporte",  name: "Transporte",    type: "expense", color: "#4B8BF5", icon: "🚗" },
  { id: "cat_lazer",       name: "Lazer",         type: "expense", color: "#9B6DFF", icon: "🎮" },
  { id: "cat_saude",       name: "Saúde",         type: "expense", color: "#22D47A", icon: "💊" },
  { id: "cat_moradia",     name: "Moradia",       type: "expense", color: "#F5A623", icon: "🏠" },
  { id: "cat_educacao",    name: "Educação",      type: "expense", color: "#FF8C42", icon: "📚" },
  { id: "cat_vestuario",   name: "Vestuário",     type: "expense", color: "#FF4D6A", icon: "👕" },
  { id: "cat_eletronicos", name: "Eletrônicos",   type: "expense", color: "#4B8BF5", icon: "📱" },
  { id: "cat_outros",      name: "Outros",        type: "expense", color: "#6B7FA3", icon: "📦" },
  { id: "cat_salario",     name: "Salário",       type: "income",  color: "#22D47A", icon: "💰" },
  { id: "cat_freelance",   name: "Freelance",     type: "income",  color: "#00E5C3", icon: "💻" },
  { id: "cat_investimento",name: "Investimentos", type: "income",  color: "#F5A623", icon: "📈" },
];

const seed: AppState = {
  userName: "",
  accounts: [],
  transactions: [],
  cards: [],
  purchases: [],
  installments: [],
  goals: [],
  categories: SEED_CATEGORIES,
  budgets: [],
};

// ─── REDUCER ──────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOAD":
      return { ...seed, ...action.payload };
    case "SET_USER_NAME":
      return { ...state, userName: action.payload };

    case "ADD_ACCOUNT":
      return { ...state, accounts: [...state.accounts, action.payload] };
    case "UPD_ACCOUNT":
      return { ...state, accounts: state.accounts.map(a => a.id === action.payload.id ? action.payload : a) };
    case "DEL_ACCOUNT":
      return { ...state, accounts: state.accounts.filter(a => a.id !== action.payload) };

    case "ADD_TX":
      return { ...state, transactions: [action.payload, ...state.transactions] };
    case "UPD_TX":
      return { ...state, transactions: state.transactions.map(t => t.id === action.payload.id ? action.payload : t) };
    case "DEL_TX":
      return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload) };

    case "ADD_CARD":
      return { ...state, cards: [...state.cards, action.payload] };
    case "UPD_CARD":
      return { ...state, cards: state.cards.map(c => c.id === action.payload.id ? action.payload : c) };
    case "DEL_CARD":
      return {
        ...state,
        cards: state.cards.filter(c => c.id !== action.payload),
        purchases: state.purchases.filter(p => p.cardId !== action.payload),
        installments: state.installments.filter(i => i.cardId !== action.payload),
      };

    case "ADD_PURCHASE": {
      const { purchase, card } = action.payload;
      const newInstallments = generateInstallments(purchase, card, state.installments);
      return {
        ...state,
        purchases: [...state.purchases, purchase],
        installments: [...state.installments, ...newInstallments],
      };
    }
    case "DEL_PURCHASE":
      return {
        ...state,
        purchases: state.purchases.filter(p => p.id !== action.payload),
        installments: state.installments.filter(i => i.purchaseId !== action.payload),
      };

    case "PAY_INSTALLMENT":
      return {
        ...state,
        installments: state.installments.map(i =>
          i.id === action.payload.installmentId
            ? { ...i, paid: true, paidAt: action.payload.paidAt }
            : i
        ),
      };
    case "UNPAY_INSTALLMENT":
      return {
        ...state,
        installments: state.installments.map(i =>
          i.id === action.payload ? { ...i, paid: false, paidAt: undefined } : i
        ),
      };

    case "ADD_GOAL":
      return { ...state, goals: [...state.goals, action.payload] };
    case "UPD_GOAL":
      return { ...state, goals: state.goals.map(g => g.id === action.payload.id ? action.payload : g) };
    case "DEL_GOAL":
      return { ...state, goals: state.goals.filter(g => g.id !== action.payload) };

    case "ADD_BUDGET":
      return { ...state, budgets: [...state.budgets, action.payload] };
    case "UPD_BUDGET":
      return { ...state, budgets: state.budgets.map(b => b.id === action.payload.id ? action.payload : b) };
    case "DEL_BUDGET":
      return { ...state, budgets: state.budgets.filter(b => b.id !== action.payload) };

    default:
      return state;
  }
}

// ─── CONTEXT ──────────────────────────────────────────────────────────────────

interface CtxType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  user: User | null;
  authLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<CtxType | null>(null);

const FIRESTORE_DOC = (uid: string) => doc(db, "users", uid, "app", "state");

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, seed);
  const [user, setUser]   = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isReady, setIsReady]         = useState(false);

  // ── Auth listener + initial load ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          const snap = await getDoc(FIRESTORE_DOC(firebaseUser.uid));
          if (snap.exists()) {
            dispatch({ type: "LOAD", payload: snap.data() as AppState });
          } else {
            // First login — try to migrate localStorage data
            try {
              const local = localStorage.getItem("flowcash_v2");
              if (local) dispatch({ type: "LOAD", payload: JSON.parse(local) });
            } catch {}
          }
        } catch (err) {
          console.error("Firestore load error:", err);
          try {
            const local = localStorage.getItem("flowcash_v2");
            if (local) dispatch({ type: "LOAD", payload: JSON.parse(local) });
          } catch {}
        }
      } else {
        dispatch({ type: "LOAD", payload: seed });
      }

      setAuthLoading(false);
      setIsReady(true);
    });

    return () => unsub();
  }, []);

  // ── Auto-save to Firestore (debounced 1.5s) ───────────────────────────────
  useEffect(() => {
    if (!isReady || !user) return;

    const timer = setTimeout(async () => {
      try {
        await setDoc(FIRESTORE_DOC(user.uid), state);
        localStorage.setItem("flowcash_v2", JSON.stringify(state));
      } catch (err) {
        console.error("Firestore save error:", err);
        localStorage.setItem("flowcash_v2", JSON.stringify(state));
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [state, user, isReady]);

  // ── Auth actions ──────────────────────────────────────────────────────────
  async function signIn() {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }

  async function signOut() {
    await fbSignOut(auth);
    setIsReady(false);
    dispatch({ type: "LOAD", payload: seed });
  }

  return (
    <Ctx.Provider value={{ state, dispatch, user, authLoading, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}

export function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const CARD_COLORS    = ["#9B6DFF", "#4B8BF5", "#00E5C3", "#22D47A", "#F5A623", "#FF4D6A", "#FF8C42"];
export const ACCOUNT_COLORS = ["#22D47A", "#4B8BF5", "#00E5C3", "#9B6DFF", "#F5A623", "#FF8C42"];
export const ACCOUNT_ICONS  = ["🏦", "💰", "👛", "📈", "💳", "🏧"];
