import type { CategoryOption } from "../types";

export const defaultCategories: CategoryOption[] = [
  {
    id: "food",
    name: "Food",
    color: "#ff8d61",
    keywords: ["food", "meal", "sandwich", "burger", "rice", "ramen", "noodle", "lunch", "dinner"]
  },
  {
    id: "drinks",
    name: "Drinks",
    color: "#3cbde6",
    keywords: ["drink", "coffee", "tea", "juice", "latte", "espresso", "frappe", "zus", "luckin"]
  },
  {
    id: "groceries",
    name: "Groceries",
    color: "#59b860",
    keywords: ["mart", "grocery", "grocer", "tesco", "aeon", "jaya", "lotus", "supermarket"]
  },
  {
    id: "transport",
    name: "Transport",
    color: "#5075ff",
    keywords: ["grab", "lrt", "mrt", "taxi", "toll", "parking", "petrol", "fuel"]
  },
  {
    id: "bills",
    name: "Bills",
    color: "#f2b34a",
    keywords: ["utility", "electric", "water", "internet", "phone", "maxis", "celcom", "unifi", "bill"]
  },
  {
    id: "shopping",
    name: "Shopping",
    color: "#d873d8",
    keywords: ["shop", "mall", "shopee", "lazada", "fashion", "retail", "purchase"]
  },
  {
    id: "health",
    name: "Health",
    color: "#00a8a0",
    keywords: ["clinic", "hospital", "pharmacy", "medicine", "health", "dental"]
  },
  {
    id: "others",
    name: "Others",
    color: "#9298a6",
    keywords: []
  }
];

const customColorPalette = ["#f15b5d", "#ef8a2f", "#00a9a5", "#1882d9", "#43a047", "#d45ab4"];

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function pickCategoryColor(name: string): string {
  const asciiSum = [...name.toLowerCase()].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return customColorPalette[asciiSum % customColorPalette.length];
}

export function makeCustomCategory(name: string): CategoryOption {
  const safeName = normalizeCategoryName(name);
  const id = `custom-${safeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return {
    id,
    name: safeName,
    color: pickCategoryColor(safeName),
    keywords: [],
    custom: true
  };
}

export function findCategoryByName(categories: CategoryOption[], name: string): CategoryOption | undefined {
  return categories.find((item) => item.name.toLowerCase() === name.trim().toLowerCase());
}
