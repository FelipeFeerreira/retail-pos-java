export interface Product {
  id: number;
  version: number;
  code: string;
  barcode: string | null;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  unit: "UN" | "KG";
  price: number;
  cost: number;
  quantity: number;
  minimumStock: number;
  expiresOn: string | null;
  perishable: boolean;
  active: boolean;
}
export interface Customer {
  id: number;
  name: string;
  document: string | null;
  phone: string | null;
  creditLimit: number;
  balance: number;
  address: string | null;
  note: string | null;
  termDays: number | null;
  interestDay: number | null;
  penaltyDay: number | null;
  active: boolean;
}
export interface Category {
  id: number;
  name: string;
  markup: number | null;
}
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
}
export interface CartItem {
  product: Product;
  quantity: number;
  discount: number;
}
export interface Sale {
  id: number;
  createdAt: string;
  total: number;
  fees: number;
  status: string;
  customer: Customer | null;
  user: { username: string };
}
export interface Receipt {
  sale: Sale;
  items: {
    id: number;
    productName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    total: number;
  }[];
  payments: { method: string; amount: number; fee: number }[];
}
export interface Credit {
  id: number;
  createdAt: string;
  dueDate: string | null;
  amount: number;
  remaining: number;
  description: string;
  customer: Customer;
}
export interface Report {
  summary: { sales: number; revenue: number; fees: number; average: number };
  daily: { day: string; total: number; count: number }[];
  bestSellers: {
    id: number;
    name: string;
    quantity: number;
    total: number;
    gross_margin: number;
  }[];
  payments: { method: string; total: number; fees: number }[];
  stock: {
    id: number;
    name: string;
    unit: string;
    quantity: number;
    minimum_stock: number;
    expires_on: string;
    sold: number;
    turnover: number;
  }[];
  overdue: { id: number; name: string; balance: number; due_date: string }[];
  writeoffs: { kind: "LOSS" | "INTERNAL"; total: number }[];
}
export interface CashSession {
  id: number;
  user: { username: string };
  openedAt: string;
  openingAmount: number;
  status: "OPEN" | "CLOSED";
  closedAt: string | null;
  closedBy: { username: string } | null;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  notes: string | null;
}
export interface CashMovement {
  id: number;
  createdAt: string;
  user: { username: string };
  type: "WITHDRAWAL" | "SUPPLY";
  amount: number;
  reason: string;
}
export interface CashSummary {
  session: CashSession;
  sales: number;
  cancelled: number;
  salesTotal: number;
  payments: { method: string; total: number }[];
  cashSales: number;
  creditReceipts: number;
  supplies: number;
  withdrawals: number;
  expectedCash: number;
  movements: CashMovement[];
}
export interface Lot {
  id: number;
  productId: number;
  productName: string;
  unit: string;
  quantity: number;
  expiresOn: string | null;
  receivedAt: string;
  note: string;
  daysLeft: number | null;
}
export interface Writeoff {
  id: number;
  kind: "LOSS" | "INTERNAL";
  reason: string;
  note: string;
  createdAt: string;
  user: { username: string };
  totalCost: number;
  items: {
    id: number;
    productId: number;
    productName: string;
    unit: string;
    quantity: number;
    unitCost: number;
    total: number;
  }[];
}
export interface WriteoffSummary {
  today: number;
  week: number;
  month: number;
  byReason: { reason: string; count: number; total: number }[];
  reasons: string[];
}
